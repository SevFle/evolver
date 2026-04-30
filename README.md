# HookRelay

**Webhook delivery infrastructure that actually works.**

Stop babysitting HTTP callbacks. HookRelay gives your SaaS reliable, observable, signed webhook delivery — with automatic retries, circuit breakers, and a real-time dashboard — so you ship features instead of debugging 504s at 2am.

---

## Why HookRelay

Webhooks sound simple. They aren't.

Your customer's endpoint goes down. Your retry logic has an off-by-one. A burst of events overwhelms a slow consumer. A payload gets tampered with in transit. You're drowning in logs trying to figure out what actually delivered.

HookRelay handles all of that:

- **Guaranteed delivery** — every event persisted to Postgres before any network call
- **Exponential backoff retries** — 1min → 5min → 30min → 2hr → 12hr, configurable per endpoint
- **Circuit breaker** — auto-disables endpoints after 5 consecutive failures; re-enables on recovery
- **HMAC-SHA256 signing** — every payload signed so consumers can verify authenticity
- **Dead letter queue** — nothing silently disappears; inspect and replay failed events
- **Real-time dashboard** — delivery status, attempt history, endpoint health at a glance
- **Endpoint groups** — fan-out a single event to multiple consumers atomically

---

## Architecture

```
Client API call
     │
     ▼
┌─────────────┐     persists     ┌──────────────┐
│  REST API   │ ───────────────► │  PostgreSQL  │
│  (Next.js)  │                  │  (events +   │
└─────────────┘                  │  deliveries) │
     │                           └──────────────┘
     │ enqueues
     ▼
┌─────────────┐     pulls jobs   ┌──────────────┐
│   BullMQ    │ ◄─────────────── │   Workers    │
│   (Redis)   │                  │  (N parallel)│
└─────────────┘                  └──────┬───────┘
                                        │ HTTP POST
                                        ▼
                                 Customer endpoint
                                 (signed payload)
```

Every delivery attempt is logged. Every retry is scheduled. Every circuit trip is recorded. Nothing is fire-and-forget.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript 5 strict |
| Frontend | React 19 + Tailwind CSS 4 |
| API | Next.js Route Handlers + tRPC |
| Database | PostgreSQL (Neon / local) via Drizzle ORM |
| Queue | BullMQ on Redis (Upstash / local) |
| Auth | NextAuth.js v5 |
| Testing | Vitest (unit + integration) + Playwright (E2E) |

---

## Quick Start

### Local (Docker)

```bash
# Start Postgres + Redis
docker run -d --name hookrelay-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hookrelay \
  -p 5432:5432 postgres:16-alpine

docker run -d --name hookrelay-redis \
  -p 6379:6379 redis:7-alpine

# Install and configure
pnpm install
cp .env.example .env
# Edit .env — set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hookrelay

# Push schema
pnpm db:push

# Start dev server
pnpm dev
# → http://localhost:3000

# In a second terminal — start the delivery worker
pnpm worker
```

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `DATABASE_URL_NON_POOLING` | Direct connection for migrations | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `AUTH_SECRET` | NextAuth secret (`openssl rand -hex 32`) | Yes |
| `AUTH_URL` | Base URL for auth callbacks | Yes |
| `WORKER_CONCURRENCY` | Parallel delivery workers | No (default: 10) |
| `EMAIL_PROVIDER` | `log` (dev) or `resend` (prod) | No |
| `RESEND_API_KEY` | Resend API key for email alerts | If `resend` |

---

## API Reference

All endpoints require `Authorization: Bearer <api_key>`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/endpoints` | Register a new delivery target |
| `GET` | `/v1/endpoints` | List all endpoints |
| `GET` | `/v1/endpoints/:id` | Endpoint details + health stats |
| `PATCH` | `/v1/endpoints/:id` | Update URL, headers, or signing secret |
| `DELETE` | `/v1/endpoints/:id` | Remove endpoint |

### Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/events` | Send a webhook event |
| `GET` | `/v1/events/:id` | Event details with all delivery attempts |

### Example: send an event

```bash
curl -X POST https://your-hookrelay.com/v1/events \
  -H "Authorization: Bearer hr_live_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint_id": "ep_01abc...",
    "event_type": "payment.completed",
    "payload": { "amount": 9900, "currency": "usd", "customer_id": "cus_xyz" }
  }'
```

### Verify incoming payloads (consumer side)

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
```

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/             # Login, signup, password reset
│   ├── (dashboard)/        # Protected UI — endpoints, events, analytics
│   └── api/
│       ├── trpc/           # Type-safe dashboard API
│       ├── health/         # Health check
│       └── v1/             # Public REST API
├── server/
│   ├── db/                 # Drizzle schema, queries, migrations
│   ├── services/           # Delivery engine, signing, retry, circuit breaker
│   ├── queue/              # BullMQ producer + worker
│   └── auth/               # Session management, API key hashing
├── components/             # UI components
├── lib/                    # Shared utilities
└── types/                  # Shared TypeScript types
```

---

## Development

```bash
pnpm dev              # Next.js dev server (Turbopack)
pnpm worker           # Delivery worker process

pnpm test             # Unit + integration tests (Vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm test:e2e         # Playwright E2E tests

pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint

pnpm db:generate      # Generate Drizzle migrations from schema
pnpm db:migrate       # Apply migrations (Neon / remote)
pnpm db:push          # Push schema directly (local dev)
pnpm db:studio        # Drizzle Studio GUI
```

---

## Delivery Guarantees

| Scenario | Behavior |
|---|---|
| Endpoint returns 2xx | Marked `delivered` |
| Endpoint returns 4xx/5xx | Scheduled for retry |
| Network timeout | Scheduled for retry |
| 5 consecutive failures | Circuit opened; endpoint marked `degraded` |
| All retries exhausted | Moved to dead letter queue |
| Circuit recovery | Next 2xx re-closes the circuit |

Retry schedule: **1min → 5min → 30min → 2hr → 12hr** (~15hr total window).

---

## License

Proprietary — All rights reserved.
