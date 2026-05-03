# ShipLens

Branded shipment tracking pages & automated customer notifications for small freight forwarders.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.x |
| API | Fastify 5 |
| Tracking Pages & Admin | Next.js 15 (App Router) |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Queue / Cache | Redis 7 + BullMQ |
| Email | Resend |
| SMS | Twilio |
| Storage | Cloudflare R2 |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Monorepo | Turborepo + npm workspaces |

## Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL 16
- Redis 7

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your local database and Redis connection strings.

### 3. Start infrastructure (Docker)

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 4. Run database migrations

```bash
npm run db:generate
npm run db:migrate
```

### 5. Start development servers

```bash
npm run dev
```

This starts all three apps concurrently:
- **API** (Fastify) on `http://localhost:3001`
- **Tracker** (Next.js) on `http://localhost:3000`
- **Admin** (Next.js) on `http://localhost:3002`

## Project Structure

```
shiplens/
├── apps/
│   ├── api/                  # Fastify REST API
│   ├── tracker/              # Next.js customer-facing tracking pages
│   └── admin/                # Next.js forwarder admin dashboard
├── packages/
│   ├── db/                   # Drizzle ORM schema & migrations
│   ├── queue/                # BullMQ job queues
│   ├── types/                # Shared TypeScript types
│   └── config/               # Centralized configuration
├── e2e/                      # Playwright E2E tests
├── turbo.json                # Turborepo pipeline config
└── playwright.config.ts      # Playwright E2E configuration
```

## Testing

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Run tests for a specific app
npm test --workspace=@shiplens/api

# Run with watch mode
npm run test:watch --workspace=@shiplens/api
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run E2E tests
npm run test:e2e
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Full health check (DB + Redis) |
| GET | `/api/health/live` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe |
| POST | `/api/shipments` | Create a shipment |
| GET | `/api/shipments` | List shipments |
| GET | `/api/shipments/:trackingId` | Get shipment by tracking ID |
| PATCH | `/api/shipments/:trackingId` | Update shipment |
| DELETE | `/api/shipments/:trackingId` | Delete shipment |
| POST | `/api/milestones` | Create milestone |
| GET | `/api/milestones/shipment/:shipmentId` | List milestones for shipment |
| POST | `/api/tenants` | Create tenant |
| GET | `/api/tenants/:tenantId` | Get tenant |
| PATCH | `/api/tenants/:tenantId` | Update tenant |
| GET | `/api/tenants/:tenantId/branding` | Get tenant branding |
| GET | `/api/notifications/shipment/:shipmentId` | List notifications |
| POST | `/api/notifications/rules` | Create notification rule |
| GET | `/api/notifications/rules/:tenantId` | List notification rules |
| POST | `/api/csv-import/upload` | Upload CSV for bulk import |
| GET | `/api/csv-import/status/:jobId` | Check import status |

## Useful Commands

```bash
npm run build          # Build all packages and apps
npm run lint           # Lint all packages
npm run typecheck      # Type-check all packages
npm run db:generate    # Generate Drizzle migrations
npm run db:migrate     # Run Drizzle migrations
```

## License

Proprietary — All rights reserved.
