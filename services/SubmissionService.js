/**
 * Submission Service
 *
 * Handles user ad proof submissions
 */

import { v4 as uuidv4 } from "uuid";
import {
  SUBMISSION_STATUS,
  AD_STATUS,
  RATE_LIMITS,
} from "../utils/constants.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ForbiddenError,
} from "../utils/errors.js";

class SubmissionService {
  constructor(dbClient) {
    this.db = dbClient;
  }

  /**
   * Submit proof for an ad engagement
   *
   * @param {string} userId - User UUID
   * @param {string} adId - Ad UUID
   * @param {string} proofUrl - URL to uploaded screenshot
   * @returns {Promise<Object>} Created submission
   */
  async submitProof(userId, adId, proofUrl) {
    if (!userId || !adId || !proofUrl) {
      throw new ValidationError("userId, adId, and proofUrl are required");
    }

    return await this.db.transaction(async (tx) => {
      const adResult = await tx.query(
        "SELECT id, status, payout_per_view, max_views, total_views FROM ads WHERE id = $1",
        [adId]
      );

      if (adResult.rows.length === 0) {
        throw new NotFoundError("Ad", adId);
      }

      const ad = adResult.rows[0];

      if (ad.status !== AD_STATUS.ACTIVE) {
        throw new ValidationError("Ad is not active");
      }

      // Check if ad has reached max views
      if (ad.max_views && ad.total_views >= ad.max_views) {
        throw new ValidationError("Ad has reached maximum views");
      }

      // 2. Check rate limit (1 submission per ad per day)
      const rateLimitCheck = await tx.query(
        `SELECT COUNT(*) as count 
         FROM submissions 
         WHERE user_id = $1 
         AND ad_id = $2 
         AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId, adId]
      );

      if (
        parseInt(rateLimitCheck.rows[0].count) >=
        RATE_LIMITS.SUBMISSIONS_PER_AD_PER_DAY
      ) {
        throw new RateLimitError("You can only submit once per ad per day");
      }

      // 3. Check for existing pending/approved submission
      const existingCheck = await tx.query(
        `SELECT id, status 
         FROM submissions 
         WHERE user_id = $1 
         AND ad_id = $2 
         AND status IN ($3, $4)`,
        [
          userId,
          adId,
          SUBMISSION_STATUS.PENDING,
          SUBMISSION_STATUS.UNDER_REVIEW,
        ]
      );

      if (existingCheck.rows.length > 0) {
        throw new ConflictError(
          "You already have a pending submission for this ad"
        );
      }

      // 4. Create ad_engagement record (if not exists)
      await tx.query(
        `INSERT INTO ad_engagements (id, user_id, ad_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, ad_id) DO NOTHING`,
        [uuidv4(), userId, adId]
      );

      // 5. Create submission
      const submissionResult = await tx.query(
        `INSERT INTO submissions (id, user_id, ad_id, proof_url, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, ad_id, proof_url, status, created_at`,
        [uuidv4(), userId, adId, proofUrl, SUBMISSION_STATUS.PENDING]
      );

      return submissionResult.rows[0];
    });
  }

  /**
   * Get user's submission history
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Submissions
   */
  async getUserSubmissions(
    userId,
    { limit = 50, offset = 0, status = null } = {}
  ) {
    let query = `
      SELECT 
        s.id,
        s.status,
        s.proof_url,
        s.rejection_reason,
        s.created_at,
        s.reviewed_at,
        a.id as ad_id,
        a.title as ad_title,
        a.payout_per_view,
        a.image_url as ad_image
      FROM submissions s
      JOIN ads a ON s.ad_id = a.id
      WHERE s.user_id = $1
    `;

    const params = [userId];

    if (status) {
      query += ` AND s.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      proofUrl: row.proof_url,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      ad: {
        id: row.ad_id,
        title: row.ad_title,
        payoutPerView: parseFloat(row.payout_per_view),
        imageUrl: row.ad_image,
      },
    }));
  }

  /**
   * Get submission by ID (user can only see their own)
   *
   * @param {string} submissionId - Submission UUID
   * @param {string} userId - User UUID (for authorization)
   * @returns {Promise<Object>} Submission details
   */
  async getSubmissionById(submissionId, userId) {
    const result = await this.db.query(
      `SELECT 
        s.*,
        a.title as ad_title,
        a.payout_per_view
       FROM submissions s
       JOIN ads a ON s.ad_id = a.id
       WHERE s.id = $1`,
      [submissionId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Submission", submissionId);
    }

    const submission = result.rows[0];

    // Authorization: User can only see their own submissions
    if (submission.user_id !== userId) {
      throw new ForbiddenError("Access denied");
    }

    return {
      id: submission.id,
      userId: submission.user_id,
      adId: submission.ad_id,
      adTitle: submission.ad_title,
      payoutAmount: parseFloat(submission.payout_per_view),
      proofUrl: submission.proof_url,
      status: submission.status,
      rejectionReason: submission.rejection_reason,
      reviewedBy: submission.reviewed_by,
      reviewedAt: submission.reviewed_at,
      createdAt: submission.created_at,
    };
  }
}
