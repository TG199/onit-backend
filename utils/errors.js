/**
 * Custom Error Classes
 *
 * Provides structured error handling with HTTP status codes
 */

import { ERROR_CODES } from "./constants.js";

/**
 * Base Application Error
 */
export class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = ERROR_CODES.INTERNAL_ERROR,
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguish from programming errors

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

/**
 * Authentication Error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

/**
 * Authorization Error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

/**
 * Resource Not Found (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = "Resource", id = null) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

/**
 * Conflict Error (409) - for duplicate resources
 */
export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, ERROR_CODES.DUPLICATE_SUBMISSION);
  }
}

/**
 * Insufficient Balance Error (400)
 */
export class InsufficientBalanceError extends AppError {
  constructor(available, required) {
    super(
      `Insufficient balance. Available: ${available}, Required: ${required}`,
      400,
      ERROR_CODES.INSUFFICIENT_BALANCE,
      { available, required }
    );
  }
}

/**
 * Invalid State Transition Error (400)
 */
export class InvalidStateError extends AppError {
  constructor(currentState, attemptedState) {
    super(
      `Invalid state transition from ${currentState} to ${attemptedState}`,
      400,
      ERROR_CODES.INVALID_STATE_TRANSITION,
      { currentState, attemptedState }
    );
  }
}

/**
 * Rate Limit Exceeded (429)
 */
export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded", retryAfter = null) {
    super(message, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED, { retryAfter });
  }
}

/**
 * Ledger Audit Failed (500) - CRITICAL
 */
export class LedgerMismatchError extends AppError {
  constructor(userId, storedBalance, ledgerBalance) {
    super(
      `CRITICAL: Balance mismatch for user ${userId}. Stored: ${storedBalance}, Ledger: ${ledgerBalance}`,
      500,
      ERROR_CODES.LEDGER_MISMATCH,
      { userId, storedBalance, ledgerBalance }
    );
  }
}

/**
 * Database Error (500)
 */
export class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, ERROR_CODES.DATABASE_ERROR);
    if (originalError) {
      this.originalError = originalError.message;
      this.sqlState = originalError.code;
    }
  }
}

/**
 * Helper to check if error is operational (expected) vs programming error
 */
export function isOperationalError(error) {
  return error instanceof AppError && error.isOperational;
}

/**
 * Helper to format error for logging
 */
export function formatErrorForLog(error) {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      stack: error.stack,
    };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}
