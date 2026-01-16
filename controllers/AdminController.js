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
