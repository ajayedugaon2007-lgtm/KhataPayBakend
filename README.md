# KhataPay Backend

## MySQL setup

Run this in PowerShell once against your MySQL server:

```powershell
Get-Content .\database\schema.sql | mysql -u root -p
```

Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and
`JWT_SECRET` in `.env`. `DB_NAME` defaults to `khatapay_db`. Do not commit
database credentials or the JWT secret. Apply the latest
`database/schema.sql` to create the UPI/payment tables; it preserves the
existing `payments` table and APIs.

For databases created from an earlier version of this schema, add the order
reference column once before deploying the new code:

```sql
ALTER TABLE khatapay_payment_records
  ADD COLUMN provider_order_id VARCHAR(255) NULL,
  ADD UNIQUE KEY uq_payment_provider_order_ref (provider, provider_order_id);
```

Payment settings are shown in `.env.example`. The default
`PAYMENT_PROVIDER=sandbox` never initiates or confirms real payments. To enable
Razorpay payments, set `PAYMENT_PROVIDER=razorpay` and configure
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` from
your approved Razorpay account. Keep both secrets server-side; never send them
to the client or commit them. Configure a public HTTPS webhook URL ending in
`/api/webhooks/payment` in Razorpay and subscribe to `payment.captured`,
`payment.failed`, `payment.authorized`, and `order.paid`. Test with Razorpay
test keys and a test webhook secret before switching to live keys.

Payments settle to the Razorpay account configured by these keys under its
settlement configuration. This integration does not split or route funds to
individual KhataPay users. Bank-link and bank-verification APIs remain
pending-only and do not verify a bank account.

Set `PORT=5013` in `.env` to run the API on port 5013; if `PORT` is not set,
5013 is the default. Start the API with `npm start` (or `npm run dev` during
development). The API connects to MySQL before listening. `GET /health` checks
that the HTTP server is running.

## Deploy to Render

1. Provision a **MySQL** database with a provider that allows connections from
   Render. Render's web service does not provide this MySQL database for you.
2. Run `database/schema.sql` once against that database. If the database user
   cannot create databases, create `khatapay_db` first and run the schema with
   that database selected.
3. Push this repository to GitHub and create a Render Blueprint from it, or
   create a Node web service with `npm ci` as the build command and `npm start`
   as the start command. The included `render.yaml` configures the service and
   `/health` health check.
4. In Render, set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and a unique,
   long random `JWT_SECRET`. If the MySQL provider requires TLS, also set
   `DB_SSL=true`; set `DB_SSL_CA` only when that provider supplies a custom CA
   certificate. Keep database and payment secrets out of GitHub.
5. After the first successful deploy, Render shows the public service URL, for
   example `https://khatapay-backend.onrender.com`. Check that URL at `/health`.
   Use the URL from your own Render dashboard; this example is not a live API.

Render's free web service can sleep when idle. Its filesystem is not a durable
database: keep application data in the external MySQL database.

## Connect a Flutter app

Set one API base URL to the Render service URL (no trailing slash), for
example `https://khatapay-backend.onrender.com`. For local development on an
Android emulator, use `http://10.0.2.2:5013`; `localhost` on the emulator points
to the emulator, not the computer. Register or log in first, then include the
returned JWT on protected requests. For example, add the `http` package and:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

const apiBaseUrl = 'https://YOUR-SERVICE.onrender.com';

Future<void> saveCustomer(String token) async {
  final response = await http.post(
    Uri.parse('$apiBaseUrl/api/customers'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'name': 'A Customer',
      'phone': '9876543210',
      'balance': 0,
      'is_get': 1,
    }),
  );
  if (response.statusCode != 201) {
    throw Exception('Could not save customer: ${response.body}');
  }
}
```

Use the same base URL for `/api/auth/register`, `/api/auth/login`, and the
other routes below. Store the login token securely in Flutter and send it as a
Bearer token on every protected request. Resource APIs include
`/api/businesses`, `/api/customers`, `/api/transactions`, `/api/products`,
`/api/invoices`, `/api/payments`, `/api/expenses`, `/api/staff`, and
`/api/notifications`; their request fields follow `database/schema.sql`.
Records are saved to MySQL and scoped to the logged-in user.

## API

Authentication endpoints are public:

- `POST /api/auth/register` or `POST /api/auth/signup`
- `POST /api/auth/register-owner` or `POST /api/auth/signup-owner`
- `POST /api/auth/login`

All other API routes require an `Authorization` header with a Bearer access
token. Authenticated routes include:

- `/api/businesses`
- `/api/customers`
- `/api/transactions`
- `/api/products`
- `/api/invoices`
- `/api/payments`
- `/api/expenses`
- `/api/staff`
- `/api/notifications`
- `/api/dashboard` and `/api/reports/summary`

The resource routes support `GET /`, `GET /:id`, `POST /`, `PUT /:id`, and
`DELETE /:id`. Request fields should use the column names from
`database/schema.sql`. Records are associated with the authenticated `user_id`;
the supplied schema does not associate records with an individual business.

## UPI and bank APIs

The default `PAYMENT_PROVIDER=sandbox` is intentionally **pending-only**: it
never sends or confirms a real payment, verifies a bank/UPI account, or reports
success. Razorpay mode creates real INR payment orders and verifies payments
against Razorpay; it requires an approved merchant account and valid server
credentials. An order alone is not a payment, and only a captured payment is
reported as successful.

All bank, UPI, payment, and QR endpoints below require
`Authorization: Bearer <JWT>`. User ownership is always taken from the JWT.
The payment provider webhook uses its HMAC signature instead of a user JWT.
For local sandbox webhook testing set `PAYMENT_WEBHOOK_SECRET` and calculate
`X-Provider-Signature` as the lowercase hex HMAC-SHA256 of the exact raw JSON
request body. Sandbox webhook events are deduplicated but never mark a payment
successful. Razorpay webhooks use `X-Razorpay-Signature` and the separate
`RAZORPAY_WEBHOOK_SECRET`. Set `QR_SIGNING_SECRET` to a separate long random
secret in production; otherwise QR signatures use `JWT_SECRET`.

### Bank

| Method and path | Request body | Result |
|---|---|---|
| `POST /api/bank/link` | `{"provider_account_ref":"provider-account-id","account_holder_name":"A User","bank_name":"Example Bank","account_last4":"1234","ifsc_code":"ABCD0123456"}` (`ifsc_code` optional) | `201`, account with `verification_status: "PENDING"` |
| `GET /api/bank/accounts` | — | `200`, current user's accounts |
| `GET /api/bank/accounts/:id` | — | `200`, owned account or `404` |
| `DELETE /api/bank/accounts/:id` | — | `200`, unlinks owned account |
| `POST /api/bank/verification/initiate` | `{"bank_account_id":"<account UUID>"}` | `202`, pending verification |
| `POST /api/bank/verification/confirm` | `{"verification_id":"<UUID>","otp":"<optional provider OTP>"}` | `202` pending-only sandbox; OTP is not persisted |
| `GET /api/bank/verification/status` | — | `200`, latest status or `NOT_STARTED` |

`provider_account_ref` must be a provider-issued, non-secret account reference
(not an access token or credential), never a raw account number. Only the last four digits are stored. Bank linking does not
prove account ownership; the sandbox cannot verify it.

Example responses (fields are abbreviated where noted):

```jsonc
// POST /api/bank/link, GET /api/bank/accounts, GET /api/bank/accounts/:id
{"success":true,"message":"Bank account linked; verification is still pending","data":{"id":"<account UUID>","user_id":"<JWT user id>","provider":"sandbox","account_holder_name":"A User","bank_name":"Example Bank","account_last4":"1234","verification_status":"PENDING","status":"ACTIVE"}}
// GET /api/bank/accounts returns the same account objects in data[].
// DELETE /api/bank/accounts/:id
{"success":true,"message":"Bank account unlinked","data":{"id":"<account UUID>"}}
// POST /api/bank/verification/initiate
{"success":true,"message":"Bank verification is pending; sandbox mode does not contact a bank or issue an OTP","data":{"id":"<verification UUID>","bank_account_id":"<account UUID>","status":"PENDING"}}
// POST /api/bank/verification/confirm
{"success":true,"message":"Verification remains pending; sandbox cannot verify a bank account","data":{"id":"<verification UUID>","status":"PENDING"}}
// GET /api/bank/verification/status (before initiation)
{"success":true,"message":"Bank verification status retrieved","data":{"status":"NOT_STARTED"}}
```

### UPI and merchant QR

| Method and path | Request body | Result |
|---|---|---|
| `POST /api/upi/create` | `{"vpa":"shop@example","display_name":"Example Shop"}` | `201`, UPI profile marked `UNVERIFIED` |
| `GET /api/upi/profile` | — | `200`, own UPI profile |
| `POST /api/upi/qr/generate` | — | `201`, this merchant's signed KhataPay QR payload |
| `GET /api/upi/qr` | — | `200`, own QR or `404` |
| `POST /api/qr/scan` | `{"qr_payload":"khatapay://merchant?..."} ` | `200`, validated merchant details; not a payment |
| `POST /api/qr/pay` | `{"qr_payload":"...","amount":"125.00","note":"Order 1"}` and `Idempotency-Key: order-12345` | `202`, pending payment record |
| `GET /api/qr/my-qr` | — | `200`, own QR or `404` |

The QR is a signed internal KhataPay merchant identifier (not a UPI intent or
bank-transfer QR). Every owner gets a separate QR. Clients may render the
returned payload as a QR image. QR generation requires a UPI profile and at
least one linked bank account; neither is considered verified in sandbox.

```jsonc
// POST /api/upi/create and GET /api/upi/profile
{"success":true,"message":"UPI profile saved; ownership has not been verified","data":{"user_id":"<JWT user id>","vpa":"shop@example","display_name":"Example Shop","verification_status":"UNVERIFIED"}}
// POST /api/upi/qr/generate, GET /api/upi/qr, GET /api/qr/my-qr
{"success":true,"message":"Merchant QR generated; sandbox QR does not initiate a bank transfer","data":{"id":"<QR UUID>","user_id":"<JWT user id>","qr_payload":"khatapay://merchant?merchant_id=...&signature=...","status":"ACTIVE"}}
// POST /api/qr/scan
{"success":true,"message":"Merchant QR scanned successfully","data":{"merchant":{"id":"<merchant user id>","name":"Example Shop","vpa":"shop@example","upiVerificationStatus":"UNVERIFIED"},"qrId":"<QR UUID>","paymentStatus":"PENDING_ONLY_SANDBOX"}}
```

### Payments

| Method and path | Request body | Result |
|---|---|---|
| `POST /api/payments/create` | `{"merchant_user_id":"<merchant user UUID>","amount":"125.00","note":"Order 1"}` and `Idempotency-Key: order-12345` | `202`, pending order; Razorpay mode also returns public Checkout options |
| `POST /api/payments/verify` | `{"payment_id":"<payment UUID>","razorpay_order_id":"order_...","razorpay_payment_id":"pay_...","razorpay_signature":"<Checkout signature>"}` | Verifies the Checkout HMAC and fetches the payment from Razorpay; only a captured payment becomes `SUCCEEDED` |
| `GET /api/payments/history?limit=50&offset=0` | — | `200`, records where current user is payer or merchant |
| `GET /api/payments/:id` | — | `200`, owned payment (also preserves lookup of pre-existing legacy payment records) |
| `POST /api/webhooks/payment` | Razorpay event JSON plus `X-Razorpay-Signature` and `X-Razorpay-Event-Id` | `202`, signature-checked event recorded; captured events update the payment |

Payment amounts must be INR values from `0.01` through `1,000,000.00` with
at most two decimal places. The idempotency key is required and scoped to the
authenticated payer. Duplicate retries with the same details return the
original payment; reusing the key with different details returns `409`.
Neither client-supplied status nor an unsigned webhook can mark a payment
successful. Sandbox payment requests require the local bank and UPI profiles
described above. Razorpay orders use the approved Razorpay account's settlement
configuration and do not require a local bank link; they do not split
settlements among KhataPay users. UPI intent is launched by the client through
Razorpay Checkout; the backend returns the public key ID, amount, INR currency,
and order ID. The client must submit Razorpay's three Checkout response fields
to `/api/payments/verify`. The server validates the signature and fetches the
payment from Razorpay before updating its status. An authorized but uncaptured
payment stays `PENDING`; configure automatic capture in Razorpay if that is the
intended account behavior.

Failed UPI attempts remain pending so the same order can be retried. Webhook
signatures are calculated over the exact raw request body. Unknown Razorpay
events are acknowledged without changing payment state.

```jsonc
// POST /api/payments/create in Razorpay mode
{"success":true,"message":"Razorpay UPI order created; complete payment in the client checkout","data":{"id":"<payment UUID>","amount":"125.00","currency":"INR","status":"PENDING","provider":"razorpay","provider_order_id":"order_...","checkout":{"key":"rzp_live_...","order_id":"order_...","amount":12500,"currency":"INR","name":"Example Shop","description":"Order 1","method":{"upi":true}},"reused":false}}
// POST /api/payments/verify after Razorpay Checkout
{"success":true,"message":"Payment captured successfully","data":{"payment":{"id":"<payment UUID>","amount":"125.00","currency":"INR","status":"SUCCEEDED","provider":"razorpay"},"provider_verified":true}}
// GET /api/payments/history
{"success":true,"message":"Payment history retrieved successfully","data":[{"id":"<payment UUID>","amount":"125.00","currency":"INR","status":"PENDING"}]}
// POST /api/qr/pay uses the same pending payment object as POST /api/payments/create.
// GET /api/payments/:id
{"success":true,"message":"Payment retrieved successfully","data":{"id":"<payment UUID>","amount":"125.00","currency":"INR","status":"PENDING","provider":"sandbox"}}
// POST /api/webhooks/payment
{"success":true,"message":"Webhook accepted; unverified sandbox events do not change payment status","data":{"duplicate":false,"outcome":"IGNORED_UNVERIFIED"}}
```

Typical success-shaped response envelope:

```json
{
  "success": true,
  "message": "Payment request created; sandbox payments remain pending until verified by an approved provider",
  "data": {
    "id": "b9c9b8cb-0e20-41a7-a059-0c16971b6ef5",
    "user_id": "payer-user-id",
    "merchant_user_id": "shop-owner-id",
    "amount": "125.00",
    "currency": "INR",
    "status": "PENDING",
    "provider": "sandbox"
  }
}
```

Errors use the existing `{ "success": false, "message": "..." }` format.
Never collect or store a UPI PIN, bank password, raw bank account number, or
OTP. Do not treat the client's UI state as payment confirmation.
