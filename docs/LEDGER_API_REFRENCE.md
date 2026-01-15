# Ledger Service API Reference

## Quick Reference Card

```javascript
import LedgerService from "./services/LedgerService.js";
import { TRANSACTION_TYPES, REFERENCE_TYPES } from "./utils/constants.js";

const ledger = new LedgerService(dbClient);

// Pattern: ALWAYS use transactions
await db.transaction(async (tx) => {
  await ledger.createEntry(tx, {
    userId,
    type,
    amount,
    referenceType,
    referenceId,
  });
});
```

---

## createEntry(tx, params)

**The ONLY way to create ledger entries and modify user balance.**

### Parameters

```typescript
{
  userId: string,          // User UUID (required)
  type: string,            // Transaction type (required)
  amount: number,          // Amount (required, non-zero)
  referenceType: string,   // Reference type (required)
  referenceId: string,     // Reference UUID (required)
  metadata?: object        // Optional additional context
}
```

### Transaction Types

```javascript
TRANSACTION_TYPES.AD_PAYOUT; // User earned from ad
TRANSACTION_TYPES.WITHDRAWAL; // User withdrew funds
TRANSACTION_TYPES.REFUND; // Refund to user
TRANSACTION_TYPES.BONUS; // Bonus credit
TRANSACTION_TYPES.ADJUSTMENT; // Admin adjustment
```

### Reference Types

```javascript
REFERENCE_TYPES.SUBMISSION; // Links to submission record
REFERENCE_TYPES.WITHDRAWAL; // Links to withdrawal record
REFERENCE_TYPES.ADMIN_ACTION; // Links to admin log
REFERENCE_TYPES.SYSTEM; // System operation
```

### Returns

```javascript
{
  id: 'uuid',
  user_id: 'uuid',
  type: 'ad_payout',
  amount: 10.00,
  balance_after: 15.00,
  reference_type: 'submission',
  reference_id: 'uuid',
  metadata: { ... },
  created_at: '2025-01-13T...'
}
```

### Example: Credit User

```javascript
await db.transaction(async (tx) => {
  const entry = await ledger.createEntry(tx, {
    userId: user.id,
    type: TRANSACTION_TYPES.AD_PAYOUT,
    amount: 10.0, // Positive = credit
    referenceType: REFERENCE_TYPES.SUBMISSION,
    referenceId: submission.id,
    metadata: { adId: ad.id, views: 5 },
  });
});
```

### Example: Debit User

```javascript
await db.transaction(async (tx) => {
  const entry = await ledger.createEntry(tx, {
    userId: user.id,
    type: TRANSACTION_TYPES.WITHDRAWAL,
    amount: -50.0, // Negative = debit
    referenceType: REFERENCE_TYPES.WITHDRAWAL,
    referenceId: withdrawal.id,
  });
});
```

### Throws

- `ValidationError` - Invalid parameters
- `NotFoundError` - User not found
- `InsufficientBalanceError` - Would cause negative balance
- `LedgerMismatchError` - Balance verification failed (CRITICAL)
- `DatabaseError` - Database operation failed

---

## getBalance(userId)

**Get user's current balance.**

### Parameters

```javascript
userId: string; // User UUID
```

### Returns

```javascript
number; // Current balance (e.g., 125.50)
```

### Example

```javascript
const balance = await ledger.getBalance(userId);
console.log(`Balance: $${balance.toFixed(2)}`);
```

### Throws

- `NotFoundError` - User not found
- `DatabaseError` - Query failed

---

## calculateBalanceFromLedger(userId)

**Calculate balance by summing ledger entries (for audit).**

### Parameters

```javascript
userId: string; // User UUID
```

### Returns

```javascript
number; // Calculated balance from ledger
```

### Example

```javascript
const ledgerBalance = await ledger.calculateBalanceFromLedger(userId);
const storedBalance = await ledger.getBalance(userId);

if (Math.abs(ledgerBalance - storedBalance) > 0.01) {
  console.error("MISMATCH!");
}
```

---

## auditUserBalance(userId)

**Compare stored balance vs calculated balance.**

### Parameters

```javascript
userId: string; // User UUID
```

### Returns

```javascript
{
  userId: 'uuid',
  storedBalance: 100.00,
  ledgerBalance: 100.00,
  isConsistent: true,
  difference: 0
}
```

### Example

```javascript
const audit = await ledger.auditUserBalance(userId);

if (!audit.isConsistent) {
  console.error("Balance mismatch!");
  console.error(`Stored: ${audit.storedBalance}`);
  console.error(`Ledger: ${audit.ledgerBalance}`);
  // Alert admins
}
```

---

## getTransactionHistory(userId, options)

**Get user's transaction history with pagination.**

### Parameters

```javascript
userId: string
options?: {
  limit?: number,    // Max records (default: 50)
  offset?: number,   // Pagination offset (default: 0)
  type?: string      // Filter by transaction type
}
```

### Returns

```javascript
[
  {
    id: 'uuid',
    type: 'ad_payout',
    amount: 10.00,
    balanceAfter: 110.00,
    referenceType: 'submission',
    referenceId: 'uuid',
    metadata: { ... },
    createdAt: '2025-01-13T...'
  },
  ...
]
```

### Example: Recent Transactions

```javascript
const recent = await ledger.getTransactionHistory(userId, {
  limit: 10,
});

recent.forEach((tx) => {
  console.log(`${tx.type}: $${tx.amount}`);
});
```

### Example: Filter by Type

```javascript
const payouts = await ledger.getTransactionHistory(userId, {
  type: TRANSACTION_TYPES.AD_PAYOUT,
  limit: 20,
});

console.log(`Total ad payouts: ${payouts.length}`);
```

---

## getTransactionStats(userId)

**Get aggregated transaction statistics.**

### Parameters

```javascript
userId: string; // User UUID
```

### Returns

```javascript
{
  totalTransactions: 150,
  totalEarned: 500.00,
  totalWithdrawn: 300.00,
  adEarnings: 450.00,
  withdrawals: 300.00,
  netBalance: 200.00
}
```

### Example

```javascript
const stats = await ledger.getTransactionStats(userId);

console.log(`Lifetime earnings: $${stats.totalEarned}`);
console.log(`Total withdrawn: $${stats.totalWithdrawn}`);
console.log(`Current balance: $${stats.netBalance}`);
```

---

## findBalanceMismatches()

**Find all users with balance mismatches (for nightly audits).**

### Parameters

None

### Returns

```javascript
[
  {
    userId: 'uuid',
    storedBalance: 100.00,
    ledgerBalance: 105.00,
    difference: -5.00
  },
  ...
]
```

### Example: Nightly Reconciliation

```javascript
const mismatches = await ledger.findBalanceMismatches();

if (mismatches.length > 0) {
  console.error(`CRITICAL: Found ${mismatches.length} balance mismatches!`);

  mismatches.forEach((m) => {
    console.error(`User ${m.userId}: diff = $${m.difference}`);
    // Alert admins, create tickets, etc.
  });
}
```

---

## Common Patterns

### Pattern 1: Admin Approves Submission

```javascript
async function approveSubmission(submissionId, adminId) {
  return await db.transaction(async (tx) => {
    // 1. Get submission
    const sub = await tx.query(
      "SELECT * FROM submissions WHERE id = $1 FOR UPDATE",
      [submissionId]
    );

    // 2. Get ad payout amount
    const ad = await tx.query("SELECT payout_per_view FROM ads WHERE id = $1", [
      sub.rows[0].ad_id,
    ]);

    // 3. Create ledger entry (pays user)
    await ledger.createEntry(tx, {
      userId: sub.rows[0].user_id,
      type: TRANSACTION_TYPES.AD_PAYOUT,
      amount: parseFloat(ad.rows[0].payout_per_view),
      referenceType: REFERENCE_TYPES.SUBMISSION,
      referenceId: submissionId,
      metadata: { approvedBy: adminId, adId: sub.rows[0].ad_id },
    });

    // 4. Update submission status
    await tx.query(
      "UPDATE submissions SET status = $1, reviewed_at = NOW() WHERE id = $2",
      ["approved", submissionId]
    );

    // 5. Log admin action
    await tx.query(
      "INSERT INTO admin_logs (admin_id, action, resource_type, resource_id) VALUES ($1, $2, $3, $4)",
      [adminId, "approve_submission", "submission", submissionId]
    );
  });
}
```

### Pattern 2: Process Withdrawal

```javascript
async function processWithdrawal(withdrawalId, adminId) {
  return await db.transaction(async (tx) => {
    // 1. Get withdrawal
    const w = await tx.query(
      "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
      [withdrawalId]
    );

    // 2. Deduct from balance
    await ledger.createEntry(tx, {
      userId: w.rows[0].user_id,
      type: TRANSACTION_TYPES.WITHDRAWAL,
      amount: -parseFloat(w.rows[0].amount), // Negative!
      referenceType: REFERENCE_TYPES.WITHDRAWAL,
      referenceId: withdrawalId,
      metadata: { processedBy: adminId },
    });

    // 3. Update withdrawal status
    await tx.query(
      "UPDATE withdrawals SET status = $1, processed_at = NOW() WHERE id = $2",
      ["completed", withdrawalId]
    );
  });
}
```

### Pattern 3: Refund User

```javascript
async function refundUser(userId, amount, reason) {
  return await db.transaction(async (tx) => {
    await ledger.createEntry(tx, {
      userId,
      type: TRANSACTION_TYPES.REFUND,
      amount: amount, // Positive
      referenceType: REFERENCE_TYPES.ADMIN_ACTION,
      referenceId: userId,
      metadata: { reason },
    });
  });
}
```

---

## Error Handling Best Practices

```javascript
try {
  await db.transaction(async (tx) => {
    await ledger.createEntry(tx, { ... });
  });
} catch (error) {
  // Handle specific errors
  if (error instanceof InsufficientBalanceError) {
    return res.status(400).json({
      error: 'Insufficient balance',
      details: error.details
    });
  }

  if (error instanceof ValidationError) {
    return res.status(400).json({
      error: 'Invalid input',
      message: error.message
    });
  }

  if (error instanceof LedgerMismatchError) {
    // CRITICAL - This should never happen
    console.error('LEDGER MISMATCH:', error);
    // Alert admins immediately
    return res.status(500).json({
      error: 'Internal error - admins alerted'
    });
  }

  // Unknown error
  console.error('Unexpected error:', error);
  return res.status(500).json({
    error: 'Internal server error'
  });
}
```

---

## Testing Checklist

Before deploying code that uses LedgerService:

- [ ] All operations wrapped in transactions
- [ ] All amounts validated (non-zero, correct sign)
- [ ] Error handling for InsufficientBalanceError
- [ ] Error handling for ValidationError
- [ ] Critical alerts for LedgerMismatchError
- [ ] Metadata includes context for debugging
- [ ] No direct database access to wallet_ledger
- [ ] No direct updates to users.balance
- [ ] Tested with concurrent operations
- [ ] Tested transaction rollback

---

## Performance Tips

1. **Batch Operations**: Use a single transaction for multiple entries
2. **Pagination**: Always paginate transaction history
3. **Indexes**: Ensure database indexes are in place (Phase 1)
4. **Connection Pooling**: Use connection pool (already configured)
5. **Caching**: Cache user balance if frequently accessed (with TTL)

---

**Remember: The Ledger Service is your friend. Trust it. Use it correctly. Never bypass it.** 🚀
