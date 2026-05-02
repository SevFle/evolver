import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
          environment: "node",
        },
        resolve: {
          alias: {
            "@shiplens/config": new URL("../../packages/config/src", import.meta.url).pathname,
            "@shiplens/db": new URL("../../packages/db/src", import.meta.url).pathname,
            "@shiplens/queue": new URL("../../packages/queue/src", import.meta.url).pathname,
            "@shiplens/types": new URL("../../packages/types/src", import.meta.url).pathname,
          },
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          timeout: 30000,
        },
        resolve: {
          alias: {
            "@shiplens/config": new URL("../../packages/config/src", import.meta.url).pathname,
            "@shiplens/db": new URL("../../packages/db/src", import.meta.url).pathname,
            "@shiplens/queue": new URL("../../packages/queue/src", import.meta.url).pathname,
            "@shiplens/types": new URL("../../packages/types/src", import.meta.url).pathname,
          },
        },
      },
    ],
  },
});
