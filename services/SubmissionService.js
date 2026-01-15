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
}
