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

  pgm.addConstraint("users", "balance_non_negative", {
    check: "balance >= 0",
  });

  pgm.addConstraint("users", "valid_role", {
    check: "role IN ('user', 'admin')",
  });

  pgm.addConstraint("wallet_ledger", "valid_transaction_type", {
    check:
      "type IN ('ad_payout, 'withdrawal', 'refund', 'bonus', 'adjustment')",
  });

  pgm.addConstraint("wallet_ledger", "valid_reference_type", {
    check:
      "reference_type IN ('submission', withdrswal', 'admin_action', 'system')",
  });

  pgm.addConstraint("wallet_ledger", "amount_not_zero", {
    check: "amount != 0",
  });

  pgm.addConstraint("submissions", "valid_submission_status", {
    check: "status IN ('pending', 'under_review', 'approved', 'rejected')",
  });

  pgm.addConstraint("withdrawals", "valid_withdrawal_status", {
    check:
      "status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')",
  });

  pgm.addConstraint("withdrawals", "amount_positive", {
    check: "amount > 0",
  });

  pgm.addConstraint("withdrawals", "valid_method", {
    check: "method IN ('bank_transfer', 'paypal', 'crypto', 'mobile_money'",
  });

  pgm.addConstraint("ads", "payout_positive", {
    check: "payout_per_review > 0",
  });

  pgm.addConstraint("ads", "valid_ad_status", {
    check: "status IN ('active, 'paused', 'expired'",
  });
}
