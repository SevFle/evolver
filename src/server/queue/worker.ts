import { Worker } from "bullmq";
import type { DeliveryJobData } from "./queues";
import { DELIVERY_QUEUE } from "./queues";
import { handleDelivery } from "./handlers";

function getRedisConnection() {
  return {
    host: process.env.REDIS_URL
      ? new URL(process.env.REDIS_URL).hostname
      : "localhost",
    port: process.env.REDIS_URL
      ? Number(new URL(process.env.REDIS_URL).port)
      : 6379,
    password: process.env.REDIS_URL
      ? new URL(process.env.REDIS_URL).password
      : undefined,
  };
}

export function startWorker(): Worker<DeliveryJobData> {
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 10);

  const worker = new Worker<DeliveryJobData>(
    DELIVERY_QUEUE,
    async (job) => {
      console.log(
        `Processing job ${job.id}: event=${job.data.eventId} endpoint=${job.data.endpointId} attempt=${job.data.attemptNumber}`,
      );
      await handleDelivery(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    console.log(
      `Job ${job.id} completed: event=${job.data.eventId} endpoint=${job.data.endpointId}`,
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `Job ${job?.id} failed: event=${job?.data?.eventId} endpoint=${job?.data?.endpointId} error=${err.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down worker gracefully...`);
    try {
      await worker.close();
      console.log("Worker shut down successfully");
      process.exit(0);
    } catch (err) {
      console.error("Error during worker shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log(
    `Worker started, listening on "${DELIVERY_QUEUE}" queue (concurrency: ${concurrency})`,
  );

  return worker;
}

try {
  startWorker();
} catch (err) {
  console.error("Failed to start worker:", err);
  process.exit(1);
}
