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
      await handleDelivery(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  console.log(
    `Worker started, listening on "${DELIVERY_QUEUE}" queue (concurrency: ${concurrency})`,
  );

  return worker;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
