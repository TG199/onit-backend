/**
 * Test Helpers and Utilities
 */

import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import DBClient from "../utils/db.js";
import RedisClient from "../utils/redis.js";
import env from "../config/env.js";

// Colors for output
export const colors = {
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  RESET: "\x1b[0m",
};

// Test database client
export const db = new DBClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

export const redis = new RedisClient();

// Test tracking
let passCount = 0;
let failCount = 0;
let skipCount = 0;

/**
 * Run a test
 */
export async function test(name, fn) {
  try {
    await fn();
    console.log(`${colors.GREEN}✓${colors.RESET} ${name}`);
    passCount++;
  } catch (error) {
    console.log(`${colors.RED}✗${colors.RESET} ${name}`);
    console.log(`  ${colors.RED}${error.message}${colors.RESET}`);
    if (error.stack) {
      console.log(
        `  ${colors.RED}${error.stack.split("\n").slice(1, 3).join("\n")}${
          colors.RESET
        }`
      );
    }
    failCount++;
  }
}

/**
 * Skip a test
 */
export function skip(name, reason) {
  console.log(
    `${colors.YELLOW}⊘${colors.RESET} ${name} ${colors.YELLOW}(${reason})${colors.RESET}`
  );
  skipCount++;
}

/**
 * Test section header
 */
export function section(name) {
  console.log(`\n${colors.YELLOW}=== ${name} ===${colors.RESET}`);
}

/**
 * Print test summary
 */
export function summary() {
  console.log(`\n${colors.YELLOW}=== Test Summary ===${colors.RESET}`);
  console.log(`${colors.GREEN}Passed: ${passCount}${colors.RESET}`);
  console.log(`${colors.RED}Failed: ${failCount}${colors.RESET}`);
  if (skipCount > 0) {
    console.log(`${colors.YELLOW}Skipped: ${skipCount}${colors.RESET}`);
  }

  if (failCount === 0) {
    console.log(`\n${colors.GREEN}✓ All tests passed!${colors.RESET}\n`);
    return 0;
  } else {
    console.log(`\n${colors.RED}✗ Some tests failed${colors.RESET}\n`);
    return 1;
  }
}

/**
 * Expect error helper
 */
export async function expectError(fn, expectedMessage = null) {
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

/**
 * Assert helper
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

/**
 * Assert equal helper
 */
export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

/**
 * Assert approximately equal (for floats)
 */
export function assertApprox(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      message || `Expected ${expected} ± ${tolerance} but got ${actual}`
    );
  }
}

/**
 * Create test user
 */
export async function createTestUser(overrides = {}) {
  const id = uuidv4();
  const email = overrides.email || `test-${id.slice(0, 8)}@example.com`;
  const phone =
    overrides.phone || `+1${Math.floor(Math.random() * 1000000000)}`;
  const password = overrides.password || "password123";
  const role = overrides.role || "user";

  const passwordHash = await bcrypt.hash(password, 10);

  await db.query(
    `INSERT INTO users (id, email, phone, password_hash, role, balance)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email, phone, passwordHash, role, overrides.balance || 0]
  );

  return { id, email, phone, password, role };
}

/**
 * Create test admin
 */
export async function createTestAdmin(overrides = {}) {
  return createTestUser({ ...overrides, role: "admin" });
}

/**
 * Create test ad
 */
export async function createTestAd(overrides = {}) {
  const id = uuidv4();

  await db.query(
    `INSERT INTO ads (id, title, advertiser, target_url, payout_per_view, status, max_views)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      overrides.title || "Test Ad",
      overrides.advertiser || "Test Advertiser",
      overrides.targetUrl || "https://example.com",
      overrides.payoutPerView || 10.0,
      overrides.status || "active",
      overrides.maxViews || null,
    ]
  );

  return { id, ...overrides };
}

/**
 * Create test submission
 */
export async function createTestSubmission(userId, adId, overrides = {}) {
  const id = uuidv4();

  await db.query(
    `INSERT INTO submissions (id, user_id, ad_id, proof_url, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      userId,
      adId,
      overrides.proofUrl || "https://example.com/proof.jpg",
      overrides.status || "pending",
    ]
  );

  return { id, userId, adId, ...overrides };
}

/**
 * Create test withdrawal
 */
export async function createTestWithdrawal(userId, amount, overrides = {}) {
  const id = uuidv4();

  await db.query(
    `INSERT INTO withdrawals (id, user_id, amount, method, payment_details, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      userId,
      amount,
      overrides.method || "bank_transfer",
      JSON.stringify(
        overrides.paymentDetails || {
          accountNumber: "1234567890",
          bankName: "Test Bank",
          accountName: "Test User",
        }
      ),
      overrides.status || "pending",
    ]
  );

  return { id, userId, amount, ...overrides };
}

/**
 * Login user and get token
 */
export async function loginUser(email, password) {
  // Simulate login by creating token in Redis
  const userResult = await db.query(
    "SELECT id, role FROM users WHERE email = $1",
    [email]
  );

  if (userResult.rows.length === 0) {
    throw new Error("User not found");
  }

  const user = userResult.rows[0];
  const token = uuidv4();

  await redis.set(`auth_${token}`, user.id, 86400); // 24 hours

  return { token, userId: user.id, role: user.role };
}

/**
 * Make API request helper
 */
export async function apiRequest(method, path, options = {}) {
  const url = `http://localhost:${env.PORT}${path}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    method,
    headers,
    ...(options.body && { body: JSON.stringify(options.body) }),
  });

  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    data,
    ok: response.ok,
  };
}

/**
 * Cleanup test data
 */
export async function cleanup() {
  // Clean up in reverse order of dependencies
  await db.query(
    "DELETE FROM admin_logs WHERE admin_id IN (SELECT id FROM users WHERE email LIKE $1)",
    ["test-%"]
  );
  await db.query(
    "DELETE FROM submissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)",
    ["test-%"]
  );
  await db.query(
    "DELETE FROM withdrawals WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)",
    ["test-%"]
  );
  await db.query(
    "DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)",
    ["test-%"]
  );
  await db.query(
    "DELETE FROM ad_engagements WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)",
    ["test-%"]
  );
  await db.query("DELETE FROM ads WHERE title LIKE $1", ["Test Ad%"]);
  await db.query("DELETE FROM users WHERE email LIKE $1", ["test-%"]);
}

/**
 * Wait helper
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get current balance from database
 */
export async function getBalance(userId) {
  const result = await db.query("SELECT balance FROM users WHERE id = $1", [
    userId,
  ]);
  return parseFloat(result.rows[0].balance);
}

/**
 * Get ledger sum
 */
export async function getLedgerSum(userId) {
  const result = await db.query(
    "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_ledger WHERE user_id = $1",
    [userId]
  );
  return parseFloat(result.rows[0].total);
}
