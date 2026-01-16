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

/**
 * POST /api/admin/submissions/:id/approve
 * Approve submission and pay user
 */
export async function approveSubmission(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.approveSubmission(id, adminId);

    res.status(200).json({
      message: "Submission approved and user paid",
      submission: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/submissions/:id/reject
 * Reject submission
 */
export async function rejectSubmission(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const result = await adminService.rejectSubmission(id, adminId, reason);

    res.status(200).json({
      message: "Submission rejected",
      submission: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/withdrawals
 * Get pending withdrawals queue
 */
export async function getWithdrawals(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    const withdrawals = await adminService.getPendingWithdrawals({
      limit,
      offset,
      status,
    });

    res.status(200).json({
      withdrawals,
      pagination: {
        limit,
        offset,
        count: withdrawals.length,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/withdrawals/:id/process
 * Process withdrawal (deduct balance)
 */
export async function processWithdrawal(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.processWithdrawal(id, adminId);

    res.status(200).json({
      message: "Withdrawal processed and balance deducted",
      withdrawal: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/withdrawals/:id/complete
 * Complete withdrawal (mark as paid)
 */
export async function completeWithdrawal(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { transactionHash } = req.body;

    if (!transactionHash) {
      return res.status(400).json({ error: "Transaction hash is required" });
    }

    const result = await adminService.completeWithdrawal(
      id,
      adminId,
      transactionHash
    );

    res.status(200).json({
      message: "Withdrawal completed",
      withdrawal: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/withdrawals/:id/fail
 * Fail withdrawal (refund user)
 */
export async function failWithdrawal(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Failure reason is required" });
    }

    const result = await adminService.failWithdrawal(id, adminId, reason);

    res.status(200).json({
      message: "Withdrawal failed and user refunded",
      withdrawal: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/ads
 * Get all ads
 */
export async function getAds(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    const ads = await adminService.getAllAds({ limit, offset, status });

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

/**
 * POST /api/admin/ads
 * Create new ad
 */
export async function createAd(req, res) {
  try {
    const adminId = req.user.id;
    const adData = req.body;

    const result = await adminService.createAd(adminId, adData);

    res.status(201).json({
      message: "Ad created successfully",
      ad: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * PATCH /api/admin/ads/:id
 * Update ad
 */
export async function updateAd(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const result = await adminService.updateAd(id, adminId, updates);

    res.status(200).json({
      message: "Ad updated successfully",
      ad: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/ads/:id/activate
 * Activate ad
 */
export async function activateAd(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.changeAdStatus(id, adminId, "active");

    res.status(200).json({
      message: "Ad activated",
      ad: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/ads/:id/pause
 * Pause ad
 */
export async function pauseAd(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.changeAdStatus(id, adminId, "paused");

    res.status(200).json({
      message: "Ad paused",
      ad: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/users/:id/block
 * Block user
 */
export async function blockUser(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.toggleUserBlock(id, adminId, true);

    res.status(200).json({
      message: "User blocked",
      user: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/admin/users/:id/unblock
 * Unblock user
 */
export async function unblockUser(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await adminService.toggleUserBlock(id, adminId, false);

    res.status(200).json({
      message: "User unblocked",
      user: result,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/users/:id/audit
 * Audit user balance
 */
export async function auditUser(req, res) {
  try {
    const { id } = req.params;

    const audit = await ledgerService.auditUserBalance(id);

    res.status(200).json({ audit });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/logs
 * Get admin action logs
 */
export async function getLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const adminId = req.query.adminId || null;
    const action = req.query.action || null;

    const logs = await adminService.getAdminLogs({
      limit,
      offset,
      adminId,
      action,
    });

    res.status(200).json({
      logs,
      pagination: {
        limit,
        offset,
        count: logs.length,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/audit/mismatches
 * Find all balance mismatches
 */
export async function getBalanceMismatches(req, res) {
  try {
    const mismatches = await ledgerService.findBalanceMismatches();

    res.status(200).json({
      mismatches,
      count: mismatches.length,
      critical: mismatches.length > 0,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
export async function getPlatformStats(req, res) {
  try {
    // Get various platform stats in parallel
    const [userStats, submissionStats, withdrawalStats, adStats] =
      await Promise.all([
        dbClient.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_blocked THEN 1 END) as blocked_users,
          COALESCE(SUM(balance), 0) as total_balance
        FROM users
      `),
        dbClient.query(`
        SELECT 
          COUNT(*) as total_submissions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM submissions
      `),
        dbClient.query(`
        SELECT 
          COUNT(*) as total_withdrawals,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_paid
        FROM withdrawals
      `),
        dbClient.query(`
        SELECT 
          COUNT(*) as total_ads,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused
        FROM ads
      `),
      ]);

    res.status(200).json({
      users: {
        total: parseInt(userStats.rows[0].total_users),
        blocked: parseInt(userStats.rows[0].blocked_users),
        totalBalance: parseFloat(userStats.rows[0].total_balance),
      },
      submissions: {
        total: parseInt(submissionStats.rows[0].total_submissions),
        pending: parseInt(submissionStats.rows[0].pending),
        approved: parseInt(submissionStats.rows[0].approved),
        rejected: parseInt(submissionStats.rows[0].rejected),
      },
      withdrawals: {
        total: parseInt(withdrawalStats.rows[0].total_withdrawals),
        pending: parseInt(withdrawalStats.rows[0].pending),
        completed: parseInt(withdrawalStats.rows[0].completed),
        totalPaid: parseFloat(withdrawalStats.rows[0].total_paid),
      },
      ads: {
        total: parseInt(adStats.rows[0].total_ads),
        active: parseInt(adStats.rows[0].active),
        paused: parseInt(adStats.rows[0].paused),
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
