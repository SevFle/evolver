import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import postgres from "postgres";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Database = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Please set it in your .env file.",
    );
  }
  return url;
}

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    const url = getDatabaseUrl();
    if (url.includes("neon.tech")) {
      _db = drizzleNeon(neon(url), { schema });
    } else {
      _db = drizzlePostgres(postgres(url), { schema });
    }
  }
  return _db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
