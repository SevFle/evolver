# ShipLens

Branded shipment tracking pages & automated customer notifications for small freight forwarders.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x |
| API | Fastify 5 |
| Tracking Pages | Next.js 15 (App Router, SSR) |
| Admin Dashboard | Next.js 15 (App Router) |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Queue / Cache | Redis 7 + BullMQ |
| Email | Resend |
| SMS | Twilio |
| Object Storage | Cloudflare R2 |
| Deployment | Fly.io → AWS Fargate |

## Prerequisites

- Node.js 22+
- npm 10+
- PostgreSQL 16
- Redis 7

## Setup

```bash
# 1. Install dependencies
npm ci

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your local database, Redis, and API keys

# 3. Push database schema
npm run db:push

# 4. Start all services in development mode
npm run dev
```

## Project Structure

```
shiplens/
├── apps/
│   ├── api/           # Fastify REST API (port 3001)
│   ├── tracker/       # Customer-facing tracking pages (port 3000)
│   └── admin/         # Forwarder admin dashboard (port 3002)
├── packages/
│   ├── db/            # Drizzle schema, migrations, DB client
│   └── shared/        # Shared types and utilities
├── e2e/               # Playwright E2E tests
├── .github/           # GitHub Actions CI
├── turbo.json         # Turborepo task configuration
└── package.json       # Monorepo root
```

## Development

```bash
# Start all apps in dev mode
npm run dev

# Run only the API
npm run dev --workspace=@shiplens/api

# Run only the tracker
npm run dev --workspace=@shiplens/tracker
```

## Testing

```bash
# Run all unit & integration tests
npm test

# Run tests for a specific app
npm test --workspace=@shiplens/api

# Run E2E tests (requires API running)
npm run test:e2e

# Run tests in watch mode
npm run test:watch --workspace=@shiplens/api
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/shipments` | List shipments |
| POST | `/api/shipments` | Create shipment |
| GET | `/api/shipments/:trackingId` | Get shipment by tracking ID |
| POST | `/api/milestones` | Create milestone |
| GET | `/api/milestones/shipment/:shipmentId` | List milestones for shipment |
| GET | `/api/tenants/current` | Get current tenant |
| PATCH | `/api/tenants/current` | Update tenant settings |
| GET | `/api/api-keys` | List API keys |
| POST | `/api/api-keys` | Create API key |
| DELETE | `/api/api-keys/:id` | Revoke API key |
| GET | `/api/notifications/rules` | List notification rules |
| POST | `/api/notifications/rules` | Create notification rule |
| GET | `/api/notifications/history` | Notification history |
| POST | `/api/csv-import` | Upload CSV for bulk import |
| GET | `/api/csv-import/:jobId/status` | CSV import job status |

## License

Proprietary
