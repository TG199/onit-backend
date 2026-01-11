/**
 * Migration: Add Financial Constraints and Triggers
 *
 * This migration hardens the database to prevent financial inconsistencies:
 * 1. Immutable wallet_ledger (prevent updates/deletes)
 * 2. Non-negative balances
 * 3. Valid status transitions
 * 4. Balance-ledger consistency
 * 5. Performance indexes
 */

import { check } from "zod";

export async function up(pgm) {
  pgm.createFunction(
    "prevent_ledge_modification",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
        BEGIN
            RAISE EXCEPTION 'Wallet ledge entries are immutable and cannot be changed';
        END;
        `
  );

  pgm.createTrigger("wallet_ledger", "prevent_ledger_updates", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "prevent_ledger_modification",
    level: "ROW",
  });

  pgm.createTrigger("wallet_ledger", "prevent_ledger_deletes", {
    when: "BEFORE",
    operation: "DELETE",
    function: "prevent_ledger_modification",
    level: "ROW",
  });

  pgm.createFunction(
    "update_user_balance",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
    BEGIN
     -- Lock the user row to prevent race conditons
     PERFORM id FROM users WHERE id = NEW.user_id FOR UPDATE;

     -- Update balance atomically
     UPDATE users
     SET
        balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Verify balance is non-negative after update
    IF (SELECT balance FROM users WHERE id = NEW.user_id) < 0 THEN
        RAISE EXCEPTION 'Balance cannot be negative for user %', NEW.user_id;
    END IF;

    RETURN NEW;
    END;
    `
  );

  pgm.createTrigger("wallet_ledger", "update_ledger_on_ledger_insert", {
    when: "AFTER",
    operation: "INSERT",
    function: "update_user_balance",
    level: "ROW",
  });
}
