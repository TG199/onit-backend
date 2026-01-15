# User API Documentation

All user endpoints require authentication via the `x-token` header.

---

## Authentication

Include the auth token in all requests:

```
Headers:
  x-token: <your-auth-token>
```

---

## Ads & Submissions

### GET /api/user/ads

Get available ads that user can submit proofs for.

**Query Parameters:**

- `limit` (optional): Number of ads to return (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Response:**

```json
{
  "ads": [
    {
      "id": "ad-uuid",
      "title": "Download App X",
      "description": "Download and sign up",
      "advertiser": "Company Name",
      "imageUrl": "https://...",
      "payoutPerView": 10.0,
      "totalViews": 150,
      "maxViews": 1000,
      "hasSubmitted": false,
      "canSubmit": true
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 10
  }
}
```

---

### POST /api/user/engagements/:adId/submit

Submit proof for an ad engagement.

**Path Parameters:**

- `adId`: Ad UUID

**Request Body:**

```json
{
  "proofUrl": "https://storage.example.com/screenshots/proof.jpg"
}
```

**Response:**

```json
{
  "message": "Proof submitted successfully",
  "submission": {
    "id": "submission-uuid",
    "adId": "ad-uuid",
    "status": "pending",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**Errors:**

- `400` - Ad not active or max views reached
- `409` - Already have pending submission for this ad
- `429` - Rate limit exceeded (1 submission per ad per day)

---

### GET /api/user/engagements

Get submission history.

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
      "status": "approved",
      "proofUrl": "https://...",
      "rejectionReason": null,
      "createdAt": "2025-01-15T10:00:00Z",
      "reviewedAt": "2025-01-15T12:00:00Z",
      "ad": {
        "id": "ad-uuid",
        "title": "Download App X",
        "payoutPerView": 10.0,
        "imageUrl": "https://..."
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "count": 25
  }
}
```

---

### GET /api/user/engagements/:id

Get specific submission details.

**Path Parameters:**

- `id`: Submission UUID

**Response:**

```json
{
  "submission": {
    "id": "submission-uuid",
    "userId": "user-uuid",
    "adId": "ad-uuid",
    "adTitle": "Download App X",
    "payoutAmount": 10.0,
    "proofUrl": "https://...",
    "status": "approved",
    "rejectionReason": null,
    "reviewedBy": "admin-uuid",
    "reviewedAt": "2025-01-15T12:00:00Z",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

---

### GET /api/user/engagements/stats

Get submission statistics.

**Response:**

```json
{
  "stats": {
    "totalSubmissions": 50,
    "pending": 5,
    "underReview": 3,
    "approved": 35,
    "rejected": 7,
    "approvalRate": "70.00"
  }
}
```

---

## Wallet & Transactions

### GET /api/user/wallet

Get wallet balance and summary.

**Response:**

```json
{
  "balance": 125.5,
  "stats": {
    "totalEarned": 250.0,
    "totalWithdrawn": 124.5,
    "totalTransactions": 75
  }
}
```

---

### GET /api/user/wallet/transactions

Get transaction history.

**Query Parameters:**

- `limit` (optional): Max records (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter by type (ad_payout, withdrawal, bonus, etc.)

**Response:**

```json
{
  "transactions": [
    {
      "id": "ledger-uuid",
      "type": "ad_payout",
      "amount": 10.0,
      "balanceAfter": 125.5,
      "referenceType": "submission",
      "referenceId": "submission-uuid",
      "metadata": {
        "adId": "ad-uuid",
        "approvedBy": "admin-uuid"
      },
      "createdAt": "2025-01-15T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "count": 20
  }
}
```

---

## Withdrawals

### POST /api/user/wallet/withdraw

Request a withdrawal.

**Request Body:**

```json
{
  "amount": 50.0,
  "method": "bank_transfer",
  "paymentDetails": {
    "accountNumber": "1234567890",
    "bankName": "Example Bank",
    "accountName": "John Doe"
  }
}
```

**Payment Details by Method:**

**bank_transfer:**

```json
{
  "accountNumber": "string",
  "bankName": "string",
  "accountName": "string"
}
```

**paypal:**

```json
{
  "email": "user@example.com"
}
```

**crypto:**

```json
{
  "walletAddress": "0x...",
  "network": "ethereum"
}
```

**mobile_money:**

```json
{
  "phoneNumber": "+234...",
  "provider": "MTN"
}
```

**Response:**

```json
{
  "message": "Withdrawal request submitted successfully",
  "withdrawal": {
    "id": "withdrawal-uuid",
    "amount": 50.0,
    "method": "bank_transfer",
    "status": "pending",
    "createdAt": "2025-01-15T14:00:00Z"
  }
}
```

**Errors:**

- `400` - Insufficient balance or invalid payment details
- `400` - Amount below minimum (10.00)
- `409` - Already have pending withdrawal
- `429` - Rate limit exceeded (max 3 withdrawals per week)

---

### GET /api/user/wallet/withdrawals

Get withdrawal history.

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
      "amount": 50.0,
      "method": "bank_transfer",
      "status": "completed",
      "transactionHash": "TXN123456",
      "failureReason": null,
      "createdAt": "2025-01-15T14:00:00Z",
      "processedAt": "2025-01-15T15:00:00Z",
      "completedAt": "2025-01-16T10:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "count": 10
  }
}
```

---

### GET /api/user/wallet/withdrawals/:id

Get specific withdrawal details.

**Path Parameters:**

- `id`: Withdrawal UUID

**Response:**

```json
{
  "withdrawal": {
    "id": "withdrawal-uuid",
    "userId": "user-uuid",
    "amount": 50.0,
    "method": "bank_transfer",
    "paymentDetails": {
      "accountNumber": "****7890",
      "bankName": "Example Bank",
      "accountName": "John Doe"
    },
    "status": "completed",
    "transactionHash": "TXN123456",
    "failureReason": null,
    "processedBy": "admin-uuid",
    "processedAt": "2025-01-15T15:00:00Z",
    "completedAt": "2025-01-16T10:00:00Z",
    "createdAt": "2025-01-15T14:00:00Z"
  }
}
```

---

### POST /api/user/wallet/withdrawals/:id/cancel

Cancel a pending withdrawal.

**Path Parameters:**

- `id`: Withdrawal UUID

**Response:**

```json
{
  "message": "Withdrawal cancelled successfully",
  "withdrawal": {
    "id": "withdrawal-uuid",
    "status": "cancelled",
    "updatedAt": "2025-01-15T14:30:00Z"
  }
}
```

**Errors:**

- `400` - Can only cancel pending withdrawals
- `404` - Withdrawal not found

---

### GET /api/user/wallet/withdrawals/stats

Get withdrawal statistics.

**Response:**

```json
{
  "stats": {
    "totalWithdrawals": 10,
    "totalWithdrawn": 500.0,
    "pending": 1,
    "processing": 0,
    "completed": 8,
    "failed": 1
  }
}
```

---

## Profile & Dashboard

### GET /api/user/profile

Get user profile information.

**Response:**

```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "phone": "+234...",
    "role": "user",
    "balance": 125.5,
    "location": "Port Harcourt, Nigeria",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

### GET /api/user/dashboard

Get comprehensive dashboard summary.

**Response:**

```json
{
  "balance": 125.5,
  "earnings": {
    "total": 250.0,
    "fromAds": 250.0
  },
  "submissions": {
    "total": 50,
    "pending": 5,
    "approved": 35,
    "rejected": 10,
    "approvalRate": "70.00"
  },
  "withdrawals": {
    "total": 10,
    "totalAmount": 124.5,
    "pending": 1,
    "completed": 9
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "additional": "context"
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` (401) - Missing or invalid auth token
- `FORBIDDEN` (403) - Access denied
- `VALIDATION_ERROR` (400) - Invalid input
- `NOT_FOUND` (404) - Resource not found
- `INSUFFICIENT_BALANCE` (400) - Not enough balance
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `DUPLICATE_SUBMISSION` (409) - Already submitted
- `INTERNAL_ERROR` (500) - Server error

---

## Rate Limits

- **Submissions**: 1 per ad per day
- **Withdrawals**: 3 per week
- **API Requests**: Standard rate limiting applies

---

## Status Values

### Submission Status

- `pending` - Awaiting admin review
- `under_review` - Being reviewed by admin
- `approved` - Approved and paid
- `rejected` - Rejected with reason

### Withdrawal Status

- `pending` - Awaiting admin processing
- `processing` - Being processed
- `completed` - Successfully paid
- `failed` - Payment failed
- `cancelled` - Cancelled by user

---

## Best Practices

1. **Always check balance** before requesting withdrawal
2. **Handle rate limits** gracefully with retry logic
3. **Validate payment details** on client side
4. **Show clear error messages** to users
5. **Poll submission status** periodically for updates
6. **Cache user balance** with short TTL to reduce API calls

---

## Example Usage

### Complete Flow: Submit Proof → Check Status → Withdraw

```javascript
// 1. Get available ads
const adsResponse = await fetch("/api/user/ads", {
  headers: { "x-token": authToken },
});
const { ads } = await adsResponse.json();

// 2. Submit proof for first ad
const submitResponse = await fetch(
  `/api/user/engagements/${ads[0].id}/submit`,
  {
    method: "POST",
    headers: {
      "x-token": authToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      proofUrl: "https://storage.example.com/proof.jpg",
    }),
  }
);

// 3. Check wallet balance
const walletResponse = await fetch("/api/user/wallet", {
  headers: { "x-token": authToken },
});
const { balance } = await walletResponse.json();

// 4. Request withdrawal if sufficient balance
if (balance >= 50) {
  const withdrawResponse = await fetch("/api/user/wallet/withdraw", {
    method: "POST",
    headers: {
      "x-token": authToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 50,
      method: "bank_transfer",
      paymentDetails: {
        accountNumber: "1234567890",
        bankName: "Example Bank",
        accountName: "John Doe",
      },
    }),
  });
}
```
