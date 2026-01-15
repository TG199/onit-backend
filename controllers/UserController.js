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

/**
 * POST /api/user/engagements/:adId/submit
 * Submit proof for an ad
 */
export async function submitProof(req, res) {
  try {
    const userId = req.user.id;
    const { adId } = req.params;
    const { proofUrl } = req.body;

    if (!proofUrl) {
      return res.status(400).json({ error: "proofUrl is required" });
    }

    const submission = await submissionService.submitProof(
      userId,
      adId,
      proofUrl
    );

    res.status(201).json({
      message: "Proof submitted successfully",
      submission: {
        id: submission.id,
        adId: submission.ad_id,
        status: submission.status,
        createdAt: submission.created_at,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/engagements
 * Get user's submission history
 */
export async function getSubmissions(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    const submissions = await submissionService.getUserSubmissions(userId, {
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
 * GET /api/user/engagements/:id
 * Get submission details
 */
export async function getSubmissionById(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const submission = await submissionService.getSubmissionById(id, userId);

    res.status(200).json({ submission });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/engagements/stats
 * Get submission statistics
 */
export async function getSubmissionStats(req, res) {
  try {
    const userId = req.user.id;

    const stats = await submissionService.getUserStats(userId);

    res.status(200).json({ stats });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/wallet
 * Get wallet balance and summary
 */
export async function getWallet(req, res) {
  try {
    const userId = req.user.id;

    const balance = await ledgerService.getBalance(userId);
    const stats = await ledgerService.getTransactionStats(userId);

    res.status(200).json({
      balance,
      stats: {
        totalEarned: stats.totalEarned,
        totalWithdrawn: stats.totalWithdrawn,
        totalTransactions: stats.totalTransactions,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/wallet/transactions
 * Get transaction history
 */
export async function getTransactions(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type || null;

    const transactions = await ledgerService.getTransactionHistory(userId, {
      limit,
      offset,
      type,
    });

    res.status(200).json({
      transactions,
      pagination: {
        limit,
        offset,
        count: transactions.length,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/user/wallet/withdraw
 * Request withdrawal
 */
export async function requestWithdrawal(req, res) {
  try {
    const userId = req.user.id;
    const { amount, method, paymentDetails } = req.body;

    if (!amount || !method || !paymentDetails) {
      return res.status(400).json({
        error: "amount, method, and paymentDetails are required",
      });
    }

    const withdrawal = await withdrawalService.requestWithdrawal(
      userId,
      parseFloat(amount),
      method,
      paymentDetails
    );

    res.status(201).json({
      message: "Withdrawal request submitted successfully",
      withdrawal: {
        id: withdrawal.id,
        amount: withdrawal.amount,
        method: withdrawal.method,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/wallet/withdrawals
 * Get withdrawal history
 */
export async function getWithdrawals(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    const withdrawals = await withdrawalService.getUserWithdrawals(userId, {
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
 * GET /api/user/wallet/withdrawals/:id
 * Get withdrawal details
 */
export async function getWithdrawalById(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const withdrawal = await withdrawalService.getWithdrawalById(id, userId);

    res.status(200).json({ withdrawal });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * POST /api/user/wallet/withdrawals/:id/cancel
 * Cancel pending withdrawal
 */
export async function cancelWithdrawal(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const withdrawal = await withdrawalService.cancelWithdrawal(id, userId);

    res.status(200).json({
      message: "Withdrawal cancelled successfully",
      withdrawal,
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/wallet/withdrawals/stats
 * Get withdrawal statistics
 */
export async function getWithdrawalStats(req, res) {
  try {
    const userId = req.user.id;

    const stats = await withdrawalService.getUserWithdrawalStats(userId);

    res.status(200).json({ stats });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/profile
 * Get user profile
 */
export async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    const result = await dbClient.query(
      "SELECT id, email, phone, role, balance, location, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: parseFloat(user.balance),
        location: user.location,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * GET /api/user/dashboard
 * Get dashboard summary
 */
export async function getDashboard(req, res) {
  try {
    const userId = req.user.id;

    // Get all data in parallel
    const [balance, transactionStats, submissionStats, withdrawalStats] =
      await Promise.all([
        ledgerService.getBalance(userId),
        ledgerService.getTransactionStats(userId),
        submissionService.getUserStats(userId),
        withdrawalService.getUserWithdrawalStats(userId),
      ]);

    res.status(200).json({
      balance,
      earnings: {
        total: transactionStats.totalEarned,
        fromAds: transactionStats.adEarnings,
      },
      submissions: {
        total: submissionStats.totalSubmissions,
        pending: submissionStats.pending,
        approved: submissionStats.approved,
        rejected: submissionStats.rejected,
        approvalRate: submissionStats.approvalRate,
      },
      withdrawals: {
        total: withdrawalStats.totalWithdrawals,
        totalAmount: withdrawalStats.totalWithdrawn,
        pending: withdrawalStats.pending,
        completed: withdrawalStats.completed,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
