# Admin API Documentation

All admin endpoints require authentication AND admin role.

```
Headers:
  x-token: <admin-auth-token>
```

---

## Submission Management

### GET /api/admin/submissions

Get submissions queue (pending/under review by default).

**Query Parameters:**

- `limit` (optional): Max records (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (pending, under_review, approved, rejected)

**Response:**

```json
{
  "submissions": [
    {
      "id": "submission-uuid",
      "userId": "user-uuid",
      "userEmail": "user@example.com",
      "userPhone": "+234...",
      "adId": "ad-uuid",
      "adTitle": "Download App X",
      "advertiser": "Company Name",
      "payoutAmount": 10.0,
      "proofUrl": "https://...",
      "status": "pending",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "count": 25 }
}
```

---

### POST /api/admin/submissions/:id/approve

Approve submission and pay user.

**Path Parameters:**

- `id`: Submission UUID

**Response:**

```json
{
  "message": "Submission approved and user paid",
  "submission": {
    "submissionId": "submission-uuid",
    "status": "approved",
    "payoutAmount": 10.0,
    "userId": "user-uuid"
  }
}
```

**What Happens:**

1. Submission status changes to `approved`
2. User balance increases by payout amount
3. Ledger entry created with reference to submission
4. Ad `total_views` incremented
5. Admin action logged

**Errors:**

- `400` - Invalid state (already approved/rejected)
- `404` - Submission not found

---

### POST /api/admin/submissions/:id/reject

Reject submission with reason.

**Path Parameters:**

- `id`: Submission UUID

**Request Body:**

```json
{
  "reason": "Screenshot does not show completed action"
}
```

**Response:**

```json
{
  "message": "Submission rejected",
  "submission": {
    "submissionId": "submission-uuid",
    "status": "rejected",
    "reason": "Screenshot does not show completed action"
  }
}
```

**Validation:**

- Reason must be at least 10 characters

---

## Withdrawal Management

### GET /api/admin/withdrawals

Get withdrawals queue (pending by default).

**Query Parameters:**

- `limit` (optional): Max records (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status

**Response:**

```json
{
  "withdrawals": [
    {
      "id": "withdrawal-uuid",
      "userId": "user-uuid",
      "userEmail": "user@example.com",
      "userPhone": "+234...",
      "userBalance": 125.5,
      "amount": 50.0,
      "method": "bank_transfer",
      "paymentDetails": {
        "accountNumber": "1234567890",
        "bankName": "Example Bank",
        "accountName": "John Doe"
      },
      "status": "pending",
      "createdAt": "2025-01-15T14:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "count": 10 }
}
```

---

### POST /api/admin/withdrawals/:id/process

Process withdrawal (deduct balance, mark as processing).

**Path Parameters:**

- `id`: Withdrawal UUID

**Response:**

```json
{
  "message": "Withdrawal processed and balance deducted",
  "withdrawal": {
    "withdrawalId": "withdrawal-uuid",
    "status": "processing",
    "userId": "user-uuid",
    "amount": 50.0
  }
}
```

**What Happens:**

1. User balance debited (negative ledger entry)
2. Withdrawal status changes to `processing`
3. Admin action logged

**Errors:**

- `400` - Invalid state (not pending)
- `400` - Insufficient balance

---

### POST /api/admin/withdrawals/:id/complete

Complete withdrawal (mark as paid).

**Path Parameters:**

- `id`: Withdrawal UUID

**Request Body:**

```json
{
  "transactionHash": "TXN123456789"
}
```

**Response:**

```json
{
  "message": "Withdrawal completed",
  "withdrawal": {
    "withdrawalId": "withdrawal-uuid",
    "status": "completed",
    "transactionHash": "TXN123456789"
  }
}
```

**Errors:**

- `400` - Invalid state (not processing)
- `400` - Transaction hash required

---

### POST /api/admin/withdrawals/:id/fail

Fail withdrawal and refund user.

**Path Parameters:**

- `id`: Withdrawal UUID

**Request Body:**

```json
{
  "reason": "Bank account details invalid"
}
```

**Response:**

```json
{
  "message": "Withdrawal failed and user refunded",
  "withdrawal": {
    "withdrawalId": "withdrawal-uuid",
    "status": "failed",
    "reason": "Bank account details invalid",
    "refunded": true
  }
}
```

**What Happens:**

1. User balance credited back (refund ledger entry)
2. Withdrawal status changes to `failed`
3. Admin action logged

**Validation:**

- Reason must be at least 10 characters

---

## Ad Management

### GET /api/admin/ads

Get all ads.

**Query Parameters:**

- `limit` (optional): Max records (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (active, paused, expired)

**Response:**

```json
{
  "ads": [
    {
      "id": "ad-uuid",
      "title": "Download App X",
      "description": "Download and sign up",
      "advertiser": "Company Name",
      "targetUrl": "https://example.com",
      "imageUrl": "https://...",
      "payoutPerView": 10.0,
      "totalViews": 150,
      "maxViews": 1000,
      "status": "active",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "count": 20 }
}
```

---

### POST /api/admin/ads

Create new ad.

**Request Body:**

```json
{
  "title": "Download App X",
  "description": "Download and sign up",
  "advertiser": "Company Name",
  "targetUrl": "https://example.com",
  "imageUrl": "https://...",
  "payoutPerView": 10.0,
  "maxViews": 1000
}
```

**Response:**

```json
{
  "message": "Ad created successfully",
  "ad": {
    "adId": "ad-uuid",
    "title": "Download App X",
    "status": "paused"
  }
}
```

**Validation:**

- `title`, `advertiser`, `targetUrl`, `payoutPerView` are required
- `payoutPerView` must be positive
- New ads start as `paused` by default

---

### PATCH /api/admin/ads/:id

Update ad details.

**Path Parameters:**

- `id`: Ad UUID

**Request Body:**

```json
{
  "title": "Updated Title",
  "payoutPerView": 12.0,
  "maxViews": 2000
}
```

**Allowed Fields:**

- `title`, `description`, `targetUrl`, `imageUrl`, `payoutPerView`, `maxViews`

**Response:**

```json
{
  "message": "Ad updated successfully",
  "ad": {
    "adId": "ad-uuid",
    "updated": true
  }
}
```

---

### POST /api/admin/ads/:id/activate

Activate ad (make visible to users).

**Path Parameters:**

- `id`: Ad UUID

**Response:**

```json
{
  "message": "Ad activated",
  "ad": {
    "adId": "ad-uuid",
    "status": "active"
  }
}
```

---

### POST /api/admin/ads/:id/pause

Pause ad (hide from users).

**Path Parameters:**

- `id`: Ad UUID

**Response:**

```json
{
  "message": "Ad paused",
  "ad": {
    "adId": "ad-uuid",
    "status": "paused"
  }
}
```

---

## User Management

### POST /api/admin/users/:id/block

Block user account.

**Path Parameters:**

- `id`: User UUID

**Response:**

```json
{
  "message": "User blocked",
  "user": {
    "userId": "user-uuid",
    "blocked": true
  }
}
```

**Effect:**

- User cannot login
- User cannot access any endpoints

---

### POST /api/admin/users/:id/unblock

Unblock user account.

**Path Parameters:**

- `id`: User UUID

**Response:**

```json
{
  "message": "User unblocked",
  "user": {
    "userId": "user-uuid",
    "blocked": false
  }
}
```

---

### GET /api/admin/users/:id/audit

Audit user balance (compare stored vs ledger).

**Path Parameters:**

- `id`: User UUID

**Response:**

```json
{
  "audit": {
    "userId": "user-uuid",
    "storedBalance": 125.5,
    "ledgerBalance": 125.5,
    "isConsistent": true,
    "difference": 0
  }
}
```

**Use Case:**

- Verify user balance integrity
- Investigate user complaints
- Regular audits

---

## Audit & Monitoring

### GET /api/admin/logs

Get admin action logs.

**Query Parameters:**

- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset (default: 0)
- `adminId` (optional): Filter by admin
- `action` (optional): Filter by action type

**Response:**

```json
{
  "logs": [
    {
      "id": "log-uuid",
      "adminId": "admin-uuid",
      "adminEmail": "admin@example.com",
      "action": "approve_submission",
      "resourceType": "submission",
      "resourceId": "submission-uuid",
      "details": {
        "userId": "user-uuid",
        "adId": "ad-uuid",
        "payoutAmount": 10.0
      },
      "createdAt": "2025-01-15T12:00:00Z"
    }
  ],
  "pagination": { "limit": 100, "offset": 0, "count": 50 }
}
```

**Admin Actions:**

- `approve_submission`, `reject_submission`
- `process_withdrawal`, `complete_withdrawal`, `fail_withdrawal`
- `create_ad`, `update_ad`, `activate_ad`, `pause_ad`
- `block_user`, `unblock_user`

---

### GET /api/admin/audit/mismatches

Find all users with balance mismatches.

**Response:**

```json
{
  "mismatches": [
    {
      "userId": "user-uuid",
      "storedBalance": 100.0,
      "ledgerBalance": 105.0,
      "difference": -5.0
    }
  ],
  "count": 1,
  "critical": true
}
```

**Note:**

- Should always return empty array
- If not empty, critical issue requiring investigation

---

### GET /api/admin/stats

Get platform statistics.

**Response:**

```json
{
  "users": {
    "total": 1000,
    "blocked": 5,
    "totalBalance": 50000.0
  },
  "submissions": {
    "total": 5000,
    "pending": 50,
    "approved": 4500,
    "rejected": 450
  },
  "withdrawals": {
    "total": 500,
    "pending": 10,
    "completed": 480,
    "totalPaid": 25000.0
  },
  "ads": {
    "total": 20,
    "active": 15,
    "paused": 5
  }
}
```

---

## Complete Admin Workflow Examples

### Workflow 1: Approve Submission

```javascript
// 1. Get pending submissions
GET / api / admin / submissions;

// 2. Review proof screenshot at proofUrl

// 3. Approve if valid
POST / api / admin / submissions / { id } / approve;

// Result: User paid automatically
```

### Workflow 2: Process Withdrawal

```javascript
// 1. Get pending withdrawals
GET /api/admin/withdrawals

// 2. Verify user details and balance

// 3. Process (deducts balance)
POST /api/admin/withdrawals/{id}/process

// 4. Send payment externally (bank/paypal/etc)

// 5. Mark as completed
POST /api/admin/withdrawals/{id}/complete
Body: { "transactionHash": "TXN123..." }

// OR if payment failed
POST /api/admin/withdrawals/{id}/fail
Body: { "reason": "Bank rejected..." }
// Result: User refunded automatically
```

### Workflow 3: Create and Launch Ad

```javascript
// 1. Create ad (starts paused)
POST /api/admin/ads
Body: {
  "title": "Download Game Y",
  "advertiser": "Gaming Co",
  "targetUrl": "https://game.com",
  "payoutPerView": 15.00
}

// 2. Activate when ready
POST /api/admin/ads/{id}/activate

// 3. Monitor submissions
GET /api/admin/submissions?status=pending

// 4. Pause if needed
POST /api/admin/ads/{id}/pause
```

---

## Best Practices

1. **Always provide reasons** when rejecting submissions or failing withdrawals
2. **Verify payment details** before processing withdrawals
3. **Check balance consistency** using audit endpoint before major operations
4. **Review admin logs** regularly for accountability
5. **Monitor platform stats** for unusual activity
6. **Start ads as paused** and activate after review

---

## Security Notes

- All admin actions are logged with timestamp and admin ID
- Admin cannot delete or modify ledger entries directly
- Balance changes are automatic through LedgerService
- Failed withdrawals automatically refund users
- Blocked users cannot access any endpoints

---

## Error Responses

Same format as User API:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

**Admin-Specific Errors:**

- `INVALID_STATE_TRANSITION` - Cannot perform action in current state
- `FORBIDDEN` - Not an admin user
