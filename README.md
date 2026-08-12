# NdiChow Backend

The NdiChow backend is a strict TypeScript API for restaurant discovery, menus, carts, orders, payments, delivery status, and customer notifications.

This repository owns business rules and server-side data. The Flutter customer application lives in [`NdiChow`](https://github.com/thetruesammyjay/NdiChow).

## Project status

The API is in its foundation stage. It currently provides:

- Fastify 5 application and HTTP server
- Strict TypeScript configuration
- Zod environment and request validation
- Security headers and configurable CORS
- Versioned REST endpoints
- Consistent success and error envelopes
- Health monitoring endpoint
- Restaurant listing, search, detail, and menu data
- Customer order creation, detail, and history
- Repository interfaces with in-memory development adapters
- Dependency injection for isolated tests
- Integration tests using Fastify request injection
- Graceful process shutdown

The in-memory adapters make the service immediately runnable, but they are not durable. PostgreSQL persistence, production authentication, payment verification, and background jobs are the next major layers.

## Technology

- Node.js 22+
- TypeScript
- Fastify
- Zod
- Vitest
- PostgreSQL planned as the system of record

## Architecture

NdiChow starts as a modular monolith. This keeps deployment and transactions straightforward while preserving clear module boundaries.

```text
src/
├── config/
│   └── env.ts                 # Validated environment configuration
├── lib/
│   ├── http-error.ts          # Stable application errors
│   └── validation.ts          # Zod-to-HTTP validation boundary
├── modules/
│   ├── orders/
│   │   ├── order.model.ts
│   │   ├── order.repository.ts
│   │   └── order.routes.ts
│   └── restaurants/
│       ├── restaurant.model.ts
│       ├── restaurant.repository.ts
│       └── restaurant.routes.ts
├── app.ts                     # Application composition
└── index.ts                   # Process bootstrap and shutdown

test/
└── app.test.ts                # API integration coverage
```

Each domain module should eventually contain its model, schemas, service/use cases, repository contract, infrastructure adapter, and routes. Route handlers should validate and translate HTTP concerns; business rules belong in services.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 16+ when the persistent adapter is introduced

## Local setup

Clone and enter the repository:

```bash
git clone https://github.com/thetruesammyjay/NdiChow-backend.git
cd NdiChow-backend
```

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

The service listens on `http://localhost:4000` by default.

Check it with:

```bash
curl http://localhost:4000/health
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime environment |
| `HOST` | No | `0.0.0.0` | HTTP bind address |
| `PORT` | No | `4000` | HTTP port |
| `LOG_LEVEL` | No | `info` | Fastify/Pino log level |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `DATABASE_URL` | Production | — | PostgreSQL connection string |

Configuration is parsed once during startup. Invalid values fail fast rather than allowing a partially configured server to run.

Never commit `.env`. Production secrets should be injected by the hosting platform.

## Commands

```bash
# Development server with reload
npm run dev

# Static type checking
npm run typecheck

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Compile production JavaScript
npm run build

# Run the compiled server
npm start
```

## API conventions

Application endpoints are versioned under `/api/v1`. Health checks intentionally remain at `/health`.

Successful responses:

```json
{
  "data": {}
}
```

Error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

Error `code` values are stable application identifiers. Messages are safe to display but clients may map codes to localized copy.

Money is represented in the currency's smallest practical unit as integers. Seed values currently use whole Nigerian naira, so `4800` means `₦4,800`. Floating-point amounts must not be used for financial calculations.

## Current endpoints

### Health

```http
GET /health
```

Returns service name, runtime status, environment, and timestamp.

### List or search restaurants

```http
GET /api/v1/restaurants
GET /api/v1/restaurants?q=jollof
```

Returns restaurant summaries without full menus.

### Restaurant details

```http
GET /api/v1/restaurants/:restaurantId
```

Returns restaurant metadata and categorized menu items.

### Customer order history

```http
GET /api/v1/orders
X-Customer-Id: development-customer-id
```

### Customer order detail

```http
GET /api/v1/orders/:orderId
X-Customer-Id: development-customer-id
```

### Create an order

```http
POST /api/v1/orders
Content-Type: application/json
X-Customer-Id: development-customer-id

{
  "restaurantId": "jollof-corner",
  "deliveryAddress": "12 Adeola Odeku Street, Lagos",
  "deliveryFee": 900,
  "items": [
    {
      "menuItemId": "party-jollof-chicken",
      "name": "Party Jollof & Chicken",
      "unitPrice": 4800,
      "quantity": 2
    }
  ]
}
```

The temporary `X-Customer-Id` mechanism only provides a development seam. It is not production authentication. A production bearer-token implementation will replace it.

## Critical ordering rules

Before production, order creation must be moved into a service that:

1. Loads the restaurant and menu items from the database.
2. Verifies that the restaurant is open and delivers to the address.
3. Confirms every item and selected option is available.
4. Calculates item prices, discounts, fees, and totals on the server.
5. Creates an immutable order-item snapshot.
6. Starts or verifies the payment transaction.
7. Persists the order and status event in a database transaction.
8. Publishes notification work after the transaction commits.

The current endpoint accepts names and prices only to demonstrate the HTTP and repository flow. Client-provided financial values must not be trusted in production.

## Planned modules

```text
modules/
├── auth/
├── users/
├── addresses/
├── restaurants/
├── menus/
├── carts/
├── orders/
├── payments/
├── delivery/
├── promotions/
├── favorites/
├── reviews/
└── notifications/
```

## Persistence plan

PostgreSQL will be the source of truth. Initial tables are expected to include:

- users
- customer_addresses
- restaurants
- restaurant_hours
- delivery_zones
- menu_categories
- menu_items
- menu_item_option_groups
- menu_item_options
- carts and cart_items
- orders and order_items
- order_status_events
- payments and payment_events
- promotions and promotion_redemptions
- favorites
- reviews
- device_tokens

Repository interfaces keep the domain independent of the eventual database library. Database migrations must be committed and applied through deployment automation.

## Authentication and authorization

The planned production model is:

- Short-lived bearer access tokens
- Rotating refresh tokens or a managed identity provider
- Customer identity attached by authentication middleware
- Role-based access for customers, restaurant staff, couriers, support, and administrators
- Resource ownership checks in services and queries
- Rate limiting for authentication, promotions, checkout, and public discovery APIs

Never authorize access from a user ID supplied directly in the request body or query string.

## Payments

Payment provider selection is intentionally open. Regardless of provider:

- The backend creates payment intents or checkout sessions.
- Provider secret keys remain server-side.
- Webhook signatures are verified against the raw request body.
- Webhook processing is idempotent.
- The order is paid only after server-side confirmation.
- Payment event IDs are unique to prevent replay.
- Refunds and failures are retained as auditable state transitions.

## Order status model

The initial status progression is:

```text
pending
  → confirmed
  → preparing
  → ready_for_pickup
  → out_for_delivery
  → delivered
```

Orders may also transition to `cancelled` under explicit business rules. Status transitions should be validated by role and current state, persisted as events, and exposed to customers through polling initially and realtime delivery later.

## Testing strategy

- Unit tests for pricing, availability, promotions, and status transitions
- Repository contract tests for in-memory and PostgreSQL adapters
- API integration tests through `app.inject`
- Payment webhook fixture tests
- Database integration tests against an isolated PostgreSQL instance
- End-to-end checkout tests covering the Flutter client and API

Tests must never depend on production services or credentials.

## Deployment

A production deployment should:

1. Install exact lockfile dependencies with `npm ci`.
2. Run type checking and tests.
3. Compile with `npm run build`.
4. Apply database migrations as a controlled release step.
5. Start `dist/index.js` behind HTTPS.
6. Use `/health` for readiness monitoring.
7. Inject secrets through the hosting platform.
8. Centralize structured logs and error reporting.

The server handles `SIGINT` and `SIGTERM` so managed platforms can drain it cleanly.

## Engineering conventions

- Keep TypeScript strict; do not solve errors with broad `any` types.
- Validate every external boundary.
- Keep HTTP translation in routes and business rules in services.
- Depend on repository interfaces, not database clients, from use cases.
- Use explicit, stable error codes.
- Treat all client input as untrusted.
- Make commands and webhook handlers idempotent.
- Log identifiers and outcomes, not credentials or unnecessary personal data.
- Add regression tests with every defect fix.

## Security checklist

- Restrictive production CORS
- Authentication and role-based authorization
- Request size limits and rate limiting
- Server-calculated prices and discounts
- Parameterized database access
- Payment webhook signature verification
- Idempotency keys for checkout and callbacks
- Encrypted transport and managed secrets
- Redacted structured logs
- Dependency and container scanning
- Data retention and account deletion procedures

## Roadmap

### Foundation

- [x] Strict TypeScript Fastify service
- [x] Validation and stable error contract
- [x] Restaurant discovery and menu endpoints
- [x] Initial order API and integration tests
- [ ] PostgreSQL schema, migrations, and repositories
- [ ] OpenAPI document and generated Flutter client

### Ordering MVP

- [ ] Customer authentication
- [ ] Customer profiles and addresses
- [ ] Server-side cart and pricing engine
- [ ] Restaurant hours, availability, and delivery zones
- [ ] Checkout idempotency
- [ ] Payment provider and verified webhooks
- [ ] Validated order status transitions
- [ ] Push notification worker

### Operations and growth

- [ ] Restaurant management API
- [ ] Courier workflow and delivery assignment
- [ ] Promotions and referrals
- [ ] Reviews and favorites
- [ ] Realtime order tracking
- [ ] Admin audit tools
- [ ] Metrics, tracing, backups, and disaster recovery

## License

Copyright © 2026 NdiChow. All rights reserved unless a separate license is added.
