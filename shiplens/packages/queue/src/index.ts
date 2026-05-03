import { Queue, Worker, type Processor } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const shipmentQueue = new Queue("shipments", { connection });
export const milestoneQueue = new Queue("milestones", { connection });
export const notificationQueue = new Queue("notifications", { connection });

export type JobType = "shipment.created" | "milestone.reached" | "notification.dispatch";

export interface ShipmentJobData {
  type: "shipment.created";
  shipmentId: string;
  tenantId: string;
}

export interface MilestoneJobData {
  type: "milestone.reached";
  shipmentId: string;
  milestoneId: string;
  status: string;
}

export interface NotificationJobData {
  type: "notification.dispatch";
  shipmentId: string;
  tenantId: string;
  channel: "email" | "sms";
  recipient: string;
  subject?: string;
  body: string;
}

export type JobData = ShipmentJobData | MilestoneJobData | NotificationJobData;

export function createWorker(queueName: string, processor: Processor<JobData>): Worker<JobData> {
  return new Worker<JobData>(queueName, processor, { connection });
}

export { connection };
