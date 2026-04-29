import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL;
    if (url) {
      const options: Record<string, unknown> = { maxRetriesPerRequest: 3 };
      if (url.startsWith("rediss://")) {
        options.tls = {};
      }
      redisClient = new Redis(url, options);
    } else {
      redisClient = new Redis({
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: 3,
      });
    }
    redisClient.on("error", (err) => {
      console.error("Redis connection error:", err.message);
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
