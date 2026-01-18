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
