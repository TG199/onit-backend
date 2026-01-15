/**
 * Ledger Service
 *
 * THE SINGLE SOURCE OF TRUTH FOR ALL MONEY OPERATIONS
 *
 * Rules:
 * 1. ALL ledger entries MUST go through this service
 * 2. NEVER modify wallet_ledger directly
 * 3. ALWAYS use transactions
 * 4. ALWAYS validate amounts
 * 5. Balance is derived, not authoritative
 */

import { v4 as uuidv4 } from "uuid";
import {
  TRANSACTION_TYPES,
  REFERENCE_TYPES,
  isValidEnum,
} from "../utils/constants.js";
import {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  LedgerMismatchError,
  DatabaseError,
} from "../utils/errors.js";

class LedgerService {
  constructor(dbClient) {
    this.db = dbClient;
  }

  /**
   * Create a ledger entry (ONLY way to modify user balance)
   *
   * @param {Object} tx - Database transaction client (from db.transaction)
   * @param {Object} params - Entry parameters
   * @param {string} params.userId - User UUID
   * @param {string} params.type - Transaction type (ad_payout, withdrawal, etc.)
   * @param {number} params.amount - Amount (positive = credit, negative = debit)
   * @param {string} params.referenceType - Reference type (submission, withdrawal, etc.)
   * @param {string} params.referenceId - UUID of related record
   * @param {Object} params.metadata - Optional additional context
   * @returns {Promise<Object>} Created ledger entry
   */

  async createEntry(
    tx,
    { userId, type, amount, referenceType, referenceId, metadata = null }
  ) {
    this._validateEntryParams({
      userId,
      type,
      amount,
      referenceType,
      referenceId,
    });

    try {
      const userLock = await tx.query(
        "SELECT id, balance, FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );

      if (userLock.rows.length === 0) {
        throw new NotFoundError("User", userId);
      }

      const currentBalance = parseFloat(userLock.rows[0].balance);

      if (amount < 0 && currentBalance + amount < 0) {
        throw new InsufficientBalanceError(currentBalance, Math.abs(amount));
      }

      const result = await tx.query(
        `INSERT INTO wallet_ledger 
         (id, user_id, type, amount, balance_after, reference_type, reference_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          uuidv4(),
          userId,
          type,
          amount,
          currentBalance + amount,
          referenceType,
          referenceId,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      const verifyBalance = await tx.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
      );

      const newBalance = parseFloat(verifyBalance.rows[0].balance);
      const expectedBalance = currentBalance + amount;

      if (Math.abs(newBalance - expectedBalance) > 0.01) {
        // Allow for floating point precision
        throw new LedgerMismatchError(userId, newBalance, expectedBalance);
      }

      return result.rows[0];
    } catch (error) {
      if (
        error instanceof ValidationError ||
        error instanceof NotFoundError ||
        error instanceof InsufficientBalanceError ||
        error instanceof LedgerMismatchError
      ) {
        throw error;
      }

      throw new DatabaseError("Failed to create ledger entry", error);
    }
  }

  /**
   * Get user's current balance
   *
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Current balance
   */
  async getBalance(userId) {
    try {
      const result = await this.db.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError("User", userId);
      }

      return parseFloat(result.rows[0].balance);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError("Failed to get balance", error);
    }
  }
}
