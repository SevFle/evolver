import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = NeonHttpDatabase<typeof schema>;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Please set it in your .env file.",
    );
  }
  return url;
}

let _sql: ReturnType<typeof neon> | null = null;
let _db: Database | null = null;

function getSql() {
  if (!_sql) {
    _sql = neon(getDatabaseUrl());
  }
  return _sql;
}

function getDb(): Database {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
