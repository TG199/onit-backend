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
}
