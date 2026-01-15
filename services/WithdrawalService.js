/**
 * Withdrawal Service
 *
 * Handles user withdrawal requests
 */

import { v4 as uuidv4 } from "uuid";
import {
  WITHDRAWAL_STATUS,
  WITHDRAWAL_METHODS,
  MINIMUMS,
  RATE_LIMITS,
  isValidEnum,
} from "../utils/constants.js";
import {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  RateLimitError,
  ForbiddenError,
} from "../utils/errors.js";
import LedgerService from "./LedgerService.js";

class WithdrawalService {
  constructor(dbClient) {
    this.db = dbClient;
    this.ledgerService = new LedgerService(dbClient);
  }

  /**
   * Request a withdrawal
   *
   * @param {string} userId - User UUID
   * @param {number} amount - Withdrawal amount
   * @param {string} method - Withdrawal method
   * @param {Object} paymentDetails - Payment details (account number, etc.)
   * @returns {Promise<Object>} Created withdrawal request
   */
  async requestWithdrawal(userId, amount, method, paymentDetails) {
    // Validate inputs
    this._validateWithdrawalRequest(amount, method, paymentDetails);

    return await this.db.transaction(async (tx) => {
      // 1. Lock user and check balance
      const userResult = await tx.query(
        "SELECT id, balance, is_blocked FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError("User", userId);
      }

      const user = userResult.rows[0];

      if (user.is_blocked) {
        throw new ForbiddenError("Account is blocked");
      }

      const currentBalance = parseFloat(user.balance);

      // Check sufficient balance
      if (currentBalance < amount) {
        throw new InsufficientBalanceError(currentBalance, amount);
      }

      // 2. Check rate limit (max withdrawals per week)
      const rateLimitCheck = await tx.query(
        `SELECT COUNT(*) as count 
         FROM withdrawals 
         WHERE user_id = $1 
         AND created_at > NOW() - INTERVAL '7 days'`,
        [userId]
      );

      if (
        parseInt(rateLimitCheck.rows[0].count) >=
        RATE_LIMITS.WITHDRAWALS_PER_WEEK
      ) {
        throw new RateLimitError(
          `Maximum ${RATE_LIMITS.WITHDRAWALS_PER_WEEK} withdrawals per week`,
          7 * 24 * 60 * 60 // Retry after 7 days
        );
      }

      // 3. Check for pending withdrawals
      const pendingCheck = await tx.query(
        `SELECT id FROM withdrawals 
         WHERE user_id = $1 
         AND status IN ($2, $3)`,
        [userId, WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING]
      );

      if (pendingCheck.rows.length > 0) {
        throw new ValidationError(
          "You already have a pending withdrawal request"
        );
      }

      // 4. Create withdrawal request (balance will be deducted when processed)
      const withdrawalResult = await tx.query(
        `INSERT INTO withdrawals (id, user_id, amount, method, payment_details, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, amount, method, status, created_at`,
        [
          uuidv4(),
          userId,
          amount,
          method,
          JSON.stringify(paymentDetails),
          WITHDRAWAL_STATUS.PENDING,
        ]
      );

      return {
        id: withdrawalResult.rows[0].id,
        userId: withdrawalResult.rows[0].user_id,
        amount: parseFloat(withdrawalResult.rows[0].amount),
        method: withdrawalResult.rows[0].method,
        status: withdrawalResult.rows[0].status,
        createdAt: withdrawalResult.rows[0].created_at,
      };
    });
  }

  /**
   * Get user's withdrawal history
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Withdrawals
   */
  async getUserWithdrawals(
    userId,
    { limit = 50, offset = 0, status = null } = {}
  ) {
    let query = `
      SELECT 
        id,
        amount,
        method,
        status,
        transaction_hash,
        failure_reason,
        created_at,
        processed_at,
        completed_at
      FROM withdrawals
      WHERE user_id = $1
    `;

    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      amount: parseFloat(row.amount),
      method: row.method,
      status: row.status,
      transactionHash: row.transaction_hash,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      completedAt: row.completed_at,
    }));
  }
}
