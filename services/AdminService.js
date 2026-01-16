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

  /**
   * Process withdrawal (mark as processing and deduct balance)
   */
  async processWithdrawal(withdrawalId, adminId) {
    return await this.db.transaction(async (tx) => {
      // 1. Lock and get withdrawal
      const wResult = await tx.query(
        "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
        [withdrawalId]
      );

      if (wResult.rows.length === 0) {
        throw new NotFoundError("Withdrawal", withdrawalId);
      }

      const withdrawal = wResult.rows[0];

      // 2. Validate state
      if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
        throw new InvalidStateError(withdrawal.status, "processing");
      }

      // 3. Create ledger entry (debit user balance)
      await this.ledgerService.createEntry(tx, {
        userId: withdrawal.user_id,
        type: TRANSACTION_TYPES.WITHDRAWAL,
        amount: -parseFloat(withdrawal.amount), // NEGATIVE
        referenceType: REFERENCE_TYPES.WITHDRAWAL,
        referenceId: withdrawalId,
        metadata: {
          processedBy: adminId,
          method: withdrawal.method,
        },
      });

      // 4. Update withdrawal status
      await tx.query(
        `UPDATE withdrawals 
         SET status = $1, processed_by = $2, processed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [WITHDRAWAL_STATUS.PROCESSING, adminId, withdrawalId]
      );

      // 5. Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.PROCESS_WITHDRAWAL,
        resourceType: RESOURCE_TYPES.WITHDRAWAL,
        resourceId: withdrawalId,
        details: { userId: withdrawal.user_id, amount: withdrawal.amount },
      });

      return {
        withdrawalId,
        status: WITHDRAWAL_STATUS.PROCESSING,
        userId: withdrawal.user_id,
        amount: parseFloat(withdrawal.amount),
      };
    });
  }

  /**
   * Complete withdrawal (mark as paid)
   */
  async completeWithdrawal(withdrawalId, adminId, transactionHash) {
    if (!transactionHash || transactionHash.trim().length < 5) {
      throw new ValidationError("Transaction hash is required");
    }

    return await this.db.transaction(async (tx) => {
      // 1. Lock and get withdrawal
      const wResult = await tx.query(
        "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
        [withdrawalId]
      );

      if (wResult.rows.length === 0) {
        throw new NotFoundError("Withdrawal", withdrawalId);
      }

      const withdrawal = wResult.rows[0];

      // 2. Validate state
      if (withdrawal.status !== WITHDRAWAL_STATUS.PROCESSING) {
        throw new InvalidStateError(withdrawal.status, "completed");
      }

      // 3. Update withdrawal status
      await tx.query(
        `UPDATE withdrawals 
         SET status = $1, transaction_hash = $2, completed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [WITHDRAWAL_STATUS.COMPLETED, transactionHash, withdrawalId]
      );

      // 4. Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.COMPLETE_WITHDRAWAL,
        resourceType: RESOURCE_TYPES.WITHDRAWAL,
        resourceId: withdrawalId,
        details: { transactionHash },
      });

      return {
        withdrawalId,
        status: WITHDRAWAL_STATUS.COMPLETED,
        transactionHash,
      };
    });
  }

  /**
   * Fail withdrawal (refund user)
   */
  async failWithdrawal(withdrawalId, adminId, reason) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError(
        "Failure reason must be at least 10 characters"
      );
    }

    return await this.db.transaction(async (tx) => {
      // 1. Lock and get withdrawal
      const wResult = await tx.query(
        "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
        [withdrawalId]
      );

      if (wResult.rows.length === 0) {
        throw new NotFoundError("Withdrawal", withdrawalId);
      }

      const withdrawal = wResult.rows[0];

      // 2. Validate state
      if (withdrawal.status !== WITHDRAWAL_STATUS.PROCESSING) {
        throw new InvalidStateError(withdrawal.status, "failed");
      }

      // 3. Refund user (reverse the debit)
      await this.ledgerService.createEntry(tx, {
        userId: withdrawal.user_id,
        type: TRANSACTION_TYPES.REFUND,
        amount: parseFloat(withdrawal.amount), // POSITIVE (refund)
        referenceType: REFERENCE_TYPES.WITHDRAWAL,
        referenceId: withdrawalId,
        metadata: {
          reason: "Withdrawal failed",
          failureReason: reason,
          processedBy: adminId,
        },
      });

      // 4. Update withdrawal status
      await tx.query(
        `UPDATE withdrawals 
         SET status = $1, failure_reason = $2, updated_at = NOW()
         WHERE id = $3`,
        [WITHDRAWAL_STATUS.FAILED, reason, withdrawalId]
      );

      // 5. Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.FAIL_WITHDRAWAL,
        resourceType: RESOURCE_TYPES.WITHDRAWAL,
        resourceId: withdrawalId,
        details: { userId: withdrawal.user_id, reason },
      });

      return {
        withdrawalId,
        status: WITHDRAWAL_STATUS.FAILED,
        reason,
        refunded: true,
      };
    });
  }
  /**
   * Create new ad
   */
  async createAd(adminId, adData) {
    const {
      title,
      description,
      advertiser,
      targetUrl,
      imageUrl,
      payoutPerView,
      maxViews,
    } = adData;

    // Validate required fields
    if (!title || !advertiser || !targetUrl || !payoutPerView) {
      throw new ValidationError(
        "title, advertiser, targetUrl, and payoutPerView are required"
      );
    }

    if (payoutPerView <= 0) {
      throw new ValidationError("payoutPerView must be positive");
    }

    return await this.db.transaction(async (tx) => {
      const adId = uuidv4();

      await tx.query(
        `INSERT INTO ads (id, title, description, advertiser, target_url, image_url, payout_per_view, max_views, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          adId,
          title,
          description || null,
          advertiser,
          targetUrl,
          imageUrl || null,
          payoutPerView,
          maxViews || null,
          AD_STATUS.PAUSED, // Start paused by default
        ]
      );

      // Log admin action
      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.CREATE_AD,
        resourceType: RESOURCE_TYPES.AD,
        resourceId: adId,
        details: { title, payoutPerView },
      });

      return { adId, title, status: AD_STATUS.PAUSED };
    });
  }

  /**
   * Update ad
   */
  async updateAd(adId, adminId, updates) {
    const allowedFields = [
      "title",
      "description",
      "targetUrl",
      "imageUrl",
      "payoutPerView",
      "maxViews",
    ];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`
      );
      if (allowedFields.includes(key)) {
        updateFields.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError("No valid fields to update");
    }

    return await this.db.transaction(async (tx) => {
      values.push(adId);
      await tx.query(
        `UPDATE ads SET ${updateFields.join(
          ", "
        )}, updated_at = NOW() WHERE id = $${paramIndex}`,
        values
      );

      await this._logAdminAction(tx, {
        adminId,
        action: ADMIN_ACTIONS.UPDATE_AD,
        resourceType: RESOURCE_TYPES.AD,
        resourceId: adId,
        details: updates,
      });

      return { adId, updated: true };
    });
  }

  /**
   * Change ad status
   */
  async changeAdStatus(adId, adminId, status) {
    if (
      ![AD_STATUS.ACTIVE, AD_STATUS.PAUSED, AD_STATUS.EXPIRED].includes(status)
    ) {
      throw new ValidationError("Invalid ad status");
    }

    return await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE ads SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, adId]
      );

      const action =
        status === AD_STATUS.ACTIVE
          ? ADMIN_ACTIONS.ACTIVATE_AD
          : ADMIN_ACTIONS.PAUSE_AD;

      await this._logAdminAction(tx, {
        adminId,
        action,
        resourceType: RESOURCE_TYPES.AD,
        resourceId: adId,
        details: { newStatus: status },
      });

      return { adId, status };
    });
  }

  /**
   * Get all ads (admin view)
   */
  async getAllAds({ limit = 50, offset = 0, status = null } = {}) {
    let query = "SELECT * FROM ads WHERE 1=1";
    const params = [];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      advertiser: row.advertiser,
      targetUrl: row.target_url,
      imageUrl: row.image_url,
      payoutPerView: parseFloat(row.payout_per_view),
      totalViews: parseInt(row.total_views),
      maxViews: row.max_views ? parseInt(row.max_views) : null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Block/unblock user
   */
  async toggleUserBlock(userId, adminId, block = true) {
    return await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE users SET is_blocked = $1, updated_at = NOW() WHERE id = $2",
        [block, userId]
      );

      await this._logAdminAction(tx, {
        adminId,
        action: block ? ADMIN_ACTIONS.BLOCK_USER : ADMIN_ACTIONS.UNBLOCK_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: userId,
        details: { blocked: block },
      });

      return { userId, blocked: block };
    });
  }
  /**
   * Get admin action logs
   */
  async getAdminLogs({
    limit = 100,
    offset = 0,
    adminId = null,
    action = null,
  } = {}) {
    let query = `
      SELECT 
        l.*,
        u.email as admin_email
      FROM admin_logs l
      JOIN users u ON l.admin_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (adminId) {
      query += ` AND l.admin_id = $${params.length + 1}`;
      params.push(adminId);
    }

    if (action) {
      query += ` AND l.action = $${params.length + 1}`;
      params.push(action);
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminEmail: row.admin_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  }

  /**
   * Log admin action
   * @private
   */
  async _logAdminAction(
    tx,
    { adminId, action, resourceType, resourceId, details }
  ) {
    await tx.query(
      `INSERT INTO admin_logs (id, admin_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv4(),
        adminId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(details),
      ]
    );
  }
}

export default AdminService;
