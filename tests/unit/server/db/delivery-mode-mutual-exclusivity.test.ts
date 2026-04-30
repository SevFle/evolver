import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const migration = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");
const subsSource = readFileSync(
  "src/server/db/schema/endpoint-subscriptions.ts",
  "utf-8",
);
const eventsSource = readFileSync("src/server/db/schema/events.ts", "utf-8");

function extractCheckSql(migrationText: string, constraintName: string): string {
  const start = migrationText.indexOf(constraintName);
  const end = migrationText.indexOf(";", start);
  return migrationText.slice(start, end);
}

function evaluateCaseExpression(
  checkSql: string,
  mode: string,
  hasEndpointId: boolean,
  hasEndpointGroupId: boolean,
): boolean {
  const directMatch = checkSql.match(
    /WHEN\s+delivery_mode\s*=\s*'direct'\s+THEN\s+(.*?)(?=\s*WHEN|\s*ELSE)/s,
  );
  const groupMatch = checkSql.match(
    /WHEN\s+delivery_mode\s*=\s*'group'\s+THEN\s+(.*?)(?=\s*WHEN|\s*ELSE)/s,
  );
  const fanoutMatch = checkSql.match(
    /WHEN\s+delivery_mode\s*=\s*'fanout'\s+THEN\s+(.*?)(?=\s*WHEN|\s*ELSE|\s*END)/s,
  );

  if (mode === "direct") {
    const expr = directMatch?.[1]?.trim() ?? "";
    const requiresEndpointId = expr.includes("endpoint_id IS NOT NULL");
    const requiresGroupIdNull = expr.includes("endpoint_group_id IS NULL");
    if (requiresEndpointId && requiresGroupIdNull) {
      return hasEndpointId && !hasEndpointGroupId;
    }
    if (requiresEndpointId) {
      return hasEndpointId;
    }
    return false;
  }
  if (mode === "group") {
    const expr = groupMatch?.[1]?.trim() ?? "";
    const requiresGroupId = expr.includes("endpoint_group_id IS NOT NULL");
    const requiresEndpointIdNull = expr.includes("endpoint_id IS NULL");
    if (requiresGroupId && requiresEndpointIdNull) {
      return hasEndpointGroupId && !hasEndpointId;
    }
    if (requiresGroupId) {
      return hasEndpointGroupId;
    }
    return false;
  }
  if (mode === "fanout") {
    const expr = fanoutMatch?.[1]?.trim() ?? "";
    return !hasEndpointId && !hasEndpointGroupId;
  }
  return false;
}

describe("mutual exclusivity — endpoint_subscriptions migration CHECK", () => {
  const checkSql = extractCheckSql(
    migration,
    "endpoint_subscriptions_delivery_mode_check",
  );

  it("rejects direct mode with both endpoint_id AND endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "direct", true, true)).toBe(false);
  });

  it("accepts direct mode with only endpoint_id set", () => {
    expect(evaluateCaseExpression(checkSql, "direct", true, false)).toBe(true);
  });

  it("rejects direct mode with endpoint_id null", () => {
    expect(evaluateCaseExpression(checkSql, "direct", false, false)).toBe(false);
  });

  it("rejects group mode with both endpoint_id AND endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "group", true, true)).toBe(false);
  });

  it("accepts group mode with only endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "group", false, true)).toBe(true);
  });

  it("rejects group mode with endpoint_group_id null", () => {
    expect(evaluateCaseExpression(checkSql, "group", false, false)).toBe(false);
  });

  it("rejects fanout mode with endpoint_id set", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", true, false)).toBe(false);
  });

  it("rejects fanout mode with endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", false, true)).toBe(false);
  });

  it("accepts fanout mode with both null", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", false, false)).toBe(true);
  });

  it("rejects unknown delivery_mode", () => {
    expect(evaluateCaseExpression(checkSql, "unknown", true, false)).toBe(false);
  });
});

describe("mutual exclusivity — events migration CHECK", () => {
  const checkSql = extractCheckSql(migration, "events_delivery_mode_check");

  it("rejects direct mode with both endpoint_id AND endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "direct", true, true)).toBe(false);
  });

  it("accepts direct mode with only endpoint_id set", () => {
    expect(evaluateCaseExpression(checkSql, "direct", true, false)).toBe(true);
  });

  it("rejects direct mode with endpoint_id null", () => {
    expect(evaluateCaseExpression(checkSql, "direct", false, false)).toBe(false);
  });

  it("rejects group mode with both endpoint_id AND endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "group", true, true)).toBe(false);
  });

  it("accepts group mode with only endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "group", false, true)).toBe(true);
  });

  it("rejects group mode with endpoint_group_id null", () => {
    expect(evaluateCaseExpression(checkSql, "group", false, false)).toBe(false);
  });

  it("rejects fanout mode with endpoint_id set", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", true, false)).toBe(false);
  });

  it("rejects fanout mode with endpoint_group_id set", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", false, true)).toBe(false);
  });

  it("accepts fanout mode with both null", () => {
    expect(evaluateCaseExpression(checkSql, "fanout", false, false)).toBe(true);
  });

  it("rejects unknown delivery_mode", () => {
    expect(evaluateCaseExpression(checkSql, "unknown", true, false)).toBe(false);
  });
});

describe("mutual exclusivity — Drizzle schema source defines check()", () => {
  it("endpoint-subscriptions.ts includes check() with mutual exclusivity for direct mode", () => {
    expect(subsSource).toContain("endpoint_subscriptions_delivery_mode_check");
    expect(subsSource).toContain("check(");
    const directCase = subsSource.match(
      /WHEN\s+\$\{table\.deliveryMode\}\s*=\s*'direct'\s+THEN\s+\$\{table\.endpointId\}\s*IS NOT NULL\s+AND\s+\$\{table\.endpointGroupId\}\s*IS NULL/s,
    );
    expect(directCase).not.toBeNull();
  });

  it("endpoint-subscriptions.ts includes check() with mutual exclusivity for group mode", () => {
    const groupCase = subsSource.match(
      /WHEN\s+\$\{table\.deliveryMode\}\s*=\s*'group'\s+THEN\s+\$\{table\.endpointGroupId\}\s*IS NOT NULL\s+AND\s+\$\{table\.endpointId\}\s*IS NULL/s,
    );
    expect(groupCase).not.toBeNull();
  });

  it("events.ts includes check() with mutual exclusivity for direct mode", () => {
    expect(eventsSource).toContain("events_delivery_mode_check");
    expect(eventsSource).toContain("check(");
    const directCase = eventsSource.match(
      /WHEN\s+\$\{table\.deliveryMode\}\s*=\s*'direct'\s+THEN\s+\$\{table\.endpointId\}\s*IS NOT NULL\s+AND\s+\$\{table\.endpointGroupId\}\s*IS NULL/s,
    );
    expect(directCase).not.toBeNull();
  });

  it("events.ts includes check() with mutual exclusivity for group mode", () => {
    const groupCase = eventsSource.match(
      /WHEN\s+\$\{table\.deliveryMode\}\s*=\s*'group'\s+THEN\s+\$\{table\.endpointGroupId\}\s*IS NOT NULL\s+AND\s+\$\{table\.endpointId\}\s*IS NULL/s,
    );
    expect(groupCase).not.toBeNull();
  });
});
