/**
 * Setup Verification Script
 *
 * Verifies that:
 * 1. Environment variables are loaded
 * 2. Database connection works
 * 3. Redis connection works
 * 4. All tables exist
 * 5. All triggers exist
 * 6. All constraints exist
 */

import env from "../config/env.js";
import DBClient from "../utils/db.js";
import RedisClient from "../utils/redis.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

function success(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function error(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function info(msg) {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

function section(msg) {
  console.log(`\n${YELLOW}=== ${msg} ===${RESET}`);
}

async function verifySetup() {
  let hasErrors = false;

  try {
    // 1. Environment Variables
    section("Environment Variables");

    if (
      env.DB_HOST &&
      env.DB_PORT &&
      env.DB_NAME &&
      env.DB_USER &&
      env.DB_PASSWORD
    ) {
      success("All required environment variables loaded");
      info(`  Database: ${env.DB_NAME} on ${env.DB_HOST}:${env.DB_PORT}`);
      info(`  User: ${env.DB_USER}`);
    } else {
      error("Missing required environment variables");
      hasErrors = true;
      return;
    }

    // 2. Database Connection
    section("Database Connection");

    const db = new DBClient({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    });

    try {
      await db.connect();
      success("Database connection successful");
    } catch (err) {
      error(`Database connection failed: ${err.message}`);
      hasErrors = true;
      return;
    }

    // 3. Redis Connection
    section("Redis Connection");

    const redis = new RedisClient();

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for connection

      if (redis.isAlive()) {
        success("Redis connection successful");
      } else {
        error("Redis connection failed");
        hasErrors = true;
      }
    } catch (err) {
      error(`Redis error: ${err.message}`);
      hasErrors = true;
    }

    // 4. Check Tables
    section("Database Tables");

    const expectedTables = [
      "users",
      "ads",
      "ad_engagements",
      "submissions",
      "wallet_ledger",
      "withdrawals",
      "admin_logs",
    ];

    const tableResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const existingTables = tableResult.rows.map((r) => r.tablename);

    for (const table of expectedTables) {
      if (existingTables.includes(table)) {
        success(`Table '${table}' exists`);
      } else {
        error(`Table '${table}' missing`);
        hasErrors = true;
      }
    }

    // 5. Check Triggers
    section("Database Triggers");

    const triggerResult = await db.query(`
      SELECT tgname 
      FROM pg_trigger 
      WHERE tgisinternal = false
      ORDER BY tgname
    `);

    const triggers = triggerResult.rows.map((r) => r.tgname);

    const expectedTriggers = [
      "prevent_ledger_updates",
      "prevent_ledger_deletes",
      "update_balance_on_ledger_insert",
      "validate_status_transition",
      "validate_withdrawal_transition",
      "validate_amount_before_insert",
    ];

    for (const trigger of expectedTriggers) {
      if (triggers.includes(trigger)) {
        success(`Trigger '${trigger}' exists`);
      } else {
        error(`Trigger '${trigger}' missing`);
        hasErrors = true;
      }
    }

    // 6. Check Functions
    section("Database Functions");

    const functionResult = await db.query(`
      SELECT proname 
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      ORDER BY proname
    `);

    const functions = functionResult.rows.map((r) => r.proname);

    const expectedFunctions = [
      "calculate_balance_from_ledger",
      "audit_user_balance",
      "audit_all_balances",
    ];

    for (const func of expectedFunctions) {
      if (functions.includes(func)) {
        success(`Function '${func}' exists`);
      } else {
        error(`Function '${func}' missing`);
        hasErrors = true;
      }
    }

    // 7. Check Constraints
    section("Table Constraints");

    const constraintResult = await db.query(`
      SELECT conname, conrelid::regclass as table_name
      FROM pg_constraint
      WHERE contype = 'c'
      AND connamespace = 'public'::regnamespace
      ORDER BY table_name, conname
    `);

    const constraints = constraintResult.rows;

    const expectedConstraints = [
      "balance_non_negative",
      "valid_role",
      "valid_transaction_type",
      "amount_not_zero",
      "valid_submission_status",
      "valid_withdrawal_status",
      "amount_positive",
    ];

    for (const constraintName of expectedConstraints) {
      const found = constraints.find((c) => c.conname === constraintName);
      if (found) {
        success(`Constraint '${constraintName}' exists on ${found.table_name}`);
      } else {
        error(`Constraint '${constraintName}' missing`);
        hasErrors = true;
      }
    }

    // 8. Test Audit Functions
    section("Audit Function Test");

    try {
      await db.query("SELECT calculate_balance_from_ledger($1)", [
        "00000000-0000-0000-0000-000000000000",
      ]);
      success("Audit functions callable");
    } catch (err) {
      error(`Audit functions error: ${err.message}`);
      hasErrors = true;
    }

    // Cleanup
    await db.disconnect();

    // Summary
    section("Summary");

    if (hasErrors) {
      console.log(`\n${RED}✗ Setup verification FAILED${RESET}`);
      console.log(
        `${YELLOW}Please run migrations: npm run migrate:up${RESET}\n`
      );
      process.exit(1);
    } else {
      console.log(`\n${GREEN}✓ All checks passed! Database is ready.${RESET}`);
      console.log(`${BLUE}You can now run: npm run test:constraints${RESET}\n`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\n${RED}Fatal error: ${err.message}${RESET}\n`);
    console.error(err.stack);
    process.exit(1);
  }
}

verifySetup();
