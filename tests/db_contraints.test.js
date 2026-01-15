/**
 * Database Constraint Tests
 *
 * Tests that our database constraints work correctly
 * Run after migrations: npm run migrate:up
 */

import DBClient from "../utils/db.js";
import env from "../config/env.js";

const db = new DBClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

// Colors for terminal output
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passCount = 0;
let failCount = 0;

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

async function expectError(fn, expectedMessage) {
  try {
    await fn();
    throw new Error("Expected operation to fail but it succeeded");
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error containing "${expectedMessage}" but got: ${error.message}`
      );
    }
  }
}

async function runTests() {
  console.log(`${YELLOW}Starting Database Constraint Tests...${RESET}\n`);

  await db.connect();

  // Test user for all tests
  let testUserId;
  let testAdId;

  try {
    // Setup: Create test user
    const userResult = await db.query(
      `INSERT INTO users (email, phone, password_hash) 
       VALUES ($1, $2, $3) RETURNING id`,
      ["test@example.com", "+1234567890", "hash123"]
    );
    testUserId = userResult.rows[0].id;

    // Setup: Create test ad
    const adResult = await db.query(
      `INSERT INTO ads (title, advertiser, target_url, payout_per_view) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ["Test Ad", "Test Advertiser", "https://example.com", 10.0]
    );
    testAdId = adResult.rows[0].id;

    // ============================================
    // 1. WALLET LEDGER IMMUTABILITY TESTS
    // ============================================
    console.log("\n--- Ledger Immutability Tests ---");

    await test("Ledger entry can be inserted", async () => {
      await db.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, reference_type, reference_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [testUserId, "ad_payout", 10.0, "system", testUserId]
      );
    });

    await test("Ledger entry CANNOT be updated (immutable)", async () => {
      await expectError(
        () =>
          db.query(
            `UPDATE wallet_ledger SET amount = 20.00 WHERE user_id = $1`,
            [testUserId]
          ),
        "immutable"
      );
    });

    await test("Ledger entry CANNOT be deleted (immutable)", async () => {
      await expectError(
        () =>
          db.query(`DELETE FROM wallet_ledger WHERE user_id = $1`, [
            testUserId,
          ]),
        "immutable"
      );
    });

    // ============================================
    // 2. BALANCE CONSISTENCY TESTS
    // ============================================
    console.log("\n--- Balance Consistency Tests ---");

    await test("User balance updates automatically when ledger entry created", async () => {
      const beforeBalance = await db.query(
        "SELECT balance FROM users WHERE id = $1",
        [testUserId]
      );

      await db.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, reference_type, reference_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [testUserId, "bonus", 5.0, "system", testUserId]
      );

      const afterBalance = await db.query(
        "SELECT balance FROM users WHERE id = $1",
        [testUserId]
      );

      const diff =
        parseFloat(afterBalance.rows[0].balance) -
        parseFloat(beforeBalance.rows[0].balance);
      if (Math.abs(diff - 5.0) > 0.01) {
        throw new Error(`Expected balance to increase by 5.00, got ${diff}`);
      }
    });

    await test("Balance cannot go negative", async () => {
      await expectError(
        () =>
          db.query(
            `INSERT INTO wallet_ledger (user_id, type, amount, reference_type, reference_id) 
           VALUES ($1, $2, $3, $4, $5)`,
            [testUserId, "withdrawal", -1000.0, "system", testUserId]
          ),
        "cannot be negative"
      );
    });

    await test("Balance constraint prevents direct negative balance", async () => {
      await expectError(
        () =>
          db.query("UPDATE users SET balance = -10 WHERE id = $1", [
            testUserId,
          ]),
        "balance_non_negative"
      );
    });

    // ============================================
    // 3. CONSTRAINT VALIDATION TESTS
    // ============================================
    console.log("\n--- Constraint Validation Tests ---");

    await test("Invalid transaction type rejected", async () => {
      await expectError(
        () =>
          db.query(
            `INSERT INTO wallet_ledger (user_id, type, amount, reference_type, reference_id) 
           VALUES ($1, $2, $3, $4, $5)`,
            [testUserId, "invalid_type", 10.0, "system", testUserId]
          ),
        "valid_transaction_type"
      );
    });

    await test("Zero amount rejected", async () => {
      await expectError(
        () =>
          db.query(
            `INSERT INTO wallet_ledger (user_id, type, amount, reference_type, reference_id) 
           VALUES ($1, $2, $3, $4, $5)`,
            [testUserId, "bonus", 0, "system", testUserId]
          ),
        "amount_not_zero"
      );
    });

    await test("Invalid role rejected", async () => {
      await expectError(
        () =>
          db.query(
            `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)`,
            ["test2@example.com", "hash", "superuser"]
          ),
        "valid_role"
      );
    });

    // ============================================
    // 4. STATE TRANSITION TESTS
    // ============================================
    console.log("\n--- State Transition Tests ---");

    await test("Submission can move from pending to under_review", async () => {
      const subResult = await db.query(
        `INSERT INTO submissions (user_id, ad_id, proof_url, status) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testUserId, testAdId, "https://example.com/proof.jpg", "pending"]
      );

      await db.query("UPDATE submissions SET status = $1 WHERE id = $2", [
        "under_review",
        subResult.rows[0].id,
      ]);
    });

    await test("Submission CANNOT skip states", async () => {
      const subResult = await db.query(
        `INSERT INTO submissions (user_id, ad_id, proof_url, status) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testUserId, testAdId, "https://example.com/proof2.jpg", "pending"]
      );

      await expectError(
        () =>
          db.query("UPDATE submissions SET status = $1 WHERE id = $2", [
            "approved",
            subResult.rows[0].id,
          ]),
        "Invalid transition"
      );
    });

    await test("Approved submission CANNOT be changed", async () => {
      const subResult = await db.query(
        `INSERT INTO submissions (user_id, ad_id, proof_url, status) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testUserId, testAdId, "https://example.com/proof3.jpg", "under_review"]
      );

      await db.query("UPDATE submissions SET status = $1 WHERE id = $2", [
        "approved",
        subResult.rows[0].id,
      ]);

      await expectError(
        () =>
          db.query("UPDATE submissions SET status = $1 WHERE id = $2", [
            "rejected",
            subResult.rows[0].id,
          ]),
        "Cannot change status once approved"
      );
    });

    // ============================================
    // 5. WITHDRAWAL VALIDATION TESTS
    // ============================================
    console.log("\n--- Withdrawal Validation Tests ---");

    await test("Withdrawal amount must be positive", async () => {
      await expectError(
        () =>
          db.query(
            `INSERT INTO withdrawals (user_id, amount, method, payment_details) 
           VALUES ($1, $2, $3, $4)`,
            [testUserId, -10.0, "bank_transfer", "{}"]
          ),
        "amount_positive"
      );
    });

    await test("Withdrawal amount cannot exceed balance", async () => {
      const balance = await db.query(
        "SELECT balance FROM users WHERE id = $1",
        [testUserId]
      );

      await expectError(
        () =>
          db.query(
            `INSERT INTO withdrawals (user_id, amount, method, payment_details) 
           VALUES ($1, $2, $3, $4)`,
            [
              testUserId,
              parseFloat(balance.rows[0].balance) + 100,
              "bank_transfer",
              "{}",
            ]
          ),
        "exceeds balance"
      );
    });

    // ============================================
    // 6. AUDIT FUNCTION TESTS
    // ============================================
    console.log("\n--- Audit Function Tests ---");

    await test("Balance calculation from ledger matches stored balance", async () => {
      const result = await db.query("SELECT * FROM audit_user_balance($1)", [
        testUserId,
      ]);

      if (!result.rows[0].is_consistent) {
        throw new Error(
          `Balance mismatch: stored=${result.rows[0].stored_balance}, ledger=${result.rows[0].ledger_balance}`
        );
      }
    });

    await test("Calculate balance from ledger function works", async () => {
      const result = await db.query(
        "SELECT calculate_balance_from_ledger($1) as balance",
        [testUserId]
      );

      if (result.rows[0].balance === null) {
        throw new Error("Balance calculation returned null");
      }
    });
  } finally {
    // Cleanup: Delete test data
    console.log("\n--- Cleanup ---");
    await db.query("DELETE FROM submissions WHERE user_id = $1", [testUserId]);
    await db.query("DELETE FROM withdrawals WHERE user_id = $1", [testUserId]);
    await db.query("DELETE FROM wallet_ledger WHERE user_id = $1", [
      testUserId,
    ]);
    await db.query("DELETE FROM users WHERE id = $1", [testUserId]);
    await db.query("DELETE FROM ads WHERE id = $1", [testAdId]);

    await db.disconnect();

    // Print summary
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
