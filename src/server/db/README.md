# HookRelay Database Schema

PostgreSQL schema managed with [Drizzle ORM](https://orm.drizzle.team), targeting Neon serverless PostgreSQL 17.

## Entity Relationship Diagram

```
users ──1:N──> api_keys
users ──1:N──> endpoints
users ──1:N──> events
users ──1:N──> deliveries (denormalized)
endpoints ──1:N──> events
endpoints ──1:N──> deliveries
events ──1:N──> deliveries
teams ──1:N──> users (future RBAC)
```

## Tables

### `users`

Core user accounts. Email + password authentication via NextAuth Credentials provider.

| Column            | Type           | Nullable | Default             | Notes                  |
|-------------------|----------------|----------|---------------------|------------------------|
| id                | uuid           | no       | gen_random_uuid()   | PK                     |
| email             | text           | no       |                     | UNIQUE                 |
| password_hash     | text           | no       |                     | scrypt-derived         |
| name              | text           | yes      |                     |                        |
| email_verified_at | timestamptz    | yes      |                     |                        |
| created_at        | timestamptz    | no       | now()               |                        |
| updated_at        | timestamptz    | no       | now()               |                        |

No soft delete. User deletion cascades to all child records.

### `api_keys`

API keys for programmatic access. Only the SHA-256 hash is stored; the raw key is shown once at creation.

| Column      | Type           | Nullable | Default   | Notes                                    |
|-------------|----------------|----------|-----------|------------------------------------------|
| id          | uuid           | no       | gen_random_uuid() | PK                                |
| user_id     | uuid           | no       |           | FK → users.id CASCADE                    |
| name        | text           | no       |           | User-friendly label                      |
| key_prefix  | text           | no       |           | First 12 chars for display (e.g. `hr_`)  |
| key_hash    | text           | no       |           | SHA-256 hash of full key                 |
| permissions | text[]         | yes      | `{}`      | Future scope (e.g. `events:write`)       |
| last_used_at| timestamptz    | yes      |           |                                          |
| expires_at  | timestamptz    | yes      |           |                                          |
| created_at  | timestamptz    | no       | now()     |                                          |
| updated_at  | timestamptz    | no       | now()     |                                          |
| revoked_at  | timestamptz    | yes      |           | Soft delete (revocation)                 |

**Indexes:**
- `api_keys_active_key_hash_idx` — UNIQUE on `key_hash` WHERE `revoked_at IS NULL` (partial, for fast auth lookup)
- `api_keys_user_id_idx` — on `user_id` (listing keys)
- `api_keys_key_prefix_idx` — on `key_prefix` (dashboard display)

### `endpoints`

Webhook destination endpoints with circuit breaker tracking.

| Column               | Type           | Nullable | Default                        | Notes                          |
|----------------------|----------------|----------|--------------------------------|--------------------------------|
| id                   | uuid           | no       | gen_random_uuid()              | PK                             |
| user_id              | uuid           | no       |                                | FK → users.id CASCADE          |
| url                  | text           | no       |                                | Destination URL                |
| name                 | text           | no       |                                | User-friendly label            |
| description          | text           | yes      |                                |                                |
| signing_secret       | text           | no       |                                | HMAC-SHA256 signing secret     |
| status               | endpoint_status| no       | `'active'`                     | active, degraded, disabled     |
| custom_headers       | jsonb          | yes      | `'{}'::jsonb`                  | Headers included in deliveries |
| is_active            | boolean        | no       | `true`                         |                                |
| disabled_reason      | text           | yes      |                                | e.g. `circuit_breaker_triggered` |
| consecutive_failures | integer        | no       | `0`                            | Circuit breaker counter        |
| max_retries          | integer        | no       | `5`                            |                                |
| retry_schedule       | jsonb          | yes      | `[60,300,1800,7200,43200]`     | Retry delays in seconds        |
| rate_limit           | integer        | yes      |                                | Requests per minute            |
| deleted_at           | timestamptz    | yes      |                                | Soft delete                    |
| created_at           | timestamptz    | no       | now()                          |                                |
| updated_at           | timestamptz    | no       | now()                          |                                |

**Indexes:**
- `endpoints_active_idx` — on `(user_id, is_active)` WHERE `deleted_at IS NULL` (partial, active endpoint lookup)
- `endpoints_user_id_idx` — on `user_id` (endpoint listing)

### `events`

Immutable webhook events. Append-only — no `updated_at`, no soft delete.

| Column           | Type           | Nullable | Default             | Notes                       |
|------------------|----------------|----------|---------------------|-----------------------------|
| id               | uuid           | no       | gen_random_uuid()   | PK                          |
| user_id          | uuid           | no       |                     | FK → users.id CASCADE       |
| endpoint_id      | uuid           | no       |                     | FK → endpoints.id CASCADE   |
| event_type       | text           | no       |                     | e.g. `payment.created`      |
| payload          | jsonb          | no       |                     | Full webhook payload        |
| metadata         | jsonb          | yes      | `'{}'::jsonb`       | Tags, trace IDs             |
| source           | text           | yes      |                     | Originating system          |
| idempotency_key  | text           | yes      |                     | Deduplication               |
| status           | event_status   | no       | `'queued'`          | queued, delivering, delivered, failed |
| created_at       | timestamptz    | no       | now()               |                             |

**Indexes:**
- `events_user_created_at_idx` — on `(user_id, created_at)` (dashboard pagination)
- `events_user_event_type_idx` — on `(user_id, event_type)` (filter by type)
- `events_idempotency_key_idx` — UNIQUE on `idempotency_key` WHERE `idempotency_key IS NOT NULL` (dedup)
- `events_endpoint_id_idx` — on `endpoint_id`

### `deliveries`

Individual delivery attempts to endpoints. The most-queried table for the dashboard.

| Column              | Type            | Nullable | Default             | Notes                              |
|---------------------|-----------------|----------|---------------------|------------------------------------|
| id                  | uuid            | no       | gen_random_uuid()   | PK                                 |
| event_id            | uuid            | no       |                     | FK → events.id CASCADE             |
| endpoint_id         | uuid            | no       |                     | FK → endpoints.id CASCADE          |
| user_id             | uuid            | no       |                     | FK → users.id CASCADE (denormalized) |
| status              | delivery_status | no       | `'pending'`         | pending, processing, success, failed, retry_scheduled, circuit_open, dead_letter |
| attempt_number      | integer         | no       | `1`                 |                                    |
| max_attempts        | integer         | no       | `5`                 |                                    |
| next_retry_at       | timestamptz     | yes      |                     | When next retry fires              |
| request_headers     | jsonb           | yes      |                     | Headers sent (incl. HMAC signature)|
| response_status_code| integer         | yes      |                     | HTTP status received               |
| response_headers    | jsonb           | yes      |                     |                                    |
| response_body       | text            | yes      |                     | Truncated to 10KB                  |
| error_message       | text            | yes      |                     | Network errors, timeouts           |
| duration_ms         | integer         | yes      |                     | Round-trip time                    |
| created_at          | timestamptz     | no       | now()               |                                    |
| updated_at          | timestamptz     | no       | now()               |                                    |
| completed_at        | timestamptz     | yes      |                     | When terminal state reached        |

**Indexes:**
- `deliveries_user_created_at_idx` — on `(user_id, created_at)` (dashboard delivery log)
- `deliveries_user_status_idx` — on `(user_id, status)` (status filtering)
- `deliveries_endpoint_status_created_idx` — on `(endpoint_id, status, created_at)` (per-endpoint analytics)
- `deliveries_retry_queue_idx` — on `(next_retry_at)` WHERE `status = 'retry_scheduled'` (worker queue polling)
- `deliveries_event_id_idx` — on `event_id` (event detail view)

### `teams`

Team organizations for future RBAC support.

| Column     | Type        | Nullable | Default           | Notes    |
|------------|-------------|----------|-------------------|----------|
| id         | uuid        | no       | gen_random_uuid() | PK       |
| name       | text        | no       |                   |          |
| slug       | text        | no       |                   | UNIQUE   |
| created_at | timestamptz | no       | now()             |          |
| updated_at | timestamptz | no       | now()             |          |

## Design Decisions

### Denormalized `user_id` in `deliveries`

`deliveries.user_id` is denormalized from the event→user relationship to avoid JOINs on the most common dashboard query: "show recent deliveries for user X." The CASCADE from `users` handles cleanup.

### Soft deletes

- **endpoints**: `deleted_at` — endpoints can be soft-deleted, filtered with `WHERE deleted_at IS NULL`
- **api_keys**: `revoked_at` — keys are revoked, not deleted, filtered with `WHERE revoked_at IS NULL`
- **events, deliveries**: No soft delete. Events are immutable/append-only.

### JSONB columns

- `events.payload` — full webhook payload, GIN-indexable for future search
- `events.metadata` — tags, trace IDs, source identifiers
- `endpoints.custom_headers` — HTTP headers to include in deliveries
- `endpoints.retry_schedule` — configurable retry delay array `[60, 300, 1800, 7200, 43200]` seconds
- `deliveries.request_headers` / `deliveries.response_headers` — delivery HTTP metadata

### Enum types

- `delivery_status` — 7 states covering the full delivery lifecycle including circuit breaker and dead letter
- `event_status` — 4 states for event-level aggregation
- `endpoint_status` — 3 states for health tracking (active → degraded → disabled)
- `user_role` — future RBAC (owner, admin, member)

## Common Query Patterns

### Dashboard: Recent deliveries for a user

```sql
SELECT d.*, e.event_type, ep.name as endpoint_name
FROM deliveries d
JOIN events e ON d.event_id = e.id
JOIN endpoints ep ON d.endpoint_id = ep.id
WHERE d.user_id = $1
ORDER BY d.created_at DESC
LIMIT 50;
```

Covered by `deliveries_user_created_at_idx`.

### Worker: Poll for retry-ready deliveries

```sql
SELECT * FROM deliveries
WHERE status = 'retry_scheduled' AND next_retry_at <= now()
ORDER BY next_retry_at ASC
LIMIT 100;
```

Covered by `deliveries_retry_queue_idx` partial index.

### API key authentication lookup

```sql
SELECT * FROM api_keys
WHERE key_hash = $1 AND revoked_at IS NULL;
```

Covered by `api_keys_active_key_hash_idx` partial unique index.

### Event deduplication

```sql
INSERT INTO events (..., idempotency_key)
VALUES (..., $1)
ON CONFLICT DO NOTHING;
```

Covered by `events_idempotency_key_idx` partial unique index.

## Running Migrations

```bash
# Generate a new migration after schema changes
pnpm db:generate

# Apply migrations to database
pnpm db:push

# Run migrations programmatically
pnpm db:migrate

# Seed development data
pnpm db:seed

# Visual schema browser
pnpm db:studio
```

## Environment Variables

| Variable                  | Purpose                                  |
|---------------------------|------------------------------------------|
| `DATABASE_URL`            | Pooled connection for runtime queries    |
| `DATABASE_URL_NON_POOLING`| Direct connection for migrations         |

Both are Neon PostgreSQL connection strings with `?sslmode=require`.
