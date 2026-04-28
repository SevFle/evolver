import { db } from "./index";
import { users, apiKeys, endpoints, events, deliveries } from "./schema";
import type { DeliveryInsert } from "./schema/index";
import { hashPassword } from "@/server/auth/password";
import { generateApiKey } from "@/server/auth/api-keys";
import { generateSigningSecret } from "@/server/services/signing";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const passwordHash = await hashPassword("password123");

  const [user] = await db
    .insert(users)
    .values({
      email: "test@hookrelay.dev",
      passwordHash,
      name: "Test User",
      emailVerifiedAt: new Date(),
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  let userId: string;
  if (user) {
    userId = user.id;
  } else {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, "test@hookrelay.dev"))
      .limit(1);
    if (!existing) throw new Error("Failed to create or find test user");
    userId = existing.id;
    console.log("Test user already exists, skipping user creation.");
  }

  const { raw: rawApiKey, prefix, hash } = await generateApiKey();
  await db
    .insert(apiKeys)
    .values({
      userId,
      name: "Development Key",
      keyHash: hash,
      keyPrefix: prefix,
    })
    .onConflictDoNothing({ target: apiKeys.keyHash });
  console.log(`API Key created: ${rawApiKey}`);

  const secret1 = generateSigningSecret();
  const [ep1] = await db
    .insert(endpoints)
    .values({
      userId,
      url: "https://httpbin.org/post",
      name: "HTTPBin Test Endpoint",
      description: "Test endpoint using httpbin.org",
      signingSecret: secret1,
      customHeaders: { "X-Custom-Header": "hookrelay-test" },
    })
    .returning();
  if (!ep1) throw new Error("Failed to create endpoint 1");

  const secret2 = generateSigningSecret();
  const [ep2] = await db
    .insert(endpoints)
    .values({
      userId,
      url: "https://example.com/webhook",
      name: "Example Webhook",
      description: "Second test endpoint",
      signingSecret: secret2,
    })
    .returning();
  if (!ep2) throw new Error("Failed to create endpoint 2");
  console.log(`Endpoints created: ${ep1.name}, ${ep2.name}`);

  const [evt1] = await db
    .insert(events)
    .values({
      userId,
      endpointId: ep1.id,
      eventType: "payment.created",
      payload: {
        id: "evt_test_123",
        object: "payment",
        amount: 9999,
        currency: "usd",
        status: "succeeded",
      },
      metadata: { source: "stripe", traceId: "trace_abc123" },
    })
    .returning();
  if (!evt1) throw new Error("Failed to create event 1");

  const [evt2] = await db
    .insert(events)
    .values({
      userId,
      endpointId: ep2.id,
      eventType: "order.shipped",
      payload: {
        orderId: "ord_456",
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
      },
    })
    .returning();
  if (!evt2) throw new Error("Failed to create event 2");
  console.log(`Events created: ${evt1.eventType}, ${evt2.eventType}`);

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const fiveMinutesAgo = new Date(now.getTime() - 300_000);
  const tenMinutesAgo = new Date(now.getTime() - 600_000);
  const oneHourAgo = new Date(now.getTime() - 3_600_000);

  const deliveryData: DeliveryInsert[] = [
    {
      eventId: evt1.id,
      endpointId: ep1.id,
      userId,
      status: "success",
      attemptNumber: 1,
      responseStatusCode: 200,
      responseBody: '{"status": "ok"}',
      responseHeaders: { "content-type": "application/json" },
      requestHeaders: {
        "content-type": "application/json",
        "x-hookrelay-event-id": evt1.id,
        "x-hookrelay-signature": "t=1700000000,v1=abc123",
      },
      durationMs: 245,
      completedAt: fiveMinutesAgo,
      createdAt: fiveMinutesAgo,
    },
    {
      eventId: evt2.id,
      endpointId: ep2.id,
      userId,
      status: "failed",
      attemptNumber: 1,
      responseStatusCode: 500,
      responseBody: "Internal Server Error",
      responseHeaders: { "content-type": "text/plain" },
      requestHeaders: {
        "content-type": "application/json",
        "x-hookrelay-event-id": evt2.id,
        "x-hookrelay-signature": "t=1700000000,v1=def456",
      },
      durationMs: 1023,
      nextRetryAt: new Date(now.getTime() + 60_000),
      createdAt: oneMinuteAgo,
    },
    {
      eventId: evt2.id,
      endpointId: ep2.id,
      userId,
      status: "success",
      attemptNumber: 2,
      responseStatusCode: 200,
      responseBody: '{"received": true}',
      responseHeaders: { "content-type": "application/json" },
      requestHeaders: {
        "content-type": "application/json",
        "x-hookrelay-event-id": evt2.id,
        "x-hookrelay-signature": "t=1700000001,v1=ghi789",
      },
      durationMs: 189,
      completedAt: oneMinuteAgo,
      createdAt: oneMinuteAgo,
    },
    {
      eventId: evt1.id,
      endpointId: ep1.id,
      userId,
      status: "pending",
      attemptNumber: 1,
      createdAt: tenMinutesAgo,
    },
    {
      eventId: evt1.id,
      endpointId: ep1.id,
      userId,
      status: "dead_letter",
      attemptNumber: 5,
      responseStatusCode: 502,
      responseBody: "Bad Gateway",
      responseHeaders: {},
      requestHeaders: {
        "content-type": "application/json",
        "x-hookrelay-event-id": evt1.id,
        "x-hookrelay-signature": "t=1700000002,v1=jkl012",
      },
      durationMs: 5000,
      errorMessage: "Connection timeout after 5 retries",
      completedAt: oneHourAgo,
      createdAt: oneHourAgo,
    },
  ];

  await db.insert(deliveries).values(deliveryData);

  console.log("Sample deliveries created with various statuses.");
  console.log("Seed completed successfully!");
  console.log(`\nLogin: test@hookrelay.dev / password123`);
  console.log(`API Key: ${rawApiKey}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
