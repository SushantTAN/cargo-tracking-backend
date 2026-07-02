# Backend Architecture & Maintenance Guide

> **Audience:** AI agents and human engineers who will modify, extend, or
> debug this codebase. This document is intentionally explicit so that future
> changes can be made confidently without rediscovering intent.

---

## 1. Project Overview

This is the backend of a Cargo Tracking System. It is a Node.js / Express /
TypeScript REST API backed by **PostgreSQL via Prisma ORM**.

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ | Required by Next.js frontend parity; modern features |
| Language | TypeScript (strict) | Type safety end-to-end |
| Web framework | Express 4 | Minimal, well-understood, easy to extend |
| ORM | Prisma 5 | Strong types, migrations, relation management |
| Database | PostgreSQL | Required by the spec — only PostgreSQL is supported |
| Auth | JWT (access + refresh) | Stateless, supports rotation |
| Password hashing | bcryptjs (12 rounds) | Standard, no native compile step |
| Validation | Yup | Shared with the frontend for consistency |
| Rate limiting | express-rate-limit + rate-limit-redis | Three tiers (general/auth/tracking) |
| Caching / sessions | ioredis (optional, in-memory fallback) | Works locally without Redis |

---

## 2. Folder Structure

```
cargo-tracking-backend/
├── prisma/
│   ├── schema.prisma      # Database schema (source of truth for models)
│   └── seed.ts            # Idempotent seed: admin user, permissions, sample cargo
├── src/
│   ├── app.ts             # Express app: middleware + route wiring
│   ├── server.ts          # Process entry: connects DB and starts HTTP listener
│   ├── config/
│   │   ├── env.ts         # Loads .env via dotenv, exposes typed `env` object
│   │   ├── prisma.ts      # Singleton PrismaClient (single connection pool)
│   │   └── redis.ts       # Optional Redis client with in-memory fallback
│   ├── middleware/
│   │   ├── auth.middleware.ts        # authenticate, requireRole, requirePermission
│   │   ├── validation.middleware.ts  # validateBody, validateParams (Yup)
│   │   ├── error.middleware.ts       # Centralized error handler + 404
│   │   └── rate-limit.middleware.ts  # generalLimiter, authLimiter, trackingLimiter
│   ├── controllers/       # Business logic per resource (Express handlers)
│   │   ├── auth.controller.ts         # register, login, refresh, logout, me
│   │   ├── user.controller.ts         # CRUD + permissions + status
│   │   ├── permission.controller.ts   # list + create
│   │   ├── cargo.controller.ts        # CRUD + status updates + dashboard stats
│   │   └── customer.controller.ts     # customer-scoped cargo list + profile
│   ├── routes/            # URL → controller wiring, applies middleware
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── permission.routes.ts
│   │   ├── cargo.routes.ts
│   │   └── customer.routes.ts
│   ├── validators/        # Yup schemas; one file per domain
│   │   ├── auth.validator.ts
│   │   ├── user.validator.ts
│   │   ├── permission.validator.ts
│   │   ├── cargo.validator.ts
│   │   └── query.validator.ts         # Query-string helpers
│   ├── utils/
│   │   ├── ApiError.ts    # Typed error class with helpers (badRequest, forbidden, ...)
│   │   └── jwt.ts         # generateAccessToken / generateRefreshToken / store in Redis
│   └── types/
│       └── index.ts       # JwtPayload, Express.Request augmentation
├── .env.example           # Template for required env vars
├── tsconfig.json          # Strict TS, commonjs module, dist/ output
└── package.json
```

**Conventions:**
- Controllers are thin: they parse inputs (already validated by middleware),
  call Prisma, and respond. Heavy logic should live in a service layer (we have
  none yet; add `src/services/` if a controller grows beyond ~150 lines).
- Validators use Yup and live alongside their domain (`*.validator.ts`).
- Every new route file should follow the pattern in existing routes.

---

## 3. Authentication & Authorization

### 3.1 Token model

Two tokens are issued at login/register:

| Token | TTL (default) | Storage | Lifetime |
|---|---|---|---|
| `accessToken` | 15m | Client memory / `localStorage` | Sent in `Authorization: Bearer <token>` |
| `refreshToken` | 7d | Redis (key `refresh:<userId>:<jti>`) + client `localStorage` | Sent to `POST /api/auth/refresh` |

Both are signed with the same `JWT_SECRET` and share the same payload
(`{ userId, email, role, jti? }`). The refresh token's `jti` is also stored in
Redis with a TTL so we can revoke individual sessions.

### 3.2 Token rotation

Every call to `POST /api/auth/refresh`:

1. Verifies the refresh JWT signature/expiry.
2. Looks up `refresh:<userId>:<jti>` in Redis.
3. Deletes the old key (rotation).
4. Issues a fresh access + refresh pair.
5. Returns `{ accessToken, refreshToken }`.

The frontend's axios interceptor handles this transparently on 401s
(`src/lib/api.ts` in the frontend repo).

### 3.3 Logout

`POST /api/auth/logout` deletes `refresh:<userId>:<jti>` from Redis. The
access token remains technically valid until expiry (15m) — this is a known
trade-off for stateless JWT. Add a Redis blocklist of access-token `jti`s if
you need instant revocation.

### 3.4 Roles & permissions

Roles (`RoleName` enum in `schema.prisma`):
- `ADMIN` — full access (bypasses permission middleware)
- `STAFF` — explicitly granted permissions only
- `CUSTOMER` — can only see their own cargo

Permissions live in the `Permission` table. Users receive them via the
`UserPermission` join table (user-level grants, not role-level). On every
authenticated request, `authenticate` middleware populates `req.userPermissions`
from the database.

### 3.5 Middleware stack

For an authenticated, role-and-permission-gated route:

```ts
router.use(authenticate);                 // 1. verify JWT, populate req.user
router.get('/x', requirePermission('x:y'), handler);  // 2. check permission
```

`requirePermission(...)` accepts any number of permission names; the user
must have **at least one** to pass (logical OR). Admins always pass.

---

## 4. Validation

All incoming request bodies are validated by Yup via `validateBody(schema)`.
URL params by `validateParams(schema)`. Validation errors return HTTP 400 with:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": { "fieldName": ["error message 1", "error message 2"] }
}
```

`abortEarly: false` collects all errors; `stripUnknown: true` removes unknown
fields silently.

**To add a new endpoint:**

1. Add a Yup schema in the relevant `*.validator.ts`.
2. Apply `validateBody(...)` / `validateParams(...)` in the route.
3. The controller reads from `req.body` (now typed by Yup's `InferType`).

---

## 5. Error Handling

`ApiError` (in `src/utils/ApiError.ts`) is the only error type that should be
thrown from controllers. Helpers:

```ts
ApiError.badRequest(msg, errors?)       // 400
ApiError.unauthorized(msg?)             // 401
ApiError.forbidden(msg?)                // 403
ApiError.notFound(msg?)                 // 404
ApiError.conflict(msg)                  // 409
ApiError.internal(msg?)                 // 500 (non-operational)
```

The `errorHandler` middleware (last in `app.ts`) converts `ApiError` → JSON
response. Anything else becomes a 500 with a generic message (stack only in
development). Use `next(error)` to forward.

---

## 6. Rate Limiting

Three limiters, applied per route prefix:

| Limiter | Scope | Window | Max req |
|---|---|---|---|
| `generalLimiter` | all `/api/*` | 1m | 200 |
| `authLimiter` | `/api/auth/login`, `/register-customer` | 15m | 10 |
| `trackingLimiter` | `/api/cargo/tracking/:trackingNumber` | 1m | 60 |

Storage is Redis if `REDIS_URL` is reachable, otherwise in-memory (Map with
periodic cleanup). The Redis-vs-memory switch is **transparent** — limiters
just call `makeStore(prefix)`.

---

## 7. Database

### 7.1 Schema (`prisma/schema.prisma`)

Models:

- `User` (uuid, email unique, role enum, isActive boolean)
- `Permission` (uuid, name unique like `cargo:create`)
- `UserPermission` (join table; unique on `[userId, permissionId]`)
- `Cargo` (uuid, trackingNumber unique, currentStatus enum, optional weight Float)
- `CargoStatusUpdate` (uuid, status enum, optional lat/lng/locationText/note)

Enums:
- `RoleName { ADMIN, STAFF, CUSTOMER }`
- `CargoStatus { PENDING, PICKED_UP, IN_TRANSIT, ARRIVED_AT_HUB, OUT_FOR_DELIVERY, DELIVERED, CANCELLED }`

### 7.2 Migrations

```bash
npx prisma migrate dev --name <descriptive_name>
npx prisma generate         # regenerate @prisma/client types
```

The Prisma client lives at `node_modules/@prisma/client` and is imported as
the singleton from `src/config/prisma.ts`.

### 7.3 Seed (`prisma/seed.ts`)

Idempotent — uses `upsert` everywhere. Creates:

- 10 default permissions
- Default admin user (`admin@example.com` / `Admin@12345`) with all permissions
- Default staff user (`staff@example.com` / `Staff@12345`) with cargo perms
- Default customer (`customer@example.com` / `Customer@12345`)
- Sample cargo `CT-DEMO-001` with three status updates

Run with: `npm run prisma:seed`

---

## 8. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `JWT_SECRET` | (required) | HMAC secret for both access + refresh JWTs |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL (any `ms` library format) |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `PORT` | `5000` | HTTP listener port |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin allow-list |
| `NODE_ENV` | `development` | `development` enables stack traces in errors |
| `REDIS_URL` | empty | Optional. If unset, app uses in-memory store |

All env vars are validated at boot (`src/config/env.ts`) — process exits if
`DATABASE_URL` is missing.

---

## 9. Adding a Feature (Recipe)

### 9.1 Add a new endpoint (e.g. `GET /api/cargo/archived`)

1. **Schema** — if it requires new fields, edit `prisma/schema.prisma` and run
   `npx prisma migrate dev --name add_archived_field`.
2. **Validator** — add a Yup schema to `src/validators/cargo.validator.ts`.
3. **Controller** — add a new handler in `src/controllers/cargo.controller.ts`.
   Throw `ApiError.notFound(...)` for missing resources.
4. **Route** — register the URL in `src/routes/cargo.routes.ts`. Apply
   `validateParams(...)` / `validateBody(...)` and permission middleware.
5. **Permission** — if needed, add a new permission name to the seed
   (`prisma/seed.ts` DEFAULT_PERMISSIONS) and re-run `npm run prisma:seed`.

### 9.2 Add a new permission to all admins

Edit `prisma/seed.ts` → push to `DEFAULT_PERMISSIONS`. The seed upserts new
permissions on every run. To assign to existing admins, also write a one-off
migration script that inserts into `UserPermission` for every admin user.

### 9.3 Add a new role

1. Add to `enum RoleName` in `schema.prisma` and migrate.
2. Update `requireRole(...)` typing in `auth.middleware.ts`.
3. Update `requirePermission` default-bypass logic if you want the new role
   to also bypass.
4. Add a default permission set in the seed if appropriate.

---

## 10. Endpoint Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register-customer` | No | Self-register; returns access + refresh tokens |
| POST | `/api/auth/login` | No | Email/password login |
| POST | `/api/auth/refresh` | No | Trade a refresh token for a fresh pair |
| POST | `/api/auth/logout` | Yes | Revokes the supplied refresh token |
| GET  | `/api/auth/me` | Yes | Returns current user + permissions |

### Users
| Method | Path | Permission |
|---|---|---|
| POST | `/api/users` | `users:create` |
| GET  | `/api/users` | `users:read` |
| GET  | `/api/users/:id` | `users:read` |
| PATCH | `/api/users/:id` | `users:update` |
| PATCH | `/api/users/:id/permissions` | `permissions:manage` |
| PATCH | `/api/users/:id/status` | `users:update` |

Query filters (all combined with AND): `?role=ADMIN,STAFF&isActive=true&search=foo`

### Permissions
| Method | Path | Permission |
|---|---|---|
| GET  | `/api/permissions` | `permissions:manage` |
| POST | `/api/permissions` | `permissions:manage` |

### Cargo
| Method | Path | Permission / Notes |
|---|---|---|
| POST | `/api/cargo` | `cargo:create` |
| GET  | `/api/cargo` | `cargo:read` (customers scoped to their own) |
| GET  | `/api/cargo/:id` | `cargo:read` |
| GET  | `/api/cargo/tracking/:trackingNumber` | **No auth** (rate-limited) |
| GET  | `/api/cargo/stats/dashboard` | `cargo:read` (supports `?period=`) |
| PATCH | `/api/cargo/:id` | `cargo:update` |
| POST | `/api/cargo/:id/status-updates` | `cargo:update` (transactional with `currentStatus`) |
| GET  | `/api/cargo/:id/status-updates` | `cargo:read` |

Cargo query filters: `?status=PENDING,DELIVERED&customerId=<uuid>&search=foo&startDate=ISO&endDate=ISO`

### Customer
| Method | Path | Role |
|---|---|---|
| GET | `/api/customer/profile` | CUSTOMER |
| GET | `/api/customer/cargo` | CUSTOMER |
| GET | `/api/customer/cargo/:id` | CUSTOMER |

---

## 11. Dashboard Period Filter

`GET /api/cargo/stats/dashboard?period=<key>` accepts:

| Key | Range |
|---|---|
| `today` | today 00:00 → now |
| `yesterday` | yesterday 00:00 → 23:59 |
| `this_week` | Mon 00:00 → now |
| `last_week` | previous Mon → Sun |
| `this_month` | 1st of month → now |
| `last_month` | previous month |
| `last_7_days` | rolling 7d |
| `last_30_days` | rolling 30d |
| `last_90_days` | rolling 90d |
| `this_year` | Jan 1 → now |
| `all_time` | (default) |

The endpoint returns:
```ts
{
  period: string,
  range: { start: ISO, end: ISO } | null,
  totalCargo: number,
  totalWeightKg: number,
  statusCounts: Record<CargoStatus, number>,
  daily: [{ date, count }, ...],   // capped at 60 days
  weekly: [{ week, count }, ...],  // capped at 24 weeks
  monthly: [{ month, count }, ...] // capped at 24 months
}
```

---

## 12. Common Gotchas

- **Prisma client stale**: run `npx prisma generate` after every schema change.
- **`JWT_SECRET` change**: invalidates **all** existing tokens (intended).
- **Rate limiter Redis**: if Redis is up but slow, the limiter uses
  `enableOfflineQueue: false` and falls back to in-memory after a connection
  failure. No action needed.
- **Customer isolation**: enforced both in `getAllCargo` (auto-scopes
  `customerId = req.user.userId`) and in `getCargoById` / `getStatusUpdates`
  (throws 403 if mismatch). Don't bypass these checks.
- **Transactional status updates**: `createStatusUpdate` uses
  `prisma.$transaction(async tx => ...)` to keep `CargoStatusUpdate` and
  `Cargo.currentStatus` in sync. Don't split them.
- **Yarn vs npm**: project is npm-only. Do not introduce yarn.lock.

---

## 13. Testing locally

```bash
# 1. Spin up Postgres
brew services start postgresql@16
createdb cargo_tracking_db

# 2. Backend setup
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

The server listens on `http://localhost:5000`. A `GET /api/health` returns
`{ success: true, message: "Cargo Tracking API is running" }`.

---

## 14. Prisma 7.8.0 Migration Notes

This codebase runs on **Prisma 7.8.0** (`@prisma/client@^7.8.0`,
`prisma@^7.8.0`). If you are familiar with Prisma 5/6, here is what
changed and what we had to adjust.

### 14.1 Datasource URL moved out of `schema.prisma`

In Prisma 5/6, the schema file contained the connection URL:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ← REMOVED in Prisma 7
}
```

Prisma 7 rejects this with:

```
error: The datasource property `url` is no longer supported in schema files.
Move connection URLs for Migrate to `prisma.config.ts` and pass either
`adapter` for a direct database connection or `accelerateUrl` for Accelerate
to the `PrismaClient` constructor.
```

**Fix:** the URL lives in **`prisma.config.ts`** (used by the Prisma CLI /
migrations) and is passed to the runtime client via the new
**Driver Adapter** API.

### 14.2 `prisma.config.ts`

A new file at the project root reads the URL from the environment and tells
Prisma where the schema + migrations + seed live:

```ts
// prisma.config.ts
import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});
```

### 14.3 Driver Adapter at runtime

The schema datasource block now has **only `provider`**:

```prisma
datasource db {
  provider = "postgresql"
}
```

At runtime, `src/config/prisma.ts` passes a `PrismaPg` adapter (from
`@prisma/adapter-pg`) to `new PrismaClient({ adapter, log: [...] })`:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });
export default prisma;
```

The `PrismaPg` adapter accepts a connection string (or a `pg.Pool` /
`pg.PoolConfig` for connection pooling). It uses the `pg` driver under the
hood.

### 14.4 Node.js requirement

Prisma 7 requires **Node.js `^20.19 || ^22.12 || >=24.0`**. Earlier Node
20.x patches are unsupported.

### 14.5 Migrations

We don't import an old migration history (Prisma 5 → 7 is a major version
gap; the old `_prisma_migrations` table is incompatible). Fresh installs:

```bash
npx prisma generate                  # regen client
npx prisma migrate deploy            # apply migrations/20260101000000_init/migration.sql
npm run prisma:seed                  # seed defaults
```

To create new migrations after a schema change:

```bash
npx prisma migrate dev --name <descriptive_name>
# or, for diff-only:
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --script
```

### 14.6 New runtime dependencies

- `@prisma/adapter-pg` — PrismaPg driver adapter
- `pg` — underlying PostgreSQL client (pulled in by the adapter)
- `@types/pg` — TypeScript types

### 14.9 `prisma/seed.ts` also needs the adapter

`prisma/seed.ts` is a standalone script (runs outside `src/`). In Prisma 7
it can no longer do `new PrismaClient()` without options — it has to
construct the client with the same Driver Adapter the runtime uses:

```ts
// prisma/seed.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Aborting seed.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

`import 'dotenv/config'` at the top loads `.env` so `DATABASE_URL` is
populated when running `npm run prisma:seed` directly.

### 14.8 Regenerating the init migration

If you ever need to regenerate `prisma/migrations/<name>/migration.sql` from
the current schema, **do not** redirect the prisma CLI's output to the file
with `>` because the CLI prints informational messages like
`Loaded Prisma config from prisma.config.ts.` to **stderr**, but `>` only
captures stdout, so those messages shouldn't pollute the file — but in
some shells / Windows shells / when combined with other redirects, they
have ended up in the SQL file, causing `migrate deploy` to fail with
`ERROR: syntax error at or near "Loaded"`.

Use the provided helper instead:

```bash
bash scripts/regenerate-migration.sh [migration_name]
```

The script:
1. Truncates `prisma/migrations/<name>/migration.sql` (`: > file`).
2. Runs `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
3. Appends **only stdout** (the SQL) to the file; redirects **stderr** to
   `/dev/null` so no informational messages leak in.
4. Ensures `prisma/migrations/migration_lock.toml` exists with `provider = "postgresql"`.

### 14.7 What did NOT change

- The schema model syntax (`model User { ... }`, `@relation`, enums, etc.)
  is unchanged.
- The Prisma client API (`prisma.user.findMany()`, etc.) is unchanged.
- Yup validators, controllers, middleware, routes — all unchanged.
- Redis, JWT, bcrypt, rate-limiting — unchanged.

---

## 15. Conditional Yup Validation (empty-string → undefined pattern)

Yup's `.notRequired()` only short-circuits validation when the field is
`undefined` or `null`. An **empty string `""`** still passes `.string()` but
fails `.min(4)`, `.matches(...)`, etc. — which makes form-cleared fields
show validation errors they shouldn't.

### The pattern

For any field that the user can leave blank, transform empty / whitespace-
only strings to `undefined` BEFORE the other validators run:

```ts
someOptionalField: yup
  .string()
  // Convert "" / "   " → undefined so the rest of the rules are skipped.
  .transform((v) => (typeof v === "string" && v.trim() === "" ? undefined : v))
  .trim()
  .min(4, "Too short")
  .max(50, "Too long")
  .matches(/^[A-Za-z0-9-]+$/, "Invalid characters")
  .notRequired(),
```

This is used on:
- `Cargo.trackingNumber` (auto-generated if left blank)
- `Cargo.receiverEmail` (optional)
- `Cargo.receiverContact` (optional)
- `User.contact` (required for STAFF/CUSTOMER only — validated conditionally
  on `role` with `.test()`, but the empty-string transform is applied
  unconditionally for consistency)

### Verification

A standalone test script is shipped at
`cargo-tracking-backend/scripts/test-tracking.ts`. Run:

```bash
cd cargo-tracking-backend
npx ts-node scripts/test-tracking.ts
```

It exercises 10 inputs covering empty / whitespace / valid / invalid
cases. The mirror test for the frontend lives at
`cargo-tracking-frontend/scripts/test-tracking.mjs` and is run via
`npx tsx scripts/test-tracking.mjs`.
