import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn().mockReturnThis();
const MockWorker = vi.fn().mockReturnValue({
  on: mockWorkerOn,
  close: mockClose,
});

vi.mock("bullmq", () => ({
  Worker: MockWorker,
}));

describe("worker", () => {
  beforeEach(() => {
    MockWorker.mockClear();
    mockWorkerOn.mockClear();
    mockClose.mockClear();
  });

  it("calls startWorker on module load", async () => {
    vi.resetModules();
    const { startWorker } = await import("@/server/queue/worker");
    expect(MockWorker).toHaveBeenCalled();
    expect(typeof startWorker).toBe("function");
  });

  it("startWorker creates a Worker with correct queue name", async () => {
    const { startWorker } = await import("@/server/queue/worker");
    MockWorker.mockClear();
    mockWorkerOn.mockClear();

    startWorker();

    expect(MockWorker).toHaveBeenCalledTimes(1);
    const callArgs = MockWorker.mock.calls[0];
    const queueName = callArgs?.[0];
    expect(queueName).toBe("hookrelay:deliveries");
  });

  it("startWorker registers event handlers", async () => {
    const { startWorker } = await import("@/server/queue/worker");
    MockWorker.mockClear();
    mockWorkerOn.mockClear();

    startWorker();

    const onCalls = mockWorkerOn.mock.calls.map((c) => c[0]);
    expect(onCalls).toContain("completed");
    expect(onCalls).toContain("failed");
    expect(onCalls).toContain("error");
  });

  describe("startup error handling", () => {
    it("catches and logs startup errors then exits", async () => {
      MockWorker.mockImplementation(() => {
        throw new Error("Redis connection failed");
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      vi.resetModules();
      await import("@/server/queue/worker");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to start worker:",
        expect.any(Error),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      MockWorker.mockReturnValue({ on: mockWorkerOn, close: mockClose });
    });
  });

  describe("graceful shutdown", () => {
    it("closes worker and exits with 0 on SIGTERM", async () => {
      const processOnSpy = vi.spyOn(process, "on");
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { startWorker } = await import("@/server/queue/worker");
      startWorker();

      const sigtermCall = processOnSpy.mock.calls.find(
        (c) => c[0] === "SIGTERM",
      );
      expect(sigtermCall).toBeDefined();
      await (sigtermCall![1] as () => Promise<void>)();

      expect(mockClose).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);

      processOnSpy.mockRestore();
      processExitSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it("closes worker and exits with 0 on SIGINT", async () => {
      const processOnSpy = vi.spyOn(process, "on");
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { startWorker } = await import("@/server/queue/worker");
      startWorker();

      const sigintCall = processOnSpy.mock.calls.find(
        (c) => c[0] === "SIGINT",
      );
      expect(sigintCall).toBeDefined();
      await (sigintCall![1] as () => Promise<void>)();

      expect(mockClose).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);

      processOnSpy.mockRestore();
      processExitSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it("exits with code 1 if worker.close() fails during shutdown", async () => {
      mockClose.mockRejectedValue(new Error("close failed"));

      const processOnSpy = vi.spyOn(process, "on");
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { startWorker } = await import("@/server/queue/worker");
      startWorker();

      const sigtermCall = processOnSpy.mock.calls.find(
        (c) => c[0] === "SIGTERM",
      );
      await (sigtermCall![1] as () => Promise<void>)();

      expect(mockClose).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error during worker shutdown:",
        expect.any(Error),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);

      processOnSpy.mockRestore();
      processExitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      mockClose.mockResolvedValue(undefined);
    });
  });
});
