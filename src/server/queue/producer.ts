import { Queue } from "bullmq";
import { DELIVERY_QUEUE, type DeliveryJobData } from "./queues";

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

let deliveryQueue: Queue<DeliveryJobData> | null = null;

export function getDeliveryQueue(): Queue<DeliveryJobData> {
  if (!deliveryQueue) {
    deliveryQueue = new Queue<DeliveryJobData>(DELIVERY_QUEUE, {
      connection: getRedisConnection(),
    });
  }
  return deliveryQueue;
}

export async function enqueueDelivery(
  data: DeliveryJobData,
  delay?: number,
): Promise<string> {
  const queue = getDeliveryQueue();
  const job = await queue.add(
    `deliver-${data.eventId}-attempt-${data.attemptNumber}`,
    data,
    {
      attempts: 1,
      delay: delay ?? 0,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );
  return job.id ?? "";
}
