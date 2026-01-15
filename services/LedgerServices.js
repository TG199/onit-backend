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

  /**
   * Calculate balance from ledger (for audit purposes)
   *
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Calculated balance from ledger sum
   */
  async calculateBalanceFromLedger(userId) {
    try {
      const result = await this.db.query(
        "SELECT calculate_balance_from_ledger($1) as balance",
        [userId]
      );

      return parseFloat(result.rows[0].balance || 0);
    } catch (error) {
      throw new DatabaseError("Failed to calculate balance from ledger", error);
    }
  }

  /**
   * Audit user's balance (compare stored vs ledger)
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Audit result
   */
  async auditUserBalance(userId) {
    try {
      const result = await this.db.query(
        "SELECT * FROM audit_user_balance($1)",
        [userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError("User", userId);
      }

      const audit = result.rows[0];

      return {
        userId: audit.user_id,
        storedBalance: parseFloat(audit.stored_balance),
        ledgerBalance: parseFloat(audit.ledger_balance),
        isConsistent: audit.is_consistent,
        difference:
          parseFloat(audit.stored_balance) - parseFloat(audit.ledger_balance),
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError("Failed to audit user balance", error);
    }
  }

  /**
   * Get user's transaction history
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @param {number} options.limit - Max records to return
   * @param {number} options.offset - Pagination offset
   * @param {string} options.type - Filter by transaction type
   * @returns {Promise<Array>} Transaction history
   */
  async getTransactionHistory(
    userId,
    { limit = 50, offset = 0, type = null } = {}
  ) {
    try {
      let query = `
        SELECT 
          id,
          type,
          amount,
          balance_after,
          reference_type,
          reference_id,
          metadata,
          created_at
        FROM wallet_ledger
        WHERE user_id = $1
      `;

      const params = [userId];

      if (type) {
        query += ` AND type = $${params.length + 1}`;
        params.push(type);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${
        params.length + 2
      }`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: parseFloat(row.amount),
        balanceAfter: parseFloat(row.balance_after),
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));
    } catch (error) {
      throw new DatabaseError("Failed to get transaction history", error);
    }
  }

  /**
   * Get aggregated transaction statistics
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Transaction statistics
   */
  async getTransactionStats(userId) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_withdrawn,
          COALESCE(SUM(CASE WHEN type = $2 THEN amount ELSE 0 END), 0) as ad_earnings,
          COALESCE(SUM(CASE WHEN type = $3 THEN ABS(amount) ELSE 0 END), 0) as withdrawals
         FROM wallet_ledger
         WHERE user_id = $1`,
        [userId, TRANSACTION_TYPES.AD_PAYOUT, TRANSACTION_TYPES.WITHDRAWAL]
      );

      const stats = result.rows[0];

      return {
        totalTransactions: parseInt(stats.total_transactions),
        totalEarned: parseFloat(stats.total_earned),
        totalWithdrawn: parseFloat(stats.total_withdrawn),
        adEarnings: parseFloat(stats.ad_earnings),
        withdrawals: parseFloat(stats.withdrawals),
        netBalance:
          parseFloat(stats.total_earned) - parseFloat(stats.total_withdrawn),
      };
    } catch (error) {
      throw new DatabaseError("Failed to get transaction stats", error);
    }
  }

  /**
   * Find all users with balance mismatches (for nightly reconciliation)
   *
   * @returns {Promise<Array>} Users with mismatched balances
   */
  async findBalanceMismatches() {
    try {
      const result = await this.db.query("SELECT * FROM audit_all_balances()");

      return result.rows.map((row) => ({
        userId: row.user_id,
        storedBalance: parseFloat(row.stored_balance),
        ledgerBalance: parseFloat(row.ledger_balance),
        difference: parseFloat(row.difference),
      }));
    } catch (error) {
      throw new DatabaseError("Failed to find balance mismatches", error);
    }
  }
}
