# KhataPay Backend

## MySQL setup

Run this in PowerShell once against your MySQL server:

```powershell
Get-Content .\database\schema.sql | mysql -u root -p
```

Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and
`JWT_SECRET` in `.env`. `DB_NAME` defaults to `khatapay_db`. Do not commit
database credentials or the JWT secret.

Set `PORT=5013` in `.env` to run the API on port 5013; if `PORT` is not set,
5013 is the default. Start the API with `npm start` (or `npm run dev` during
development). The API connects to MySQL before listening. `GET /health` checks
that the HTTP server is running.

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
