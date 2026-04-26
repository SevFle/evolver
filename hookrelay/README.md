# HookRelay

Reliable webhook infrastructure for SaaS teams — send webhooks without the headache.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript 5.x (strict mode)
- **Frontend:** React 19 + Tailwind CSS 4 + shadcn/ui components
- **API:** Next.js Route Handlers + tRPC for type-safe dashboard API
- **Database:** PostgreSQL via Neon (Drizzle ORM)
- **Queue:** BullMQ + Upstash Redis
- **Auth:** NextAuth.js v5
- **Testing:** Vitest (unit + integration) + Playwright (E2E)
- **Package Manager:** pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL (or Neon account)
- Redis (or Upstash account)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database and Redis credentials
# For local development with Docker:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hookrelay
#   REDIS_URL=redis://localhost:6379

# Generate database migrations
pnpm db:generate

# Run migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `AUTH_SECRET` | NextAuth secret key | Yes |
| `AUTH_URL` | Base URL for auth callbacks | Yes |
| `WORKER_CONCURRENCY` | Number of parallel delivery workers | No (default: 10) |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, signup, forgot password
│   ├── (dashboard)/        # Protected dashboard pages
│   ├── api/
│   │   ├── trpc/           # tRPC router
│   │   ├── health/         # Health check endpoint
│   │   └── v1/             # Public REST API
├── server/
│   ├── trpc/               # tRPC setup and routers
│   ├── db/                 # Drizzle schema and queries
│   ├── services/           # Delivery, signing, retry, circuit breaker
│   ├── queue/              # BullMQ producer, worker, handlers
│   └── auth/               # Session and API key management
├── components/             # React components
├── lib/                    # Shared utilities and constants
└── types/                  # Shared TypeScript types
```

## API Reference

### Public API (v1)

All endpoints require `Authorization: Bearer <api_key>` header.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/endpoints` | Create a new endpoint |
| `GET` | `/v1/endpoints` | List all endpoints |
| `GET` | `/v1/endpoints/:id` | Get endpoint details |
| `PATCH` | `/v1/endpoints/:id` | Update an endpoint |
| `DELETE` | `/v1/endpoints/:id` | Delete an endpoint |
| `POST` | `/v1/events` | Send a webhook event |
| `GET` | `/v1/events/:id` | Get event with delivery attempts |

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status |

## Development

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Start delivery worker
pnpm worker

# Database management
pnpm db:generate    # Generate migrations from schema
pnpm db:migrate     # Apply migrations
pnpm db:push        # Push schema directly (dev only)
pnpm db:studio      # Open Drizzle Studio
```

## Architecture

HookRelay uses an event-driven architecture with a persistent job queue:

1. **API** accepts webhook events and persists them to PostgreSQL
2. **Producer** enqueues delivery jobs in BullMQ/Redis
3. **Workers** (separate process) pick up jobs and execute HTTP deliveries
4. **Retries** use exponential backoff: 1min → 5min → 30min → 2hr → 12hr
5. **Circuit breaker** auto-disables endpoints after 5 consecutive failures
6. Every payload is signed with HMAC-SHA256 for verification

## License

Proprietary — All rights reserved.
