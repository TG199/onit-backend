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

export async function up(pgm) {
  // ============================================
  // 1. WALLET LEDGER IMMUTABILITY
  // ============================================

  // Prevent updates to ledger entries (immutable once written)
  pgm.createFunction(
    "prevent_ledger_modification",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
    BEGIN
      RAISE EXCEPTION 'Wallet ledger entries are immutable and cannot be modified';
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

  // ============================================
  // 2. BALANCE CONSISTENCY ENFORCEMENT
  // ============================================

  // Automatically update user balance when ledger entry created
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
      -- Lock the user row to prevent race conditions
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

  pgm.createTrigger("wallet_ledger", "update_balance_on_ledger_insert", {
    when: "AFTER",
    operation: "INSERT",
    function: "update_user_balance",
    level: "ROW",
  });

  // ============================================
  // 3. CONSTRAINTS
  // ============================================

  // Users table constraints
  pgm.addConstraint("users", "balance_non_negative", {
    check: "balance >= 0",
  });

  pgm.addConstraint("users", "valid_role", {
    check: "role IN ('user', 'admin')",
  });

  // Wallet ledger constraints
  pgm.addConstraint("wallet_ledger", "valid_transaction_type", {
    check:
      "type IN ('ad_payout', 'withdrawal', 'refund', 'bonus', 'adjustment')",
  });

  pgm.addConstraint("wallet_ledger", "valid_reference_type", {
    check:
      "reference_type IN ('submission', 'withdrawal', 'admin_action', 'system')",
  });

  pgm.addConstraint("wallet_ledger", "amount_not_zero", {
    check: "amount != 0",
  });

  // Submissions constraints
  pgm.addConstraint("submissions", "valid_submission_status", {
    check: "status IN ('pending', 'under_review', 'approved', 'rejected')",
  });

  // Withdrawals constraints
  pgm.addConstraint("withdrawals", "valid_withdrawal_status", {
    check:
      "status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')",
  });

  pgm.addConstraint("withdrawals", "amount_positive", {
    check: "amount > 0",
  });

  pgm.addConstraint("withdrawals", "valid_method", {
    check: "method IN ('bank_transfer', 'paypal', 'crypto', 'mobile_money')",
  });

  // Ads constraints
  pgm.addConstraint("ads", "payout_positive", {
    check: "payout_per_view > 0",
  });

  pgm.addConstraint("ads", "valid_ad_status", {
    check: "status IN ('active', 'paused', 'expired')",
  });

  // ============================================
  // 4. STATE TRANSITION VALIDATION
  // ============================================

  // Prevent invalid submission status transitions
  pgm.createFunction(
    "validate_submission_status_transition",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
    BEGIN
      -- Define valid transitions
      -- pending -> under_review -> approved/rejected
      
      IF OLD.status = 'pending' AND NEW.status NOT IN ('under_review', 'pending') THEN
        RAISE EXCEPTION 'Invalid transition: pending can only move to under_review';
      END IF;
      
      IF OLD.status = 'under_review' AND NEW.status NOT IN ('approved', 'rejected', 'under_review') THEN
        RAISE EXCEPTION 'Invalid transition: under_review can only move to approved or rejected';
      END IF;
      
      IF OLD.status IN ('approved', 'rejected') THEN
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

  // Prevent invalid withdrawal status transitions
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

  // ============================================
  // 5. PERFORMANCE INDEXES
  // ============================================

  // Users indexes
  pgm.createIndex("users", "email", { unique: true });
  pgm.createIndex("users", "phone", {
    unique: true,
    where: "phone IS NOT NULL",
  });
  pgm.createIndex("users", "role");
  pgm.createIndex("users", "is_blocked");

  // Wallet ledger indexes
  pgm.createIndex("wallet_ledger", "user_id");
  pgm.createIndex("wallet_ledger", "type");
  pgm.createIndex("wallet_ledger", "created_at");
  pgm.createIndex("wallet_ledger", ["reference_type", "reference_id"]);

  // Composite index for balance calculation queries
  pgm.createIndex("wallet_ledger", ["user_id", "created_at"]);

  // Submissions indexes
  pgm.createIndex("submissions", "user_id");
  pgm.createIndex("submissions", "ad_id");
  pgm.createIndex("submissions", "status");
  pgm.createIndex("submissions", "created_at");
  pgm.createIndex("submissions", ["status", "created_at"]); // For admin queue

  // Withdrawals indexes
  pgm.createIndex("withdrawals", "user_id");
  pgm.createIndex("withdrawals", "status");
  pgm.createIndex("withdrawals", "created_at");
  pgm.createIndex("withdrawals", ["status", "created_at"]); // For admin queue

  // Ads indexes
  pgm.createIndex("ads", "status");
  pgm.createIndex("ads", "created_at");

  // Admin logs indexes
  pgm.createIndex("admin_logs", "admin_id");
  pgm.createIndex("admin_logs", ["resource_type", "resource_id"]);
  pgm.createIndex("admin_logs", "created_at");

  // Ad engagements indexes
  pgm.createIndex("ad_engagements", "user_id");
  pgm.createIndex("ad_engagements", "ad_id");
  pgm.createIndex("ad_engagements", "created_at");
  pgm.createIndex("ad_engagements", ["user_id", "ad_id"]); // For duplicate detection

  // ============================================
  // 6. AUDIT HELPER FUNCTIONS
  // ============================================

  // Function to calculate user balance from ledger (for reconciliation)
  pgm.createFunction(
    "calculate_balance_from_ledger",
    [{ name: "p_user_id", type: "uuid" }],
    {
      returns: "numeric",
      language: "sql",
      replace: true,
    },
    `
    SELECT COALESCE(SUM(amount), 0)
    FROM wallet_ledger
    WHERE user_id = p_user_id;
    `
  );

  // Function to verify ledger integrity for a user
  pgm.createFunction(
    "audit_user_balance",
    [{ name: "p_user_id", type: "uuid" }],
    {
      returns:
        "table(user_id uuid, stored_balance numeric, ledger_balance numeric, is_consistent boolean)",
      language: "sql",
      replace: true,
    },
    `
    SELECT 
      u.id as user_id,
      u.balance as stored_balance,
      calculate_balance_from_ledger(u.id) as ledger_balance,
      u.balance = calculate_balance_from_ledger(u.id) as is_consistent
    FROM users u
    WHERE u.id = p_user_id;
    `
  );

  // Function to audit ALL users (for nightly reconciliation)
  pgm.createFunction(
    "audit_all_balances",
    [],
    {
      returns:
        "table(user_id uuid, stored_balance numeric, ledger_balance numeric, difference numeric)",
      language: "sql",
      replace: true,
    },
    `
    SELECT 
      u.id as user_id,
      u.balance as stored_balance,
      calculate_balance_from_ledger(u.id) as ledger_balance,
      u.balance - calculate_balance_from_ledger(u.id) as difference
    FROM users u
    WHERE u.balance != calculate_balance_from_ledger(u.id);
    `
  );

  // ============================================
  // 7. ADDITIONAL SAFETY CHECKS
  // ============================================

  // Prevent duplicate submissions for same ad within short time window
  pgm.createIndex("submissions", ["user_id", "ad_id", "created_at"]);

  // Prevent withdrawal amount exceeding balance
  pgm.createFunction(
    "validate_withdrawal_amount",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
      replace: true,
    },
    `
    BEGIN
      DECLARE
        user_balance numeric;
      BEGIN
        SELECT balance INTO user_balance FROM users WHERE id = NEW.user_id;
        
        IF NEW.amount > user_balance THEN
          RAISE EXCEPTION 'Withdrawal amount (%) exceeds balance (%)', NEW.amount, user_balance;
        END IF;
        
        RETURN NEW;
      END;
    END;
    `
  );

  pgm.createTrigger("withdrawals", "validate_amount_before_insert", {
    when: "BEFORE",
    operation: "INSERT",
    function: "validate_withdrawal_amount",
    level: "ROW",
  });
}

export async function down(pgm) {
  // Drop in reverse order to handle dependencies

  // Drop triggers
  pgm.dropTrigger("withdrawals", "validate_amount_before_insert", {
    ifExists: true,
  });
  pgm.dropTrigger("withdrawals", "validate_withdrawal_transition", {
    ifExists: true,
  });
  pgm.dropTrigger("submissions", "validate_status_transition", {
    ifExists: true,
  });
  pgm.dropTrigger("wallet_ledger", "update_balance_on_ledger_insert", {
    ifExists: true,
  });
  pgm.dropTrigger("wallet_ledger", "prevent_ledger_deletes", {
    ifExists: true,
  });
  pgm.dropTrigger("wallet_ledger", "prevent_ledger_updates", {
    ifExists: true,
  });

  // Drop functions
  pgm.dropFunction("validate_withdrawal_amount", [], { ifExists: true });
  pgm.dropFunction("audit_all_balances", [], { ifExists: true });
  pgm.dropFunction("audit_user_balance", [{ type: "uuid" }], {
    ifExists: true,
  });
  pgm.dropFunction("calculate_balance_from_ledger", [{ type: "uuid" }], {
    ifExists: true,
  });
  pgm.dropFunction("validate_withdrawal_status_transition", [], {
    ifExists: true,
  });
  pgm.dropFunction("validate_submission_status_transition", [], {
    ifExists: true,
  });
  pgm.dropFunction("update_user_balance", [], { ifExists: true });
  pgm.dropFunction("prevent_ledger_modification", [], { ifExists: true });

  // Drop indexes (they'll be automatically dropped with constraints, but explicit is better)
  pgm.dropIndex("ad_engagements", ["user_id", "ad_id"], { ifExists: true });
  pgm.dropIndex("admin_logs", "created_at", { ifExists: true });
  pgm.dropIndex("withdrawals", ["status", "created_at"], { ifExists: true });
  pgm.dropIndex("submissions", ["status", "created_at"], { ifExists: true });
  pgm.dropIndex("wallet_ledger", ["user_id", "created_at"], { ifExists: true });

  // Drop constraints
  pgm.dropConstraint("ads", "valid_ad_status", { ifExists: true });
  pgm.dropConstraint("ads", "payout_positive", { ifExists: true });
  pgm.dropConstraint("withdrawals", "valid_method", { ifExists: true });
  pgm.dropConstraint("withdrawals", "amount_positive", { ifExists: true });
  pgm.dropConstraint("withdrawals", "valid_withdrawal_status", {
    ifExists: true,
  });
  pgm.dropConstraint("submissions", "valid_submission_status", {
    ifExists: true,
  });
  pgm.dropConstraint("wallet_ledger", "amount_not_zero", { ifExists: true });
  pgm.dropConstraint("wallet_ledger", "valid_reference_type", {
    ifExists: true,
  });
  pgm.dropConstraint("wallet_ledger", "valid_transaction_type", {
    ifExists: true,
  });
  pgm.dropConstraint("users", "valid_role", { ifExists: true });
  pgm.dropConstraint("users", "balance_non_negative", { ifExists: true });
}
