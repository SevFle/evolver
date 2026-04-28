import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

async function main() {
  const url = process.env.DATABASE_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL_NON_POOLING environment variable is not set.",
    );
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  console.log("Running migrations...");

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Migrations completed successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
