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

  pgm.createFunction(
    "validate_submission_status_transition",
    [],
    {
      returns: "trigger",
      language: ["plpgsql"],
      replaced: true,
    },
    `
    BEGIN
      -- Define valid transitions
      -- pending -> under_review -> approved/rejected


      IF OLD.status = 'pending' AND NEWS.status NOT IN ('under_review', 'pending') THEN
        RAISE EXCEPTION 'Invalid transition: Pending can only move to under_review';
      END IF;

      IF OLD.status = 'under_review' AND NEW.status NOT IN ('approved', 'rejected', 'under_review')
        RAISE EXCEPTION 'Invalid transition: under_review can only move to approved or rejected';
      END IF

      IF OLD.status = IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Cannot change status once approved or rejected';
      END IF;

      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger("submissions", "validate_status_transition", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "validate_submission_status_transition",
    level: "ROW",
  });

  pgm.createFunction(
    "validate_withdrawal_status_transition",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
    BEGIN
      -- pending -> processing -> completed/failed
      
      IF OLD.status = 'pending' AND NEW.status NOT IN ('processing', 'cancelled', 'pending') THEN
        RAISE EXCEPTION 'Invalid transition: pending can only move to processing or cancelled';
      END IF;
      
      IF OLD.status = 'processing' AND NEW.status NOT IN ('completed', 'failed', 'processing') THEN
        RAISE EXCEPTION 'Invalid transition: processing can only move to completed or failed';
      END IF;
      
      IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot change status once finalized';
      END IF;
      
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger("withdrawals", "validate_withdrawal_transition", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "validate_withdrawal_status_transition",
    level: "ROW",
  });

  gm.createIndex("users", "email", { unique: true });
  pgm.createIndex("users", "phone", {
    unique: true,
    where: "phone IS NOT NULL",
  });
  pgm.createIndex("users", "role");
  pgm.createIndex("users", "is_blocked");

  pgm.createIndex("wallet_ledger", "user_id");
  pgm.createIndex("wallet_ledger", "type");
  pgm.createIndex("wallet_ledger", "created_at");
  pgm.createIndex("wallet_ledger", ["reference_type", "reference_id"]);

  pgm.createIndex("wallet_ledger", ["user_id", "created_at"]);

  pgm.createIndex("submissions", "user_id");
  pgm.createIndex("submissions", "ad_id");
  pgm.createIndex("submissions", "status");
  pgm.createIndex("submissions", "created_at");
  pgm.createIndex("submissions", ["status", "created_at"]);

  pgm.createIndex("withdrawals", "user_id");
  pgm.createIndex("withdrawals", "status");
  pgm.createIndex("withdrawals", "created_at");
  pgm.createIndex("withdrawals", ["status", "created_at"]);

  pgm.createIndex("ads", "status");
  pgm.createIndex("ads", "created_at");

  pgm.createIndex("admin_logs", "admin_id");
  pgm.createIndex("admin_logs", ["resource_type", "resource_id"]);
  pgm.createIndex("admin_logs", "created_at");

  pgm.createIndex("ad_engagements", "user_id");
  pgm.createIndex("ad_engagements", "ad_id");
  pgm.createIndex("ad_engagements", "created_at");
  pgm.createIndex("ad_engagements", ["user_id", "ad_id"]);
}
