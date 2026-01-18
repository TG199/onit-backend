/**
 * Concurrent Operations Tests
 *
 * Tests race conditions and concurrent access
 */

import {
  test,
  section,
  summary,
  assert,
  assertApprox,
  db,
  createTestUser,
  createTestAd,
  cleanup,
  getBalance,
  getLedgerSum,
} from "./helpers.js";
import LedgerService from "../services/LedgerService.js";
import AdminService from "../services/AdminService.js";
import SubmissionService from "../services/SubmissionService.js";
import { TRANSACTION_TYPES, REFERENCE_TYPES } from "../utils/constants.js";

const ledgerService = new LedgerService(db);
const adminService = new AdminService(db);
const submissionService = new SubmissionService(db);

let testUser;
let testAdmin;
let testAd;

async function runTests() {
  console.log("Starting Concurrent Operations Tests...\n");

  await db.connect();

  try {
    // Setup
    testUser = await createTestUser();
    testAdmin = await createTestUser({ role: "admin" });
    testAd = await createTestAd();

    section("Concurrent Ledger Operations");

    await test("Multiple concurrent credits", async () => {
      const balanceBefore = await getBalance(testUser.id);

      // Create 10 concurrent credit operations
      const operations = Array(10)
        .fill(null)
        .map((_, i) =>
          db.transaction(async (tx) => {
            return await ledgerService.createEntry(tx, {
              userId: testUser.id,
              type: TRANSACTION_TYPES.BONUS,
              amount: 1.0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUser.id,
              metadata: { index: i },
            });
          })
        );

      await Promise.all(operations);

      const balanceAfter = await getBalance(testUser.id);
      const expectedBalance = balanceBefore + 10.0;

      assertApprox(
        balanceAfter,
        expectedBalance,
        0.01,
        "All credits should be applied"
      );
    });

    await test("Balance matches ledger after concurrent operations", async () => {
      const balance = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      assertApprox(balance, ledgerSum, 0.01, "Balance should match ledger");
    });

    await test("Multiple concurrent debits", async () => {
      const balanceBefore = await getBalance(testUser.id);

      // Create 5 concurrent debit operations
      const operations = Array(5)
        .fill(null)
        .map((_, i) =>
          db.transaction(async (tx) => {
            return await ledgerService.createEntry(tx, {
              userId: testUser.id,
              type: TRANSACTION_TYPES.WITHDRAWAL,
              amount: -0.5,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUser.id,
              metadata: { index: i },
            });
          })
        );

      await Promise.all(operations);

      const balanceAfter = await getBalance(testUser.id);
      const expectedBalance = balanceBefore - 2.5;

      assertApprox(
        balanceAfter,
        expectedBalance,
        0.01,
        "All debits should be applied"
      );
    });

    await test("Mixed concurrent operations", async () => {
      const balanceBefore = await getBalance(testUser.id);

      // 5 credits + 3 debits = net +2.00
      const operations = [
        ...Array(5)
          .fill(null)
          .map((_, i) =>
            db.transaction(async (tx) => {
              return await ledgerService.createEntry(tx, {
                userId: testUser.id,
                type: TRANSACTION_TYPES.BONUS,
                amount: 1.0,
                referenceType: REFERENCE_TYPES.SYSTEM,
                referenceId: testUser.id,
                metadata: { type: "credit", index: i },
              });
            })
          ),
        ...Array(3)
          .fill(null)
          .map((_, i) =>
            db.transaction(async (tx) => {
              return await ledgerService.createEntry(tx, {
                userId: testUser.id,
                type: TRANSACTION_TYPES.WITHDRAWAL,
                amount: -1.0,
                referenceType: REFERENCE_TYPES.SYSTEM,
                referenceId: testUser.id,
                metadata: { type: "debit", index: i },
              });
            })
          ),
      ];

      await Promise.all(operations);

      const balanceAfter = await getBalance(testUser.id);
      const expectedBalance = balanceBefore + 2.0; // 5 - 3 = +2

      assertApprox(
        balanceAfter,
        expectedBalance,
        0.01,
        "Net change should be correct"
      );
    });

    section("Concurrent Submission Approvals");

    await test("Multiple admins approving different submissions", async () => {
      // Create multiple submissions
      const submissions = [];
      for (let i = 0; i < 5; i++) {
        const ad = await createTestAd({
          title: `Test Ad ${i}`,
          payoutPerView: 5.0,
        });
        const submission = await submissionService.submitProof(
          testUser.id,
          ad.id,
          `https://example.com/proof${i}.jpg`
        );
        submissions.push(submission.id);
      }

      const balanceBefore = await getBalance(testUser.id);

      // Approve all concurrently
      const approvals = submissions.map((subId) =>
        adminService.approveSubmission(subId, testAdmin.id)
      );

      await Promise.all(approvals);

      const balanceAfter = await getBalance(testUser.id);
      const expectedIncrease = 25.0; // 5 submissions * 5.00

      assertApprox(
        balanceAfter - balanceBefore,
        expectedIncrease,
        0.01,
        "All payouts should be applied"
      );
    });

    await test("Cannot approve same submission twice", async () => {
      const ad = await createTestAd({ payoutPerView: 10.0 });
      const submission = await submissionService.submitProof(
        testUser.id,
        ad.id,
        "https://example.com/proof-dupe.jpg"
      );

      // First approval should succeed
      await adminService.approveSubmission(submission.id, testAdmin.id);

      // Second approval should fail
      let errorCaught = false;
      try {
        await adminService.approveSubmission(submission.id, testAdmin.id);
      } catch (error) {
        errorCaught = true;
      }

      assert(errorCaught, "Should not allow double approval");
    });

    section("Concurrent Withdrawal Processing");

    await test("Multiple withdrawals processed in parallel", async () => {
      // Give user enough balance
      await db.transaction(async (tx) => {
        await ledgerService.createEntry(tx, {
          userId: testUser.id,
          type: TRANSACTION_TYPES.BONUS,
          amount: 50.0,
          referenceType: REFERENCE_TYPES.SYSTEM,
          referenceId: testUser.id,
        });
      });

      // Create multiple withdrawals
      const withdrawals = [];
      for (let i = 0; i < 3; i++) {
        const result = await db.query(
          `INSERT INTO withdrawals (id, user_id, amount, method, payment_details, status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
           RETURNING id`,
          [testUser.id, 5.0, "bank_transfer", "{}", "pending"]
        );
        withdrawals.push(result.rows[0].id);
      }

      const balanceBefore = await getBalance(testUser.id);

      // Process all concurrently
      const processes = withdrawals.map((wId) =>
        adminService.processWithdrawal(wId, testAdmin.id)
      );

      await Promise.all(processes);

      const balanceAfter = await getBalance(testUser.id);
      const expectedDecrease = 15.0; // 3 * 5.00

      assertApprox(
        balanceBefore - balanceAfter,
        expectedDecrease,
        0.01,
        "All withdrawals should be deducted"
      );
    });

    section("Race Condition Tests");

    await test("Rapid submissions for same ad are handled correctly", async () => {
      const ad = await createTestAd();

      // Try to submit 5 times rapidly
      const attempts = Array(5)
        .fill(null)
        .map(() =>
          submissionService
            .submitProof(testUser.id, ad.id, "https://example.com/rapid.jpg")
            .catch((err) => err)
        );

      const results = await Promise.all(attempts);

      // Only one should succeed
      const successes = results.filter((r) => r.id);
      const failures = results.filter((r) => r.message);

      assert(successes.length === 1, "Only one submission should succeed");
      assert(failures.length === 4, "Others should fail with duplicate error");
    });

    await test("Transaction rollback on error prevents partial updates", async () => {
      const balanceBefore = await getBalance(testUser.id);
      const ledgerBefore = await getLedgerSum(testUser.id);

      try {
        await db.transaction(async (tx) => {
          // Create valid ledger entry
          await ledgerService.createEntry(tx, {
            userId: testUser.id,
            type: TRANSACTION_TYPES.BONUS,
            amount: 100.0,
            referenceType: REFERENCE_TYPES.SYSTEM,
            referenceId: testUser.id,
          });

          // Force an error
          throw new Error("Intentional rollback");
        });
      } catch (error) {
        // Expected to fail
      }

      const balanceAfter = await getBalance(testUser.id);
      const ledgerAfter = await getLedgerSum(testUser.id);

      assertApprox(
        balanceAfter,
        balanceBefore,
        0.01,
        "Balance should be unchanged"
      );
      assertApprox(
        ledgerAfter,
        ledgerBefore,
        0.01,
        "Ledger should be unchanged"
      );
    });

    section("Stress Test");

    await test("100 concurrent operations maintain consistency", async () => {
      const balanceBefore = await getBalance(testUser.id);

      // Create 100 small operations (50 credits + 50 debits)
      const operations = [
        ...Array(50)
          .fill(null)
          .map((_, i) =>
            db.transaction(async (tx) => {
              return await ledgerService.createEntry(tx, {
                userId: testUser.id,
                type: TRANSACTION_TYPES.BONUS,
                amount: 0.1,
                referenceType: REFERENCE_TYPES.SYSTEM,
                referenceId: testUser.id,
                metadata: { batch: "stress", index: i },
              });
            })
          ),
        ...Array(50)
          .fill(null)
          .map((_, i) =>
            db.transaction(async (tx) => {
              return await ledgerService.createEntry(tx, {
                userId: testUser.id,
                type: TRANSACTION_TYPES.WITHDRAWAL,
                amount: -0.1,
                referenceType: REFERENCE_TYPES.SYSTEM,
                referenceId: testUser.id,
                metadata: { batch: "stress", index: i },
              });
            })
          ),
      ];

      await Promise.all(operations);

      const balanceAfter = await getBalance(testUser.id);
      const ledgerSum = await getLedgerSum(testUser.id);

      // Balance should be unchanged (50 * 0.10 - 50 * 0.10 = 0)
      assertApprox(
        balanceAfter,
        balanceBefore,
        0.01,
        "Balance should be unchanged"
      );
      assertApprox(
        balanceAfter,
        ledgerSum,
        0.01,
        "Balance should match ledger"
      );
    });

    await test("Final audit shows no mismatches", async () => {
      const mismatches = await ledgerService.findBalanceMismatches();

      assert(
        mismatches.length === 0,
        "Should have no balance mismatches after all operations"
      );
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
