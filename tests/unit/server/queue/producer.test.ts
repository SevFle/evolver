import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const MockQueue = vi.fn().mockReturnValue({ add: mockAdd });

vi.mock("bullmq", () => ({
  Queue: MockQueue,
}));

import {
  getDeliveryQueue,
  getDeadLetterQueue,
  enqueueDelivery,
  enqueueDeadLetter,
} from "@/server/queue/producer";

describe("queue producer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockQueue.mockClear();
    mockAdd.mockClear();
  });

  describe("getDeliveryQueue", () => {
    it("creates a Queue with the delivery queue name", () => {
      getDeliveryQueue();
      expect(MockQueue).toHaveBeenCalledWith(
        "hookrelay:deliveries",
        expect.objectContaining({
          connection: expect.any(Object),
        }),
      );
    });

    it("returns the same instance on subsequent calls (singleton)", () => {
      const q1 = getDeliveryQueue();
      const q2 = getDeliveryQueue();
      expect(q1).toBe(q2);
      expect(MockQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDeadLetterQueue", () => {
    it("creates a Queue with the dead letter queue name", () => {
      getDeadLetterQueue();
      expect(MockQueue).toHaveBeenCalledWith(
        "hookrelay:dead-letter",
        expect.objectContaining({
          connection: expect.any(Object),
        }),
      );
    });

    it("returns the same instance on subsequent calls (singleton)", () => {
      const q1 = getDeadLetterQueue();
      const q2 = getDeadLetterQueue();
      expect(q1).toBe(q2);
    });
  });

  describe("enqueueDelivery", () => {
    it("adds a job with the correct job name format", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockAdd).toHaveBeenCalledWith(
        "deliver-evt-001-attempt-1",
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("passes the correct job data", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      const data = {
        eventId: "evt-abc",
        endpointId: "ep-xyz",
        attemptNumber: 3,
      };

      await enqueueDelivery(data);

      const callArgs = mockAdd.mock.calls[0];
      expect(callArgs?.[1]).toEqual(data);
    });

    it("sets jobId with eventId, endpointId, and attemptNumber", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery({
        eventId: "evt-123",
        endpointId: "ep-456",
        attemptNumber: 2,
      });

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.jobId).toBe("deliver-evt-123-ep-456-attempt-2");
    });

    it("sets attempts to 1 (BullMQ does not retry internally)", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.attempts).toBe(1);
    });

    it("applies delay when provided", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 2 },
        30_000,
      );

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.delay).toBe(30_000);
    });

    it("defaults delay to 0 when not provided", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.delay).toBe(0);
    });

    it("sets removeOnComplete and removeOnFail", async () => {
      mockAdd.mockResolvedValue({ id: "job-001" });

      await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.removeOnComplete).toEqual({ count: 1000 });
      expect(opts.removeOnFail).toEqual({ count: 5000 });
    });

    it("returns the job id", async () => {
      mockAdd.mockResolvedValue({ id: "job-abc-123" });

      const jobId = await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(jobId).toBe("job-abc-123");
    });

    it("returns empty string when job id is null", async () => {
      mockAdd.mockResolvedValue({ id: null });

      const jobId = await enqueueDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(jobId).toBe("");
    });
  });

  describe("enqueueDeadLetter", () => {
    it("adds a job to the dead letter queue", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-001" });

      await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "Max retries exhausted",
      );

      expect(mockAdd).toHaveBeenCalledTimes(1);
    });

    it("uses correct job name format", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-001" });

      await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "Max retries exhausted",
      );

      const callArgs = mockAdd.mock.calls[0];
      expect(callArgs?.[0]).toBe("dead-evt-001-attempt-5");
    });

    it("passes the job data as a copy", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-001" });

      const data = { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 };
      await enqueueDeadLetter(data, "Max retries exhausted");

      const callArgs = mockAdd.mock.calls[0];
      expect(callArgs?.[1]).toEqual(data);
    });

    it("sets attempts to 1", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-001" });

      await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "reason",
      );

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.attempts).toBe(1);
    });

    it("sets removeOnComplete and removeOnFail for dead letter", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-001" });

      await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "reason",
      );

      const opts = mockAdd.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(opts.removeOnComplete).toEqual({ count: 5000 });
      expect(opts.removeOnFail).toEqual({ count: 10000 });
    });

    it("returns the job id", async () => {
      mockAdd.mockResolvedValue({ id: "dlq-xyz-789" });

      const jobId = await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "reason",
      );

      expect(jobId).toBe("dlq-xyz-789");
    });

    it("returns empty string when job id is null", async () => {
      mockAdd.mockResolvedValue({ id: null });

      const jobId = await enqueueDeadLetter(
        { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
        "reason",
      );

      expect(jobId).toBe("");
    });
  });
});
