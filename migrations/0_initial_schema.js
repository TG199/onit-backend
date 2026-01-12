/**
 * Migration: Initial Database Schema
 *
 * Creates all core tables for the reward-based advertising platform
 */

export async function up(pgm) {
  // Enable UUID extension
  pgm.createExtension("uuid-ossp", { ifNotExists: true });

  // ============================================
  // 1. USERS TABLE
  // ============================================
  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    email: {
      type: "varchar(255)",
      notNull: true,
      unique: true,
    },
    phone: {
      type: "varchar(50)",
      unique: true,
    },
    password_hash: {
      type: "varchar(255)",
      notNull: true,
    },
    role: {
      type: "varchar(20)",
      notNull: true,
      default: "user",
    },
    balance: {
      type: "numeric(12,2)",
      notNull: true,
      default: 0,
    },
    location: {
      type: "varchar(255)",
    },
    is_blocked: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 2. ADS TABLE
  // ============================================
  pgm.createTable("ads", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    title: {
      type: "varchar(255)",
      notNull: true,
    },
    description: {
      type: "text",
    },
    advertiser: {
      type: "varchar(255)",
      notNull: true,
    },
    target_url: {
      type: "text",
      notNull: true,
    },
    image_url: {
      type: "text",
    },
    payout_per_view: {
      type: "numeric(10,2)",
      notNull: true,
    },
    total_budget: {
      type: "numeric(12,2)",
    },
    spent_budget: {
      type: "numeric(12,2)",
      notNull: true,
      default: 0,
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "active",
    },
    start_date: {
      type: "timestamp",
    },
    end_date: {
      type: "timestamp",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 3. AD_ENGAGEMENTS TABLE
  // ============================================
  pgm.createTable("ad_engagements", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    ad_id: {
      type: "uuid",
      notNull: true,
      references: "ads",
      onDelete: "CASCADE",
    },
    engagement_type: {
      type: "varchar(50)",
      notNull: true,
      comment: "e.g., click, view, install",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 4. SUBMISSIONS TABLE
  // ============================================
  pgm.createTable("submissions", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    ad_id: {
      type: "uuid",
      notNull: true,
      references: "ads",
      onDelete: "CASCADE",
    },
    proof_url: {
      type: "text",
      notNull: true,
      comment: "URL to uploaded screenshot/proof",
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "pending",
    },
    rejection_reason: {
      type: "text",
    },
    reviewed_by: {
      type: "uuid",
      references: "users",
    },
    reviewed_at: {
      type: "timestamp",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 5. WALLET_LEDGER TABLE (IMMUTABLE)
  // ============================================
  pgm.createTable("wallet_ledger", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    type: {
      type: "varchar(50)",
      notNull: true,
      comment: "ad_payout, withdrawal, refund, bonus, adjustment",
    },
    amount: {
      type: "numeric(12,2)",
      notNull: true,
      comment: "Positive for credit, negative for debit",
    },
    balance_after: {
      type: "numeric(12,2)",
      comment: "Balance snapshot after this transaction",
    },
    reference_type: {
      type: "varchar(50)",
      notNull: true,
      comment: "submission, withdrawal, admin_action, system",
    },
    reference_id: {
      type: "uuid",
      comment: "Foreign key to related record",
    },
    metadata: {
      type: "jsonb",
      comment: "Additional context (admin notes, error details, etc)",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 6. WITHDRAWALS TABLE
  // ============================================
  pgm.createTable("withdrawals", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    amount: {
      type: "numeric(12,2)",
      notNull: true,
    },
    method: {
      type: "varchar(50)",
      notNull: true,
      comment: "bank_transfer, paypal, crypto, mobile_money",
    },
    payment_details: {
      type: "jsonb",
      notNull: true,
      comment: "Account number, wallet address, etc",
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "pending",
    },
    transaction_hash: {
      type: "varchar(255)",
      comment: "External payment reference",
    },
    processed_by: {
      type: "uuid",
      references: "users",
    },
    processed_at: {
      type: "timestamp",
    },
    completed_at: {
      type: "timestamp",
    },
    failure_reason: {
      type: "text",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 7. ADMIN_LOGS TABLE
  // ============================================
  pgm.createTable("admin_logs", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    admin_id: {
      type: "uuid",
      notNull: true,
      references: "users",
    },
    action: {
      type: "varchar(100)",
      notNull: true,
      comment:
        "approve_submission, reject_submission, complete_withdrawal, etc",
    },
    resource_type: {
      type: "varchar(50)",
      notNull: true,
      comment: "submission, withdrawal, ad, user",
    },
    resource_id: {
      type: "uuid",
      notNull: true,
    },
    details: {
      type: "jsonb",
      comment: "Additional context about the action",
    },
    ip_address: {
      type: "inet",
    },
    user_agent: {
      type: "text",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // ============================================
  // 8. ADD COMMENTS FOR DOCUMENTATION
  // ============================================
  pgm.sql(`
    COMMENT ON TABLE wallet_ledger IS 'Immutable financial ledger - source of truth for all money';
    COMMENT ON COLUMN wallet_ledger.amount IS 'Positive values are credits, negative are debits';
    COMMENT ON TABLE submissions IS 'User proof submissions requiring admin review';
    COMMENT ON TABLE withdrawals IS 'User withdrawal requests';
  `);
}

export async function down(pgm) {
  pgm.dropTable("admin_logs", { ifExists: true, cascade: true });
  pgm.dropTable("withdrawals", { ifExists: true, cascade: true });
  pgm.dropTable("wallet_ledger", { ifExists: true, cascade: true });
  pgm.dropTable("submissions", { ifExists: true, cascade: true });
  pgm.dropTable("ad_engagements", { ifExists: true, cascade: true });
  pgm.dropTable("ads", { ifExists: true, cascade: true });
  pgm.dropTable("users", { ifExists: true, cascade: true });

  pgm.dropExtension("uuid-ossp", { ifExists: true });
}
