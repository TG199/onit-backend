/**
 * User Controller
 *
 * Handles all user-facing endpoints
 */

import SubmissionService from "../services/SubmissionService.js";
import WithdrawalService from "../services/WithdrawalService.js";
import LedgerService from "../services/LedgerService.js";
import { dbClient } from "../server.js";
import {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  RateLimitError,
  ConflictError,
} from "../utils/errors.js";

const submissionService = new SubmissionService(dbClient);
const withdrawalService = new WithdrawalService(dbClient);
const ledgerService = new LedgerService(dbClient);

/**
 * GET /api/user/ads
 * Get available ads for user
 */
export async function getAvailableAds(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const ads = await submissionService.getAvailableAds(userId, {
      limit,
      offset,
    });

    res.status(200).json({
      ads,
      pagination: {
        limit,
        offset,
        count: ads.length,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
