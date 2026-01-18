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
