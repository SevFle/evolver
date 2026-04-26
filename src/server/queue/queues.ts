export const DELIVERY_QUEUE = "hookrelay:deliveries" as const;
export const DEAD_LETTER_QUEUE = "hookrelay:dead-letter" as const;

export interface DeliveryJobData {
  eventId: string;
  endpointId: string;
  attemptNumber: number;
}
