import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_NON_POOLING!;
const isNeon = url?.includes("neon.tech");

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(isNeon ? { driver: "neon-http" as const } : {}),
  dbCredentials: { url },
});
