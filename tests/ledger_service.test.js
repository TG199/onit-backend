/**
 * Ledger Service Tests
 *
 * Tests the core money operations service
 */

import DBClient from "../utils/db.js";
import LedgerService from "../services/LedgerService.js";
import env from "../config/env.js";
import { TRANSACTION_TYPES, REFERENCE_TYPES } from "../utils/constants.js";
import {
  ValidationError,
  InsufficientBalanceError,
  NotFoundError,
} from "../utils/errors.js";

const db = new DBClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

const ledgerService = new LedgerService(db);

// Colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passCount = 0;
let failCount = 0;
let testUserId;

async function test(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passCount++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}${error.message}${RESET}`);
    failCount++;
  }
}

async function expectError(fn, ErrorClass) {
  try {
    await fn();
    throw new Error(`Expected ${ErrorClass.name} but operation succeeded`);
  } catch (error) {
    if (!(error instanceof ErrorClass)) {
      throw new Error(
        `Expected ${ErrorClass.name} but got: ${error.constructor.name} - ${error.message}`
      );
    }
  }
}

async function runTests() {
  console.log(`${YELLOW}Starting Ledger Service Tests...${RESET}\n`);

  await db.connect();

  try {
    // Setup: Create test user
    const userResult = await db.query(
      `INSERT INTO users (email, phone, password_hash) 
       VALUES ($1, $2, $3) RETURNING id`,
      ["ledger-test@example.com", "+1234567891", "hash123"]
    );
    testUserId = userResult.rows[0].id;

    // ============================================
    // 1. VALIDATION TESTS
    // ============================================
    console.log("\n--- Validation Tests ---");

    await test("Rejects missing userId", async () => {
      await db.transaction(async (tx) => {
        await expectError(
          () =>
            ledgerService.createEntry(tx, {
              type: TRANSACTION_TYPES.BONUS,
              amount: 10.0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUserId,
            }),
          ValidationError
        );
      });
    });

    await test("Rejects invalid transaction type", async () => {
      await db.transaction(async (tx) => {
        await expectError(
          () =>
            ledgerService.createEntry(tx, {
              userId: testUserId,
              type: "invalid_type",
              amount: 10.0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUserId,
            }),
          ValidationError
        );
      });
    });

    await test("Rejects zero amount", async () => {
      await db.transaction(async (tx) => {
        await expectError(
          () =>
            ledgerService.createEntry(tx, {
              userId: testUserId,
              type: TRANSACTION_TYPES.BONUS,
              amount: 0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUserId,
            }),
          ValidationError
        );
      });
    });

    await test("Rejects invalid reference type", async () => {
      await db.transaction(async (tx) => {
        await expectError(
          () =>
            ledgerService.createEntry(tx, {
              userId: testUserId,
              type: TRANSACTION_TYPES.BONUS,
              amount: 10.0,
              referenceType: "invalid_ref",
              referenceId: testUserId,
            }),
          ValidationError
        );
      });
    });

    // ============================================
    // 2. BASIC OPERATIONS
    // ============================================
    console.log("\n--- Basic Operations ---");

    await test("Creates credit entry successfully", async () => {
      const entry = await db.transaction(async (tx) => {
        return await ledgerService.createEntry(tx, {
          userId: testUserId,
          type: TRANSACTION_TYPES.BONUS,
          amount: 10.0,
          referenceType: REFERENCE_TYPES.SYSTEM,
          referenceId: testUserId,
          metadata: { reason: "Welcome bonus" },
        });
      });

      if (!entry || !entry.id) {
        throw new Error("Entry not created");
      }
    });

    await test("Balance updated after credit", async () => {
      const balance = await ledgerService.getBalance(testUserId);
      if (Math.abs(balance - 10.0) > 0.01) {
        throw new Error(`Expected balance 10.00, got ${balance}`);
      }
    });

    await test("Creates debit entry successfully", async () => {
      await db.transaction(async (tx) => {
        return await ledgerService.createEntry(tx, {
          userId: testUserId,
          type: TRANSACTION_TYPES.WITHDRAWAL,
          amount: -5.0,
          referenceType: REFERENCE_TYPES.SYSTEM,
          referenceId: testUserId,
        });
      });

      const balance = await ledgerService.getBalance(testUserId);
      if (Math.abs(balance - 5.0) > 0.01) {
        throw new Error(`Expected balance 5.00, got ${balance}`);
      }
    });

    // ============================================
    // 3. INSUFFICIENT BALANCE TESTS
    // ============================================
    console.log("\n--- Insufficient Balance Tests ---");

    await test("Rejects debit that would cause negative balance", async () => {
      await db.transaction(async (tx) => {
        await expectError(
          () =>
            ledgerService.createEntry(tx, {
              userId: testUserId,
              type: TRANSACTION_TYPES.WITHDRAWAL,
              amount: -100.0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUserId,
            }),
          InsufficientBalanceError
        );
      });
    });

    await test("Balance unchanged after failed debit", async () => {
      const balance = await ledgerService.getBalance(testUserId);
      if (Math.abs(balance - 5.0) > 0.01) {
        throw new Error(`Balance should still be 5.00, got ${balance}`);
      }
    });

    // ============================================
    // 4. TRANSACTION HISTORY
    // ============================================
    console.log("\n--- Transaction History ---");

    await test("Gets transaction history", async () => {
      const history = await ledgerService.getTransactionHistory(testUserId);

      if (!Array.isArray(history) || history.length === 0) {
        throw new Error("Should have transaction history");
      }

      // Should have 2 transactions (1 credit, 1 debit)
      if (history.length !== 2) {
        throw new Error(`Expected 2 transactions, got ${history.length}`);
      }
    });

    await test("History ordered by newest first", async () => {
      const history = await ledgerService.getTransactionHistory(testUserId);

      if (new Date(history[0].createdAt) < new Date(history[1].createdAt)) {
        throw new Error("History not ordered by newest first");
      }
    });

    await test("Filters history by type", async () => {
      const history = await ledgerService.getTransactionHistory(testUserId, {
        type: TRANSACTION_TYPES.BONUS,
      });

      if (history.length !== 1) {
        throw new Error(`Expected 1 bonus transaction, got ${history.length}`);
      }

      if (history[0].type !== TRANSACTION_TYPES.BONUS) {
        throw new Error("Filter not applied correctly");
      }
    });

    // ============================================
    // 5. STATISTICS
    // ============================================
    console.log("\n--- Statistics ---");

    await test("Gets transaction statistics", async () => {
      const stats = await ledgerService.getTransactionStats(testUserId);

      if (stats.totalTransactions !== 2) {
        throw new Error(
          `Expected 2 total transactions, got ${stats.totalTransactions}`
        );
      }

      if (Math.abs(stats.totalEarned - 10.0) > 0.01) {
        throw new Error(`Expected 10.00 earned, got ${stats.totalEarned}`);
      }

      if (Math.abs(stats.totalWithdrawn - 5.0) > 0.01) {
        throw new Error(`Expected 5.00 withdrawn, got ${stats.totalWithdrawn}`);
      }
    });

    // ============================================
    // 6. AUDIT FUNCTIONS
    // ============================================
    console.log("\n--- Audit Functions ---");

    await test("Calculates balance from ledger", async () => {
      const ledgerBalance = await ledgerService.calculateBalanceFromLedger(
        testUserId
      );
      const storedBalance = await ledgerService.getBalance(testUserId);

      if (Math.abs(ledgerBalance - storedBalance) > 0.01) {
        throw new Error(
          `Ledger balance (${ledgerBalance}) doesn't match stored (${storedBalance})`
        );
      }
    });

    await test("Audits user balance correctly", async () => {
      const audit = await ledgerService.auditUserBalance(testUserId);

      if (!audit.isConsistent) {
        throw new Error(
          `Balance mismatch: stored=${audit.storedBalance}, ledger=${audit.ledgerBalance}`
        );
      }
    });

    await test("Finds no balance mismatches", async () => {
      const mismatches = await ledgerService.findBalanceMismatches();

      if (mismatches.length > 0) {
        throw new Error(`Found ${mismatches.length} balance mismatches`);
      }
    });

    // ============================================
    // 7. TRANSACTION ROLLBACK TEST
    // ============================================
    console.log("\n--- Transaction Rollback ---");

    await test("Transaction rolls back on error", async () => {
      const balanceBefore = await ledgerService.getBalance(testUserId);

      try {
        await db.transaction(async (tx) => {
          // Create valid entry
          await ledgerService.createEntry(tx, {
            userId: testUserId,
            type: TRANSACTION_TYPES.BONUS,
            amount: 20.0,
            referenceType: REFERENCE_TYPES.SYSTEM,
            referenceId: testUserId,
          });

          // Force error (intentional failure)
          throw new Error("Intentional error to test rollback");
        });
      } catch (error) {
        // Expected to fail
      }

      const balanceAfter = await ledgerService.getBalance(testUserId);

      if (Math.abs(balanceAfter - balanceBefore) > 0.01) {
        throw new Error("Transaction not rolled back properly");
      }
    });

    // ============================================
    // 8. CONCURRENT OPERATIONS TEST
    // ============================================
    console.log("\n--- Concurrent Operations ---");

    await test("Handles concurrent credits correctly", async () => {
      const balanceBefore = await ledgerService.getBalance(testUserId);

      // Create 5 concurrent credit operations
      const operations = Array(5)
        .fill(null)
        .map(() =>
          db.transaction(async (tx) => {
            return await ledgerService.createEntry(tx, {
              userId: testUserId,
              type: TRANSACTION_TYPES.BONUS,
              amount: 1.0,
              referenceType: REFERENCE_TYPES.SYSTEM,
              referenceId: testUserId,
            });
          })
        );

      await Promise.all(operations);

      const balanceAfter = await ledgerService.getBalance(testUserId);
      const expectedBalance = balanceBefore + 5.0;

      if (Math.abs(balanceAfter - expectedBalance) > 0.01) {
        throw new Error(
          `Expected balance ${expectedBalance}, got ${balanceAfter}`
        );
      }
    });
  } finally {
    // Cleanup
    console.log("\n--- Cleanup ---");
    await db.query("DELETE FROM wallet_ledger WHERE user_id = $1", [
      testUserId,
    ]);
    await db.query("DELETE FROM users WHERE id = $1", [testUserId]);
    await db.disconnect();

    // Summary
    console.log(`\n${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`${GREEN}Passed: ${passCount}${RESET}`);
    console.log(`${RED}Failed: ${failCount}${RESET}`);

    if (failCount === 0) {
      console.log(`\n${GREEN}✓ All tests passed!${RESET}\n`);
      process.exit(0);
    } else {
      console.log(`\n${RED}✗ Some tests failed${RESET}\n`);
      process.exit(1);
    }
  }
}

runTests().catch((error) => {
  console.error(`${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});
