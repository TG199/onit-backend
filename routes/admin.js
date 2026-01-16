/**
 * Admin Routes
 *
 * All endpoints require authentication AND admin role
 */

import express from "express";
import { auth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/roles.js";
import * as AdminController from "../controllers/AdminController.js";

const router = express.Router();

// All admin routes require authentication AND admin role
router.use(auth);
router.use(requireAdmin);

// Get submissions queue
router.get("/submissions", AdminController.getSubmissions);

// Approve submission
router.post("/submissions/:id/approve", AdminController.approveSubmission);

// Reject submission
router.post("/submissions/:id/reject", AdminController.rejectSubmission);

// Get withdrawals queue
router.get("/withdrawals", AdminController.getWithdrawals);

// Process withdrawal (deduct balance)
router.post("/withdrawals/:id/process", AdminController.processWithdrawal);

// Complete withdrawal (mark as paid)
router.post("/withdrawals/:id/complete", AdminController.completeWithdrawal);

// Fail withdrawal (refund user)
router.post("/withdrawals/:id/fail", AdminController.failWithdrawal);

// Get all ads
router.get("/ads", AdminController.getAds);

// Create ad
router.post("/ads", AdminController.createAd);

// Update ad
router.patch("/ads/:id", AdminController.updateAd);

// Activate ad
router.post("/ads/:id/activate", AdminController.activateAd);

// Pause ad
router.post("/ads/:id/pause", AdminController.pauseAd);

// Block user
router.post("/users/:id/block", AdminController.blockUser);

// Unblock user
router.post("/users/:id/unblock", AdminController.unblockUser);

// Audit user balance
router.get("/users/:id/audit", AdminController.auditUser);

// Get admin action logs
router.get("/logs", AdminController.getLogs);

// Find balance mismatches
router.get("/audit/mismatches", AdminController.getBalanceMismatches);

// Get platform statistics
router.get("/stats", AdminController.getPlatformStats);

export default router;
