/**
 * Integration Tests
 *
 * Tests complete user and admin workflows
 */

import {
  test,
  section,
  summary,
  assert,
  assertEqual,
  assertApprox,
  expectError,
  db,
  createTestUser,
  createTestAdmin,
  createTestAd,
  createTestSubmission,
  cleanup,
  getBalance,
  getLedgerSum,
} from "./helpers.js";
import LedgerService from "../services/LedgerService.js";
import SubmissionService from "../services/SubmissionService.js";
import WithdrawalService from "../services/WithdrawalService.js";
import AdminService from "../services/AdminService.js";
import { TRANSACTION_TYPES, REFERENCE_TYPES } from "../utils/constants.js";

const ledgerService = new LedgerService(db);
const submissionService = new SubmissionService(db);
const withdrawalService = new WithdrawalService(db);
const adminService = new AdminService(db);

let testUser;
let testAdmin;
let testAd;

async function runTests() {
  console.log("Starting Integration Tests...\n");

  await db.connect();

  try {
    // Setup
    testUser = await createTestUser();
    testAdmin = await createTestAdmin();
    testAd = await createTestAd();

    section("User Submission Workflow");

    let submissionId;

    await test("User can submit proof for ad", async () => {
      const submission = await submissionService.submitProof(
        testUser.id,
        testAd.id,
        "https://example.com/proof.jpg"
      );

      submissionId = submission.id;
      assert(submission.id, "Submission should have ID");
      assertEqual(submission.status, "pending", "Should start as pending");
    });

    await test("User cannot submit duplicate proof", async () => {
      await expectError(
        () =>
          submissionService.submitProof(
            testUser.id,
            testAd.id,
            "https://example.com/proof2.jpg"
          ),
        "already have a pending submission"
      );
    });

    await test("User can view their submissions", async () => {
      const submissions = await submissionService.getUserSubmissions(
        testUser.id
      );

      assert(submissions.length > 0, "Should have submissions");
      assertEqual(
        submissions[0].id,
        submissionId,
        "Should include our submission"
      );
    });

    await test("User stats show pending submission", async () => {
      const stats = await submissionService.getUserStats(testUser.id);

      assertEqual(stats.totalSubmissions, 1, "Should have 1 submission");
      assertEqual(stats.pending, 1, "Should have 1 pending");
      assertEqual(stats.approved, 0, "Should have 0 approved");
    });

    section("Admin Approval Workflow");

    await test("Admin can see pending submissions", async () => {
      const pending = await adminService.getPendingSubmissions();

      assert(pending.length > 0, "Should have pending submissions");
      const found = pending.find((s) => s.id === submissionId);
      assert(found, "Should find our submission");
    });

    await test("Admin can approve submission (pays user)", async () => {
      const balanceBefore = await getBalance(testUser.id);

      const result = await adminService.approveSubmission(
        submissionId,
        testAdmin.id
      );

      assertEqual(result.status, "approved", "Should be approved");
      assertApprox(
        result.payoutAmount,
        10.0,
        0.01,
        "Should have correct payout"
      );

      const balanceAfter = await getBalance(testUser.id);
      assertApprox(
        balanceAfter - balanceBefore,
        10.0,
        0.01,
        "Balance should increase by payout"
      );
    });

    await test("User balance matches ledger after approval", async () => {
      const balance = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      assertApprox(balance, ledgerSum, 0.01, "Balance should match ledger");
    });

    await test("User stats updated after approval", async () => {
      const stats = await submissionService.getUserStats(testUser.id);

      assertEqual(stats.approved, 1, "Should have 1 approved");
      assertEqual(stats.pending, 0, "Should have 0 pending");
    });

    await test("Admin action was logged", async () => {
      const logs = await adminService.getAdminLogs({
        adminId: testAdmin.id,
        limit: 1,
      });

      assert(logs.length > 0, "Should have logs");
      assertEqual(logs[0].action, "approve_submission", "Should log approval");
    });

    section("Withdrawal Workflow");

    let withdrawalId;

    await test("User can request withdrawal", async () => {
      const withdrawal = await withdrawalService.requestWithdrawal(
        testUser.id,
        5.0,
        "bank_transfer",
        {
          accountNumber: "1234567890",
          bankName: "Test Bank",
          accountName: "Test User",
        }
      );

      withdrawalId = withdrawal.id;
      assert(withdrawal.id, "Withdrawal should have ID");
      assertEqual(withdrawal.status, "pending", "Should start as pending");
      assertApprox(withdrawal.amount, 5.0, 0.01, "Should have correct amount");
    });

    await test("User cannot withdraw more than balance", async () => {
      await expectError(
        () =>
          withdrawalService.requestWithdrawal(
            testUser.id,
            1000.0,
            "bank_transfer",
            { accountNumber: "1234", bankName: "Bank", accountName: "Name" }
          ),
        "Insufficient balance"
      );
    });

    await test("Admin can see pending withdrawals", async () => {
      const pending = await adminService.getPendingWithdrawals();

      const found = pending.find((w) => w.id === withdrawalId);
      assert(found, "Should find our withdrawal");
    });

    await test("Admin can process withdrawal (deducts balance)", async () => {
      const balanceBefore = await getBalance(testUser.id);

      const result = await adminService.processWithdrawal(
        withdrawalId,
        testAdmin.id
      );

      assertEqual(result.status, "processing", "Should be processing");

      const balanceAfter = await getBalance(testUser.id);
      assertApprox(
        balanceBefore - balanceAfter,
        5.0,
        0.01,
        "Balance should decrease by amount"
      );
    });

    await test("Balance still matches ledger after withdrawal", async () => {
      const balance = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      assertApprox(balance, ledgerSum, 0.01, "Balance should match ledger");
    });

    await test("Admin can complete withdrawal", async () => {
      const result = await adminService.completeWithdrawal(
        withdrawalId,
        testAdmin.id,
        "TXN123456"
      );

      assertEqual(result.status, "completed", "Should be completed");
      assertEqual(
        result.transactionHash,
        "TXN123456",
        "Should have transaction hash"
      );
    });

    section("Failed Withdrawal Workflow");

    let failedWithdrawalId;

    await test("Create another withdrawal", async () => {
      const withdrawal = await withdrawalService.requestWithdrawal(
        testUser.id,
        2.0,
        "paypal",
        { email: "test@example.com" }
      );

      failedWithdrawalId = withdrawal.id;
    });

    await test("Process withdrawal", async () => {
      await adminService.processWithdrawal(failedWithdrawalId, testAdmin.id);
    });

    await test("Admin can fail withdrawal (refunds user)", async () => {
      const balanceBefore = await getBalance(testUser.id);

      const result = await adminService.failWithdrawal(
        failedWithdrawalId,
        testAdmin.id,
        "Bank rejected payment"
      );

      assertEqual(result.status, "failed", "Should be failed");
      assert(result.refunded, "Should be refunded");

      const balanceAfter = await getBalance(testUser.id);
      assertApprox(
        balanceAfter - balanceBefore,
        2.0,
        0.01,
        "Balance should be refunded"
      );
    });

    await test("Balance still matches ledger after refund", async () => {
      const balance = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      assertApprox(balance, ledgerSum, 0.01, "Balance should match ledger");
    });

    section("Submission Rejection Workflow");

    let rejectedSubmissionId;

    await test("Create new ad", async () => {
      const ad = await createTestAd({
        title: "Test Ad 2",
        payoutPerView: 15.0,
      });
      testAd = ad;
    });

    await test("User submits proof", async () => {
      const submission = await submissionService.submitProof(
        testUser.id,
        testAd.id,
        "https://example.com/proof3.jpg"
      );

      rejectedSubmissionId = submission.id;
    });

    await test("Admin can reject submission", async () => {
      const result = await adminService.rejectSubmission(
        rejectedSubmissionId,
        testAdmin.id,
        "Screenshot does not show completed action"
      );

      assertEqual(result.status, "rejected", "Should be rejected");
    });

    await test("User balance unchanged after rejection", async () => {
      const balance = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      assertApprox(
        balance,
        ledgerSum,
        0.01,
        "Balance should still match ledger"
      );
    });

    section("Ad Management Workflow");

    let newAdId;

    await test("Admin can create ad", async () => {
      const ad = await adminService.createAd(testAdmin.id, {
        title: "Admin Created Ad",
        advertiser: "Test Advertiser",
        targetUrl: "https://example.com",
        payoutPerView: 20.0,
        maxViews: 100,
      });

      newAdId = ad.adId;
      assert(ad.adId, "Should have ad ID");
      assertEqual(ad.status, "paused", "Should start paused");
    });

    await test("Admin can activate ad", async () => {
      const result = await adminService.changeAdStatus(
        newAdId,
        testAdmin.id,
        "active"
      );

      assertEqual(result.status, "active", "Should be active");
    });

    await test("Active ad visible to users", async () => {
      const ads = await submissionService.getAvailableAds(testUser.id);

      const found = ads.find((a) => a.id === newAdId);
      assert(found, "Should find new ad");
    });

    await test("Admin can pause ad", async () => {
      const result = await adminService.changeAdStatus(
        newAdId,
        testAdmin.id,
        "paused"
      );

      assertEqual(result.status, "paused", "Should be paused");
    });

    section("User Blocking Workflow");

    await test("Admin can block user", async () => {
      const result = await adminService.toggleUserBlock(
        testUser.id,
        testAdmin.id,
        true
      );

      assert(result.blocked, "User should be blocked");
    });

    await test("Blocked user cannot submit proof", async () => {
      await expectError(
        () =>
          submissionService.submitProof(
            testUser.id,
            testAd.id,
            "https://example.com/proof.jpg"
          ),
        "blocked"
      );
    });

    await test("Admin can unblock user", async () => {
      const result = await adminService.toggleUserBlock(
        testUser.id,
        testAdmin.id,
        false
      );

      assert(!result.blocked, "User should be unblocked");
    });

    section("Audit & Monitoring");

    await test("Can audit user balance", async () => {
      const audit = await ledgerService.auditUserBalance(testUser.id);

      assert(audit.isConsistent, "Balance should be consistent");
      assertApprox(
        audit.storedBalance,
        audit.ledgerBalance,
        0.01,
        "Balances should match"
      );
    });

    await test("No balance mismatches in system", async () => {
      const mismatches = await ledgerService.findBalanceMismatches();

      assertEqual(mismatches.length, 0, "Should have no mismatches");
    });

    await test("Can get platform stats", async () => {
      // This would normally query all data, but we'll just check it doesn't error
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_users,
          COALESCE(SUM(balance), 0) as total_balance
        FROM users
      `);

      assert(result.rows.length > 0, "Should return stats");
    });

    await test("All admin actions were logged", async () => {
      const logs = await adminService.getAdminLogs({ adminId: testAdmin.id });

      assert(logs.length >= 5, "Should have multiple log entries");

      // Check for key actions
      const actions = logs.map((l) => l.action);
      assert(actions.includes("approve_submission"), "Should log approvals");
      assert(actions.includes("process_withdrawal"), "Should log withdrawals");
    });

    section("Transaction Statistics");

    await test("User transaction stats are accurate", async () => {
      const stats = await ledgerService.getTransactionStats(testUser.id);

      assert(stats.totalTransactions > 0, "Should have transactions");
      assert(stats.totalEarned > 0, "Should have earnings");
      assertApprox(
        stats.totalEarned,
        25.0,
        0.01,
        "Should have earned 10 + 15 = 25"
      );
    });

    await test("User withdrawal stats are accurate", async () => {
      const stats = await withdrawalService.getUserWithdrawalStats(testUser.id);

      assertEqual(stats.totalWithdrawals, 2, "Should have 2 withdrawals");
      assertEqual(stats.completed, 1, "Should have 1 completed");
      assertEqual(stats.failed, 1, "Should have 1 failed");
    });
  } finally {
    // Cleanup
    console.log("\nCleaning up test data...");
    await cleanup();
    await db.disconnect();

    // Print summary
    return summary();
  }
}

runTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
