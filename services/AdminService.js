/**
 * Admin Service
 *
 * Handles admin operations: approving submissions, processing withdrawals, managing ads
 */

import { v4 as uuidv4 } from "uuid";
import LedgerService from "./LedgerService.js";
import {
  SUBMISSION_STATUS,
  WITHDRAWAL_STATUS,
  AD_STATUS,
  TRANSACTION_TYPES,
  REFERENCE_TYPES,
  ADMIN_ACTIONS,
  RESOURCE_TYPES,
} from "../utils/constants.js";
import {
  ValidationError,
  NotFoundError,
  InvalidStateError,
  DatabaseError,
} from "../utils/errors.js";

class AdminService {
  constructor(dbClient) {
    this.db = dbClient;
    this.ledgerService = new LedgerService(dbClient);
  }

  /**
   * Get pending submissions queue
   */
  async getPendingSubmissions({ limit = 50, offset = 0, status = null } = {}) {
    let query = `
      SELECT 
        s.id,
        s.user_id,
        s.ad_id,
        s.proof_url,
        s.status,
        s.created_at,
        u.email as user_email,
        u.phone as user_phone,
        a.title as ad_title,
        a.payout_per_view,
        a.advertiser
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN ads a ON s.ad_id = a.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND s.status = $${params.length + 1}`;
      params.push(status);
    } else {
      // Default: show only pending and under_review
      query += ` AND s.status IN ($${params.length + 1}, $${
        params.length + 2
      })`;
      params.push(SUBMISSION_STATUS.PENDING, SUBMISSION_STATUS.UNDER_REVIEW);
    }

    query += ` ORDER BY s.created_at ASC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      userPhone: row.user_phone,
      adId: row.ad_id,
      adTitle: row.ad_title,
      advertiser: row.advertiser,
      payoutAmount: parseFloat(row.payout_per_view),
      proofUrl: row.proof_url,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Approve submission and pay user
   */
  async approveSubmission(submissionId, adminId) {
    return await this.db.transaction(async (tx) => {
      // 1. Lock and get submission
      const subResult = await tx.query(
        "SELECT * FROM submissions WHERE id = $1 FOR UPDATE",
        [submissionId]
      );

      if (subResult.rows.length === 0) {
        throw new NotFoundError("Submission", submissionId);
      }

      const submission = subResult.rows[0];

      // 2. Validate state
      if (submission.status === SUBMISSION_STATUS.APPROVED) {
        throw new InvalidStateError(submission.status, "approved");
      }

      if (submission.status === SUBMISSION_STATUS.REJECTED) {
        throw new InvalidStateError(submission.status, "approved");
      }

      // Move to under_review first if pending
      if (submission.status === SUBMISSION_STATUS.PENDING) {
        await tx.query("UPDATE submissions SET status = $1 WHERE id = $2", [
          SUBMISSION_STATUS.UNDER_REVIEW,
          submissionId,
        ]);
      }

      // 3. Get ad payout amount
      const adResult = await tx.query(
        "SELECT payout_per_view FROM ads WHERE id = $1",
        [submission.ad_id]
      );

      if (adResult.rows.length === 0) {
        throw new NotFoundError("Ad", submission.ad_id);
      }

      const payoutAmount = parseFloat(adResult.rows[0].payout_per_view);

      // 4. Create ledger entry (pays user)
      await this.ledgerService.createEntry(tx, {
        userId: submission.user_id,
        type: TRANSACTION_TYPES.AD_PAYOUT,
        amount: payoutAmount,
        referenceType: REFERENCE_TYPES.SUBMISSION,
        referenceId: submissionId,
        metadata: {
          adId: submission.ad_id,
          approvedBy: adminId,
          approvalDate: new Date().toISOString(),
        },
      });

      // 5. Update submission status
      await tx.query(
        `UPDATE submissions 
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [SUBMISSION_STATUS.APPROVED, adminId, submissionId]
      );

      // 6. Increment ad total_views
      await tx.query(
        "UPDATE ads SET total_views = total_views + 1, updated_at = NOW() WHERE id = $1",
        [submission.ad_id]
      );

      // 7. Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.APPROVE_SUBMISSION,
        resourceType: RESOURCE_TYPES.SUBMISSION,
        resourceId: submissionId,
        details: {
          userId: submission.user_id,
          adId: submission.ad_id,
          payoutAmount,
        },
      });

      return {
        submissionId,
        status: SUBMISSION_STATUS.APPROVED,
        payoutAmount,
        userId: submission.user_id,
      };
    });
  }

  /**
   * Reject submission
   */
  async rejectSubmission(submissionId, adminId, reason) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError(
        "Rejection reason must be at least 10 characters"
      );
    }

    return await this.db.transaction(async (tx) => {
      // 1. Lock and get submission
      const subResult = await tx.query(
        "SELECT * FROM submissions WHERE id = $1 FOR UPDATE",
        [submissionId]
      );

      if (subResult.rows.length === 0) {
        throw new NotFoundError("Submission", submissionId);
      }

      const submission = subResult.rows[0];

      // 2. Validate state
      if (submission.status === SUBMISSION_STATUS.APPROVED) {
        throw new InvalidStateError(submission.status, "rejected");
      }

      if (submission.status === SUBMISSION_STATUS.REJECTED) {
        throw new InvalidStateError(submission.status, "rejected");
      }

      // Move to under_review first if pending
      if (submission.status === SUBMISSION_STATUS.PENDING) {
        await tx.query("UPDATE submissions SET status = $1 WHERE id = $2", [
          SUBMISSION_STATUS.UNDER_REVIEW,
          submissionId,
        ]);
      }

      // 3. Update submission status
      await tx.query(
        `UPDATE submissions 
         SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [SUBMISSION_STATUS.REJECTED, reason, adminId, submissionId]
      );

      // 4. Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.REJECT_SUBMISSION,
        resourceType: RESOURCE_TYPES.SUBMISSION,
        resourceId: submissionId,
        details: { userId: submission.user_id, reason },
      });

      return {
        submissionId,
        status: SUBMISSION_STATUS.REJECTED,
        reason,
      };
    });
  }

  /**
   * Get pending withdrawals queue
   */
  async getPendingWithdrawals({ limit = 50, offset = 0, status = null } = {}) {
    let query = `
      SELECT 
        w.id,
        w.user_id,
        w.amount,
        w.method,
        w.payment_details,
        w.status,
        w.created_at,
        u.email as user_email,
        u.phone as user_phone,
        u.balance as user_balance
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND w.status = $${params.length + 1}`;
      params.push(status);
    } else {
      // Default: show only pending
      query += ` AND w.status = $${params.length + 1}`;
      params.push(WITHDRAWAL_STATUS.PENDING);
    }

    query += ` ORDER BY w.created_at ASC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      userPhone: row.user_phone,
      userBalance: parseFloat(row.user_balance),
      amount: parseFloat(row.amount),
      method: row.method,
      paymentDetails: row.payment_details,
      status: row.status,
      createdAt: row.created_at,
    }));
  }
}
