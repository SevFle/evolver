import { Queue } from "bullmq";
import { DELIVERY_QUEUE, DEAD_LETTER_QUEUE, type DeliveryJobData } from "./queues";

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
let deadLetterQueue: Queue<DeliveryJobData> | null = null;

export function getDeliveryQueue(): Queue<DeliveryJobData> {
  if (!deliveryQueue) {
    deliveryQueue = new Queue<DeliveryJobData>(DELIVERY_QUEUE, {
      connection: getRedisConnection(),
    });
  }
  return deliveryQueue;
}

export function getDeadLetterQueue(): Queue<DeliveryJobData> {
  if (!deadLetterQueue) {
    deadLetterQueue = new Queue<DeliveryJobData>(DEAD_LETTER_QUEUE, {
      connection: getRedisConnection(),
    });
  }
  return deadLetterQueue;
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
      jobId: `deliver-${data.eventId}-${data.endpointId}-attempt-${data.attemptNumber}`,
      attempts: 1,
      delay: delay ?? 0,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );
  return job.id ?? "";
}

export async function enqueueDeadLetter(
  data: DeliveryJobData,
  reason: string,
): Promise<string> {
  const queue = getDeadLetterQueue();
  const job = await queue.add(
    `dead-${data.eventId}-attempt-${data.attemptNumber}`,
    { ...data },
    {
      attempts: 1,
      removeOnComplete: { count: 5000 },
      removeOnFail: { count: 10000 },
    },
  );
  console.warn(
    `Moved to dead-letter queue: event=${data.eventId} endpoint=${data.endpointId} reason=${reason} job=${job.id}`,
  );
  return job.id ?? "";
}
