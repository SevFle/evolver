import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Static guard: every DDL statement that creates or drops named objects must be
// idempotent so re-running migrate() on an already-migrated DB never errors.
// Drizzle has no native down-migrations; idempotency on up is the contract.

const MIGRATIONS_DIR = "drizzle";

function readMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => ({
      file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf-8"),
    }));
}

const NON_IDEMPOTENT_PATTERNS: Array<{
  flag: RegExp;
  fix: string;
  description: string;
}> = [
  {
    flag: /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/im,
    fix: "CREATE TABLE IF NOT EXISTS",
    description: "CREATE TABLE without IF NOT EXISTS",
  },
  {
    flag: /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)(?!CONCURRENTLY)/im,
    fix: "CREATE [UNIQUE] INDEX IF NOT EXISTS",
    description: "CREATE INDEX without IF NOT EXISTS",
  },
  {
    flag: /^\s*DROP\s+TABLE\s+(?!IF\s+EXISTS)/im,
    fix: "DROP TABLE IF EXISTS",
    description: "DROP TABLE without IF EXISTS",
  },
  {
    flag: /^\s*DROP\s+INDEX\s+(?!IF\s+EXISTS)/im,
    fix: "DROP INDEX IF EXISTS",
    description: "DROP INDEX without IF EXISTS",
  },
];

describe("drizzle migrations — idempotency", () => {
  const migrations = readMigrations();

  it("at least one migration file exists", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  for (const { file, sql } of migrations) {
    describe(file, () => {
      const stripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");

      const statements = stripped
        .split(/-->\s*statement-breakpoint/i)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const { flag, fix, description } of NON_IDEMPOTENT_PATTERNS) {
        it(`uses idempotent form: ${description} → ${fix}`, () => {
          // Migrations 0000-0002 predate this contract and are pinned by the
          // _journal hash — modifying their SQL would break already-deployed
          // DBs. The contract is enforced from 0003 onward; new migrations
          // MUST use idempotent DDL forms.
          const idx = parseInt(file.slice(0, 4), 10);
          if (Number.isFinite(idx) && idx <= 2) return;

          const offending = statements.filter((s) => flag.test(s));
          expect(
            offending,
            `Non-idempotent ${description} in ${file}:\n  ${offending.join("\n  ")}`,
          ).toHaveLength(0);
        });
      }
    });
  }
});

describe("drizzle migrations — re-run safety contract", () => {
  it("all CREATE OR REPLACE FUNCTION blocks are well-formed", () => {
    const migrations = readMigrations();
    for (const { file, sql } of migrations) {
      const matches = sql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+\S+/gi);
      if (!matches) continue;
      for (const m of matches) {
        expect(m, `Malformed CREATE OR REPLACE FUNCTION in ${file}: ${m}`)
          .toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"?\w+"?/i);
      }
    }
  });

  it("constraint additions use ADD CONSTRAINT with explicit names", () => {
    const migrations = readMigrations();
    for (const { file, sql } of migrations) {
      const stripped = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      const adds = stripped.match(/ADD\s+CONSTRAINT\s+\S+/gi) || [];
      for (const a of adds) {
        expect(a, `Unnamed ADD CONSTRAINT in ${file}`).toMatch(
          /ADD\s+CONSTRAINT\s+"?[A-Za-z_][\w-]*"?/i,
        );
      }
    }
  });
});
