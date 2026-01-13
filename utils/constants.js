/**
 * Application Constants
 *
 * Centralized definitions for statuses, types, and other enum values
 */

// Transaction Types (wallet_ledger.type)
export const TRANSACTION_TYPES = {
  AD_PAYOUT: "ad_payout",
  WITHDRAWAL: "withdrawal",
  REFUND: "refund",
  BONUS: "bonus",
  ADJUSTMENT: "adjustment",
};

// Reference Types (wallet_ledger.reference_type)
export const REFERENCE_TYPES = {
  SUBMISSION: "submission",
  WITHDRAWAL: "withdrawal",
  ADMIN_ACTION: "admin_action",
  SYSTEM: "system",
};

// Submission Statuses
export const SUBMISSION_STATUS = {
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// Withdrawal Statuses
export const WITHDRAWAL_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

// Ad Statuses
export const AD_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
};

// User Roles
export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
};

// Withdrawal Methods
export const WITHDRAWAL_METHODS = {
  BANK_TRANSFER: "bank_transfer",
  PAYPAL: "paypal",
  CRYPTO: "crypto",
  MOBILE_MONEY: "mobile_money",
};

// Admin Actions (for logging)
export const ADMIN_ACTIONS = {
  APPROVE_SUBMISSION: "approve_submission",
  REJECT_SUBMISSION: "reject_submission",
  PROCESS_WITHDRAWAL: "process_withdrawal",
  COMPLETE_WITHDRAWAL: "complete_withdrawal",
  FAIL_WITHDRAWAL: "fail_withdrawal",
  CANCEL_WITHDRAWAL: "cancel_withdrawal",
  BLOCK_USER: "block_user",
  UNBLOCK_USER: "unblock_user",
  CREATE_AD: "create_ad",
  UPDATE_AD: "update_ad",
  PAUSE_AD: "pause_ad",
  ACTIVATE_AD: "activate_ad",
  MANUAL_ADJUSTMENT: "manual_adjustment",
};

// Rate Limits
export const RATE_LIMITS = {
  SUBMISSIONS_PER_AD_PER_DAY: 1,
  WITHDRAWALS_PER_WEEK: 3,
  MAX_UPLOAD_SIZE_MB: 10,
};

// Minimum Values
export const MINIMUMS = {
  WITHDRAWAL_AMOUNT: 10.0,
  AD_PAYOUT: 0.01,
};

// Error Codes
export const ERROR_CODES = {
  // Authentication
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_INPUT: "INVALID_INPUT",

  // Financial
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  BELOW_MINIMUM: "BELOW_MINIMUM",
  LEDGER_MISMATCH: "LEDGER_MISMATCH",

  // State
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  ALREADY_PROCESSED: "ALREADY_PROCESSED",
  NOT_FOUND: "NOT_FOUND",

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  DUPLICATE_SUBMISSION: "DUPLICATE_SUBMISSION",

  // System
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

// Resource Types (for admin logging)
export const RESOURCE_TYPES = {
  USER: "user",
  AD: "ad",
  SUBMISSION: "submission",
  WITHDRAWAL: "withdrawal",
  LEDGER: "wallet_ledger",
};

export function isValidEnum(value, enumObj) {
  return Object.values(enumObj).includes(value);
}

export function getValidValues(enumObj) {
  return Object.values(enumObj);
}
