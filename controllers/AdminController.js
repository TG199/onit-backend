/**
 * Admin Controller
 *
 * Handles all admin-facing endpoints
 */

import AdminService from "../services/AdminService.js";
import LedgerService from "../services/LedgerService.js";
import { dbClient } from "../server.js";
import {
  ValidationError,
  NotFoundError,
  InvalidStateError,
} from "../utils/errors.js";

const adminService = new AdminService(dbClient);
const ledgerService = new LedgerService(dbClient);

/**
 * GET /api/admin/submissions
 * Get pending submissions queue
 */
export async function getSubmissions(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    const submissions = await adminService.getPendingSubmissions({
      limit,
      offset,
      status,
    });

    res.status(200).json({
      submissions,
      pagination: {
        limit,
        offset,
        count: submissions.length,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
