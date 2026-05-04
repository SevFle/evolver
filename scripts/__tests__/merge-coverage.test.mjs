import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

const mockApiSummary = {
  total: {
    lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
    statements: { total: 10, covered: 8, skipped: 0, pct: 80 },
    functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
    branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
  },
  "/tmp/test-workspace/apps/api/src/server.ts": {
    lines: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
    statements: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
    functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
    branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
  },
  "/tmp/test-workspace/apps/api/src/routes/health.ts": {
    lines: { total: 4, covered: 4, skipped: 0, pct: 100 },
    statements: { total: 4, covered: 4, skipped: 0, pct: 100 },
    functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
    branches: { total: 2, covered: 2, skipped: 0, pct: 100 },
  },
};

const mockSharedSummary = {
  total: {
    lines: { total: 5, covered: 5, skipped: 0, pct: 100 },
    statements: { total: 5, covered: 5, skipped: 0, pct: 100 },
    functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
    branches: { total: 1, covered: 1, skipped: 0, pct: 100 },
  },
  "/tmp/test-workspace/packages/shared/src/utils.ts": {
    lines: { total: 5, covered: 5, skipped: 0, pct: 100 },
    statements: { total: 5, covered: 5, skipped: 0, pct: 100 },
    functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
    branches: { total: 1, covered: 1, skipped: 0, pct: 100 },
  },
};

let tempRoot;
let scriptPath;

before(function () {
  tempRoot = mkdtempSync(join(tmpdir(), "merge-cov-test-"));
  scriptPath = join(process.cwd(), "scripts", "merge-coverage.mjs");

  mkdirSync(join(tempRoot, "apps", "api", "coverage"), { recursive: true });
  mkdirSync(join(tempRoot, "packages", "shared", "coverage"), { recursive: true });

  writeFileSync(
    join(tempRoot, "apps", "api", "coverage", "coverage-summary.json"),
    JSON.stringify(mockApiSummary)
  );
  writeFileSync(
    join(tempRoot, "packages", "shared", "coverage", "coverage-summary.json"),
    JSON.stringify(mockSharedSummary)
  );
});

after(function () {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("merge-coverage.mjs", () => {
  it("produces a coverage-summary.json with correct relative file paths", () => {
    execSync(`node ${scriptPath}`, { cwd: tempRoot });

    const output = JSON.parse(
      readFileSync(join(tempRoot, "coverage", "coverage-summary.json"), "utf8")
    );

    const keys = Object.keys(output).filter((k) => k !== "total");

    assert.ok(keys.includes("apps/api/src/server.ts"), `Expected apps/api/src/server.ts in keys, got: ${keys.join(", ")}`);
    assert.ok(keys.includes("apps/api/src/routes/health.ts"), `Expected apps/api/src/routes/health.ts in keys`);
    assert.ok(keys.includes("packages/shared/src/utils.ts"), `Expected packages/shared/src/utils.ts in keys`);
  });

  it("computes correct total coverage numbers", () => {
    execSync(`node ${scriptPath}`, { cwd: tempRoot });

    const output = JSON.parse(
      readFileSync(join(tempRoot, "coverage", "coverage-summary.json"), "utf8")
    );

    const total = output.total;
    assert.equal(total.lines.total, 15);
    assert.equal(total.lines.covered, 13);
    assert.equal(total.functions.total, 3);
    assert.equal(total.functions.covered, 3);
    assert.equal(total.branches.total, 5);
    assert.equal(total.branches.covered, 4);
  });

  it("outputs a non-zero coverage percentage", () => {
    const stdout = execSync(`node ${scriptPath}`, {
      cwd: tempRoot,
      encoding: "utf8",
    });

    const match = stdout.match(/Coverage: (\d+\.?\d*)% lines/);
    assert.ok(match, "Expected coverage percentage in output");
    const pct = parseFloat(match[1]);
    assert.ok(pct > 0, `Expected non-zero coverage, got ${pct}%`);
  });

  it("handles workspaces with missing coverage-summary.json gracefully", () => {
    mkdirSync(join(tempRoot, "apps", "admin", "coverage"), { recursive: true });

    execSync(`node ${scriptPath}`, { cwd: tempRoot });

    const output = JSON.parse(
      readFileSync(join(tempRoot, "coverage", "coverage-summary.json"), "utf8")
    );

    const keys = Object.keys(output).filter((k) => k !== "total");
    assert.ok(keys.length > 0, "Should still produce output from existing workspaces");
  });
});
