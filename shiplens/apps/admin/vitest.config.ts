import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          environment: "node",
        },
        resolve: {
          alias: {
            "@shiplens/types": new URL("../../packages/types/src", import.meta.url).pathname,
            "@shiplens/config": new URL("../../packages/config/src", import.meta.url).pathname,
          },
        },
      },
    ],
  },
});
