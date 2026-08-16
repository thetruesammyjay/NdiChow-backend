# NdiChow Backend

NdiChow Backend is the TypeScript API and PostgreSQL system of record for the NdiChow food-ordering platform. It serves the Flutter app in [NdiChow](https://github.com/thetruesammyjay/NdiChow).

Production deployment: [ndichow-backend.onrender.com](https://ndichow-backend.onrender.com) · [Readiness check](https://ndichow-backend.onrender.com/ready)

## Implemented foundation

- Fastify 5 with strict TypeScript and Zod validation
- Neon/PostgreSQL persistence through Drizzle ORM and postgres.js
- Versioned restaurant discovery and menu endpoints
- Email/password registration and login using salted scrypt hashes
- Opaque bearer sessions stored as SHA-256 token hashes
- Authenticated, ownership-checked order history and detail
- Transactional order creation with status history
- Server-authoritative menu names, prices, delivery fees, availability, and minimum order
- Per-customer idempotency keys for safe checkout retries
- Security headers, request-size limits, global/auth rate limits, request IDs, and production CORS validation
- Liveness and database readiness endpoints
- ESLint, Prettier, Vitest, builds, migrations, and GitHub Actions CI

Payments, restaurant hours/delivery zones, role-specific operations, refresh-token rotation, and background notifications remain future work.

## Requirements

- Node.js 22.13+ or Node.js 24+
- npm 10+
- PostgreSQL 15+ or a Neon project

Node.js 24 LTS is recommended. Install dependencies with:

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and replace example values. Never commit `.env`.

| Variable                 | Required   | Default        | Description                                                         |
| ------------------------ | ---------- | -------------- | ------------------------------------------------------------------- |
| `NODE_ENV`               | No         | `development`  | `development`, `test`, or `production`                              |
| `HOST`                   | No         | `0.0.0.0`      | Bind address                                                        |
| `PORT`                   | No         | `4000`         | HTTP port                                                           |
| `LOG_LEVEL`              | No         | `info`         | Fastify log level                                                   |
| `CORS_ORIGINS`           | Production | `*`            | Comma-separated allowed origins; wildcard is rejected in production |
| `DATABASE_URL`           | Production | none           | Runtime PostgreSQL URL; use Neon's pooled URL                       |
| `DATABASE_MIGRATION_URL` | No         | `DATABASE_URL` | Direct/non-pooled URL for migrations when available                 |
| `AUTH_SESSION_DAYS`      | No         | `7`            | Session lifetime, from 1 to 90 days                                 |

For Neon, use the pooled connection string as `DATABASE_URL`. The direct connection string is preferred for `DATABASE_MIGRATION_URL`, but migration commands safely fall back to `DATABASE_URL`. The literal starter hostname `direct-host` is treated as an unset placeholder.

Do not expose either database URL to Flutter. Rotate a URL immediately if it is pasted into chat, logs, source control, or a client build.

## Database setup

The committed SQL in `drizzle/` is the schema history. Apply it and seed the development catalog:

```bash
npm run db:migrate
npm run db:seed
```

After changing `src/database/schema.ts`:

```bash
npm run db:generate
npm run db:migrate
```

Review generated SQL before applying it to shared or production databases. Production migration should be a controlled deployment step, not part of every server startup.

## Run locally

```bash
npm run dev
```

The default address is `http://localhost:4000`.

```bash
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

`/health` proves the process is alive. `/ready` also checks PostgreSQL when database-backed dependencies are active.

## Architecture

```text
src/
|-- config/             Validated environment
|-- database/           Schema, client, migration, and seed
|-- lib/                HTTP errors and validation boundary
|-- modules/
|   |-- auth/           Passwords, sessions, auth routes/repositories
|   |-- orders/         Ordering rules and transactional repositories
|   `-- restaurants/    Discovery, catalog, and repositories
|-- app.ts              Fastify composition
`-- index.ts            Database/runtime bootstrap and shutdown

drizzle/                Generated SQL migration history
test/                   Fastify integration tests
```

Tests use in-memory repository implementations. The running server selects database repositories whenever `DATABASE_URL` is configured.

## API conventions

Application endpoints live under `/api/v1`. Success responses use a data envelope; list endpoints can also include pagination metadata.

```json
{ "data": {}, "meta": { "page": 1, "limit": 20, "total": 2 } }
```

Errors expose stable codes and safe messages:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

Money is stored and calculated as integers in whole Nigerian naira. For example, `4800` means ₦4,800. Do not use floating-point values for money.

## Endpoints

### Public and authentication

```http
GET  /health
GET  /ready
GET  /api/v1/restaurants?q=jollof&page=1&limit=20
GET  /api/v1/restaurants/:restaurantId
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

Register payload:

```json
{
  "email": "customer@example.com",
  "name": "Ada Customer",
  "password": "a-long-unique-password"
}
```

Registration and login return `customer`, `token`, and `expiresAt`. Send the token to protected routes:

```http
Authorization: Bearer <opaque-session-token>
```

Only the SHA-256 digest is stored in PostgreSQL. Treat the returned token like a password and store it in platform secure storage on mobile.

### Orders

```http
GET  /api/v1/orders
GET  /api/v1/orders/:orderId
POST /api/v1/orders
```

Create an order:

```http
POST /api/v1/orders
Authorization: Bearer <opaque-session-token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "restaurantId": "jollof-corner",
  "deliveryAddress": "12 Adeola Odeku Street, Lagos",
  "items": [
    {
      "menuItemId": "party-jollof-chicken",
      "quantity": 2,
      "notes": "No plantain, please"
    }
  ]
}
```

The API ignores/rejects the idea of client-authoritative pricing: it loads menu items from PostgreSQL, verifies restaurant ownership and availability, checks the minimum order, calculates totals, snapshots price/name, creates the order and initial status event in one transaction, and returns the original order if the same customer retries the same idempotency key.

## Commands

```bash
npm run dev             # Reloading development server
npm run lint            # Typed ESLint
npm run format          # Write Prettier formatting
npm run format:check    # Verify formatting
npm run typecheck       # Strict TypeScript check
npm test                # API integration tests
npm run build           # Compile dist/
npm start               # Run compiled server
npm run db:generate     # Generate migration after schema edits
npm run db:migrate      # Apply committed migrations
npm run db:seed         # Idempotently seed initial catalog
```

## Security model and limitations

- Production startup requires a database URL and explicit CORS origins.
- Password endpoints have tighter rate limits than the global API limit.
- Password hashes use Node's scrypt with a unique random salt.
- Session tokens are high-entropy opaque values; only hashes persist.
- Order queries authorize against the authenticated customer ID.
- Clients never set item prices, item names, delivery fees, totals, or statuses.
- Database operations are parameterized by Drizzle/postgres.js.
- Request bodies are limited to 256 KiB.
- Logs must never include bearer tokens, passwords, full addresses, or database URLs.

Before production ordering, add email verification/password reset, session/device management, delivery-zone and opening-hours validation, payment intent/webhook verification, administrative roles, audit logs, data-retention workflows, observability, backups, and disaster-recovery tests.

## Verification and CI

GitHub Actions uses Node 24 and runs `npm ci`, formatting, lint, typecheck, tests, and build. Run the same checks locally before a pull request. Integration tests cover health, discovery, auth-required orders, server-side totals, notes, and idempotent retries.

## Deployment order

1. Inject secrets and restrictive production CORS origins.
2. Install exact dependencies with `npm ci`.
3. Run verification checks.
4. Apply reviewed migrations once.
5. Deploy the compiled service behind HTTPS.
6. Configure liveness with `/health` and readiness with `/ready`.
7. Seed only environments that require the sample catalog.

The server closes database connections during graceful `SIGINT` and `SIGTERM` shutdown.

## Roadmap

- [x] Neon persistence, migrations, and initial catalog
- [x] Customer bearer sessions and resource ownership
- [x] Transactional, idempotent, server-priced orders
- [ ] Address records, delivery zones, and restaurant hours
- [ ] Email verification and password reset
- [ ] Payment provider with signed, idempotent webhooks
- [ ] Validated staff/courier order-status transitions
- [ ] Push notification worker and realtime tracking
- [ ] OpenAPI specification and generated Flutter client
- [ ] Metrics, tracing, audit tooling, backups, and restore drills

## License

Copyright © 2026 NdiChow. All rights reserved unless a separate license is added.
