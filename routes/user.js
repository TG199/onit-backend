/**
 * User Routes
 *
 * All endpoints require authentication
 */

import express from "express";
import { auth } from "../middleware/auth.js";
import * as UserController from "../controllers/UserController.js";

const router = express.Router();

// All user routes require authentication
router.use(auth);

// ============================================
// ADS & SUBMISSIONS
// ============================================

// Get available ads
router.get("/ads", UserController.getAvailableAds);

// Submit proof for an ad
router.post("/engagements/:adId/submit", UserController.submitProof);

// Get submission history
router.get("/engagements", UserController.getSubmissions);

// Get submission statistics
router.get("/engagements/stats", UserController.getSubmissionStats);

// Get specific submission
router.get("/engagements/:id", UserController.getSubmissionById);

// ============================================
// WALLET & TRANSACTIONS
// ============================================

// Get wallet summary
router.get("/wallet", UserController.getWallet);

// Get transaction history
router.get("/wallet/transactions", UserController.getTransactions);

// ============================================
// WITHDRAWALS
// ============================================

// Request withdrawal
router.post("/wallet/withdraw", UserController.requestWithdrawal);

// Get withdrawal history
router.get("/wallet/withdrawals", UserController.getWithdrawals);

// Get withdrawal statistics
router.get("/wallet/withdrawals/stats", UserController.getWithdrawalStats);

// Get specific withdrawal
router.get("/wallet/withdrawals/:id", UserController.getWithdrawalById);

// Cancel withdrawal
router.post("/wallet/withdrawals/:id/cancel", UserController.cancelWithdrawal);

// ============================================
// PROFILE & DASHBOARD
// ============================================

// Get user profile
router.get("/profile", UserController.getProfile);

// Get dashboard summary
router.get("/dashboard", UserController.getDashboard);

export default router;
