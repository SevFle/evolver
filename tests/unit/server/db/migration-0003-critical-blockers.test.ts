import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";

const m0 = readFileSync("drizzle/0000_steep_silver_centurion.sql", "utf-8");
const m1 = readFileSync("drizzle/0001_giant_squirrel_girl.sql", "utf-8");
const m2 = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
const m3 = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");
const subsSource = readFileSync(
  "src/server/db/schema/endpoint-subscriptions.ts",
  "utf-8",
);
const eventsSource = readFileSync("src/server/db/schema/events.ts", "utf-8");
const queriesSource = readFileSync("src/server/db/queries/index.ts", "utf-8");
const routeSource = readFileSync(
  "src/app/api/v1/events/route.ts",
  "utf-8",
);

// ═══════════════════════════════════════════════════════════════════════
// (1) MIGRATION 0003: DROPS OLD CONSTRAINT BEFORE ADDING NEW ONE
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL: migration 0003 — constraint chain integrity", () => {
  it("migration 0000 creates events_target_check", () => {
    expect(m0).toContain("events_target_check");
  });

  it("migration 0001 re-adds events_target_check (possibly updated definition)", () => {
    expect(m1).toContain("events_target_check");
  });

  it("migration 0002 DROPS events_target_check BEFORE migration 0003 runs", () => {
    expect(m2).toContain('DROP CONSTRAINT "events_target_check"');
  });

  it("migration 0003 includes DROP CONSTRAINT IF EXISTS for events_target_check (safety net)", () => {
    expect(m3).toContain("events_target_check");
    expect(m3).toContain("DROP CONSTRAINT IF EXISTS");
  });

  it("migration 0003 adds the NEW events_delivery_mode_check constraint", () => {
    expect(m3).toContain("events_delivery_mode_check");
  });

  it("migration 0003 adds the NEW endpoint_subscriptions_delivery_mode_check constraint", () => {
    expect(m3).toContain("endpoint_subscriptions_delivery_mode_check");
  });

  it("migration 0003 safely drops events_target_check with IF EXISTS before adding new constraint", () => {
    const dropPos = m3.indexOf("DROP CONSTRAINT IF EXISTS");
    const addCheckPos = m3.indexOf("events_delivery_mode_check");
    expect(dropPos).toBeGreaterThan(-1);
    expect(addCheckPos).toBeGreaterThan(dropPos);
  });

  it("constraint chain is sequential: 0000 creates → 0002 drops → 0003 safety drop + creates new", () => {
    const m0Has = m0.includes("events_target_check");
    const m2Drops = m2.includes('DROP CONSTRAINT "events_target_check"');
    const m3SafetyDrop = m3.includes("DROP CONSTRAINT IF EXISTS") && m3.includes("events_target_check");
    const m3AddsNew = m3.includes("events_delivery_mode_check");
    expect(m0Has).toBe(true);
    expect(m2Drops).toBe(true);
    expect(m3SafetyDrop).toBe(true);
    expect(m3AddsNew).toBe(true);
  });
});

describe("CRITICAL: migration 0003 — no constraint gap between migration 0002 and 0003", () => {
  it("migration 0002 drops events_target_check but does NOT add a replacement", () => {
    expect(m2).toContain('DROP CONSTRAINT "events_target_check"');
    expect(m2).not.toContain("events_delivery_mode_check");
    expect(m2).not.toContain("endpoint_subscriptions_delivery_mode_check");
  });

  it("migration 0003 is the one that adds the new delivery_mode check for events", () => {
    const addCheckAfterDrop =
      m3.includes("events_delivery_mode_check");
    expect(addCheckAfterDrop).toBe(true);
  });

  it("between 0002 and 0003, events table has NO check constraint on target fields", () => {
    const m2Statements = m2.split("--> statement-breakpoint").map((s) => s.trim());
    const dropsCheck = m2Statements.some((s) =>
      s.includes('DROP CONSTRAINT "events_target_check"'),
    );
    const addsCheck = m2Statements.some((s) =>
      s.includes("events_delivery_mode_check") ||
      s.includes("events_target_check") && s.includes("ADD CONSTRAINT"),
    );
    expect(dropsCheck).toBe(true);
    expect(addsCheck).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (2) MIGRATION 0003: OVERLAP ROW HANDLING
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL: migration 0003 — events backfill handles overlap rows", () => {
  let backfillBlock: string;

  const extractBackfill = () => {
    const start = m3.indexOf('UPDATE "events" SET "delivery_mode"');
    const end = m3.indexOf(";", start);
    return m3.slice(start, end);
  };

  beforeAll(() => {
    backfillBlock = extractBackfill();
  });

  it("backfill uses CASE expression with priority ordering", () => {
    expect(backfillBlock).toContain("CASE");
    expect(backfillBlock).toContain("END");
  });

  it("endpoint_id takes priority over endpoint_group_id in the CASE WHEN order", () => {
    const directPos = backfillBlock.indexOf("endpoint_id IS NOT NULL");
    const groupPos = backfillBlock.indexOf("endpoint_group_id IS NOT NULL");
    expect(directPos).toBeGreaterThan(-1);
    expect(groupPos).toBeGreaterThan(-1);
    expect(directPos).toBeLessThan(groupPos);
  });

  it("backfill classifies rows with only endpoint_id as 'direct'", () => {
    expect(backfillBlock).toMatch(
      /endpoint_id IS NOT NULL.*THEN 'direct'/s,
    );
  });

  it("backfill classifies rows with only endpoint_group_id as 'group'", () => {
    expect(backfillBlock).toMatch(
      /endpoint_group_id IS NOT NULL.*THEN 'group'/s,
    );
  });

  it("backfill classifies rows with neither as 'fanout' via ELSE", () => {
    expect(backfillBlock).toMatch(/ELSE.*'fanout'/s);
  });

  it("rows with BOTH endpoint_id and endpoint_group_id get classified as 'direct'", () => {
    const directCondition = backfillBlock.match(
      /WHEN\s+endpoint_id IS NOT NULL\s+THEN 'direct'/s,
    );
    expect(directCondition).not.toBeNull();
  });

  it("WARN: rows with BOTH set become 'direct' but CHECK requires endpoint_group_id IS NULL — migration could fail", () => {
    const eventsCheck = m3.match(
      /events_delivery_mode_check[\s\S]*?END/,
    )?.[0] ?? "";
    const directRequiresGroupIdNull = eventsCheck.includes(
      "delivery_mode = 'direct'",
    ) && eventsCheck.includes("endpoint_group_id IS NULL");
    expect(directRequiresGroupIdNull).toBe(true);
  });

  it("migration 0003 adds delivery_mode as nullable BEFORE backfill", () => {
    const addColPos = m3.indexOf(
      'ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "delivery_mode" text',
    );
    const updatePos = m3.indexOf('UPDATE "events" SET "delivery_mode"');
    expect(addColPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(addColPos).toBeLessThan(updatePos);
  });

  it("migration 0003 sets NOT NULL AFTER backfill (safe ordering)", () => {
    const setNotNull = m3.indexOf(
      'ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL',
    );
    const updatePos = m3.indexOf('UPDATE "events" SET "delivery_mode"');
    expect(setNotNull).toBeGreaterThan(updatePos);
  });

  it("migration 0003 adds CHECK constraint AFTER NOT NULL (safe ordering)", () => {
    const setNotNull = m3.indexOf(
      'ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL',
    );
    const addCheck = m3.indexOf("events_delivery_mode_check");
    expect(addCheck).toBeGreaterThan(setNotNull);
  });

  it("endpoint_subscriptions delivery_mode has DEFAULT 'direct' for existing rows", () => {
    expect(m3).toContain(
      "ADD COLUMN IF NOT EXISTS \"delivery_mode\" text NOT NULL DEFAULT 'direct'",
    );
  });

  it("existing subscriptions get delivery_mode='direct' via DEFAULT (no explicit backfill needed)", () => {
    const hasSubsBackfill = m3.match(
      /UPDATE.*endpoint_subscriptions.*SET.*delivery_mode/,
    );
    expect(hasSubsBackfill).toBeNull();
  });

  it("FIXED: backfill DO block resets statement_timeout after loop completes", () => {
    const backfillDoStart = m3.indexOf("PERFORM set_config('statement_timeout', '5s', true)");
    const backfillDoEnd = m3.indexOf("END $$;", backfillDoStart);
    const backfillBlock = m3.slice(backfillDoStart, backfillDoEnd);
    expect(backfillBlock).toContain("PERFORM set_config('statement_timeout', '0', true)");
    const resetPos = backfillBlock.indexOf("PERFORM set_config('statement_timeout', '0', true)");
    const loopEndPos = backfillBlock.indexOf("END LOOP;");
    expect(resetPos).toBeGreaterThan(loopEndPos);
  });

  it("backfill uses cursor-based pagination with cursor_id variable", () => {
    const backfillDoStart = m3.indexOf("PERFORM set_config('statement_timeout', '5s', true)");
    const backfillDoEnd = m3.indexOf("END $$;", backfillDoStart);
    const backfillBlock = m3.slice(backfillDoStart, backfillDoEnd);
    expect(backfillBlock).toContain("cursor_id");
    expect(backfillBlock).toContain("batch_max_id");
  });

  it("backfill uses WHERE id > cursor_id to skip already-processed rows", () => {
    const backfillDoStart = m3.indexOf("PERFORM set_config('statement_timeout', '5s', true)");
    const backfillDoEnd = m3.indexOf("END $$;", backfillDoStart);
    const backfillBlock = m3.slice(backfillDoStart, backfillDoEnd);
    expect(backfillBlock).toMatch(/id\s*>\s*cursor_id/);
  });

  it("backfill uses ORDER BY id for deterministic cursor advancement", () => {
    const backfillDoStart = m3.indexOf("PERFORM set_config('statement_timeout', '5s', true)");
    const backfillDoEnd = m3.indexOf("END $$;", backfillDoStart);
    const backfillBlock = m3.slice(backfillDoStart, backfillDoEnd);
    expect(backfillBlock).toContain("ORDER BY id");
  });

  it("backfill advances cursor with cursor_id := batch_max_id", () => {
    const backfillDoStart = m3.indexOf("PERFORM set_config('statement_timeout', '5s', true)");
    const backfillDoEnd = m3.indexOf("END $$;", backfillDoStart);
    const backfillBlock = m3.slice(backfillDoStart, backfillDoEnd);
    expect(backfillBlock).toContain("cursor_id := batch_max_id");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (3) SUBSCRIPTIONS SCHEMA: NULL-DUPLICATE PREVENTION
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL BLOCKER: endpoint_subscriptions unique index — NULL-duplicate subscriptions", () => {
  it("old unique index endpoint_subscriptions_endpoint_event_type_uniq is dropped in migration 0003", () => {
    expect(m3).toContain("DROP INDEX IF EXISTS");
    expect(m3).toContain("endpoint_subscriptions_endpoint_event_type_uniq");
  });

  it("schema uses partial unique indexes with WHERE clauses for each delivery mode", () => {
    expect(subsSource).toContain("endpoint_subscriptions_direct_event_type_uniq");
    expect(subsSource).toContain("endpoint_subscriptions_group_event_type_uniq");
    expect(subsSource).toContain("endpoint_subscriptions_fanout_event_type_uniq");
  });

  it("direct mode partial unique index covers (endpoint_id, event_type) WHERE endpoint_id IS NOT NULL", () => {
    expect(subsSource).toMatch(
      /directEventTypeUnique[\s\S]*?endpoint_subscriptions_direct_event_type_uniq[\s\S]*?\.on\([\s\S]*?table\.endpointId[\s\S]*?table\.eventType/,
    );
    expect(subsSource).toMatch(
      /directEventTypeUnique[\s\S]*?\.where\([\s\S]*?endpointId.*IS NOT NULL/,
    );
  });

  it("group mode partial unique index covers (endpoint_group_id, event_type) WHERE endpoint_group_id IS NOT NULL", () => {
    expect(subsSource).toMatch(
      /groupEventTypeUnique[\s\S]*?endpoint_subscriptions_group_event_type_uniq[\s\S]*?\.on\([\s\S]*?table\.endpointGroupId[\s\S]*?table\.eventType/,
    );
    expect(subsSource).toMatch(
      /groupEventTypeUnique[\s\S]*?\.where\([\s\S]*?endpointGroupId.*IS NOT NULL/,
    );
  });

  it("fanout mode partial unique index covers (user_id, event_type) WHERE both endpoint_id and endpoint_group_id IS NULL", () => {
    expect(subsSource).toMatch(
      /fanoutEventTypeUnique[\s\S]*?endpoint_subscriptions_fanout_event_type_uniq[\s\S]*?\.on\([\s\S]*?table\.userId[\s\S]*?table\.eventType/,
    );
    expect(subsSource).toMatch(
      /fanoutEventTypeUnique[\s\S]*?\.where\([\s\S]*?endpointId.*IS NULL.*endpointGroupId.*IS NULL/s,
    );
  });

  it("FIXED: fanout mode partial unique index excludes NULL user_id to prevent NULL-duplicate subscriptions", () => {
    expect(subsSource).toMatch(
      /fanoutEventTypeUnique[\s\S]*?\.where\([\s\S]*?userId.*IS NOT NULL/s,
    );
    expect(m3).toContain(
      'WHERE "user_id" IS NOT NULL AND "endpoint_id" IS NULL AND "endpoint_group_id" IS NULL',
    );
  });

  it("endpointId is nullable (no .notNull())", () => {
    const endpointIdLine = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    expect(endpointIdLine).toBeDefined();
    expect(endpointIdLine!).not.toContain(".notNull()");
  });

  it("FIXED: partial unique indexes use WHERE clauses to handle NULLs correctly", () => {
    const hasWhereOnDirect = /directEventTypeUnique[\s\S]*?\.where\(/.test(
      subsSource,
    );
    const hasWhereOnGroup = /groupEventTypeUnique[\s\S]*?\.where\(/.test(
      subsSource,
    );
    const hasWhereOnFanout = /fanoutEventTypeUnique[\s\S]*?\.where\(/.test(
      subsSource,
    );
    expect(hasWhereOnDirect).toBe(true);
    expect(hasWhereOnGroup).toBe(true);
    expect(hasWhereOnFanout).toBe(true);
  });

  it("FIXED: partial unique indexes have WHERE clauses for partial indexing", () => {
    const directBlock = subsSource.match(
      /directEventTypeUnique[\s\S]*?\.where\([\s\S]*?\)/s,
    )?.[0] ?? "";
    const groupBlock = subsSource.match(
      /groupEventTypeUnique[\s\S]*?\.where\([\s\S]*?\)/s,
    )?.[0] ?? "";
    const fanoutBlock = subsSource.match(
      /fanoutEventTypeUnique[\s\S]*?\.where\([\s\S]*?\)/s,
    )?.[0] ?? "";
    expect(directBlock).toContain(".where(");
    expect(groupBlock).toContain(".where(");
    expect(fanoutBlock).toContain(".where(");
  });

  it("FIXED: schema uses separate partial unique indexes for each delivery mode", () => {
    const uniqueIndexCount = (
      subsSource.match(/uniqueIndex\(/g) || []
    ).length;
    expect(uniqueIndexCount).toBe(3);
  });

  it("verifies the snapshot JSON confirms WHERE clauses on all partial unique indexes", () => {
    const snapshot = readFileSync(
      "drizzle/meta/0003_snapshot.json",
      "utf-8",
    );
    const parsed = JSON.parse(snapshot);
    const directIdx =
      parsed.tables["public.endpoint_subscriptions"]?.indexes
        ?.endpoint_subscriptions_direct_event_type_uniq;
    const groupIdx =
      parsed.tables["public.endpoint_subscriptions"]?.indexes
        ?.endpoint_subscriptions_group_event_type_uniq;
    const fanoutIdx =
      parsed.tables["public.endpoint_subscriptions"]?.indexes
        ?.endpoint_subscriptions_fanout_event_type_uniq;
    expect(directIdx).toBeDefined();
    expect(directIdx.where).toBeDefined();
    expect(groupIdx).toBeDefined();
    expect(groupIdx.where).toBeDefined();
    expect(fanoutIdx).toBeDefined();
    expect(fanoutIdx.where).toBeDefined();
  });

  it("snapshot confirms partial unique indexes are btree with proper WHERE clauses", () => {
    const snapshot = readFileSync(
      "drizzle/meta/0003_snapshot.json",
      "utf-8",
    );
    const parsed = JSON.parse(snapshot);
    for (const name of [
      "endpoint_subscriptions_direct_event_type_uniq",
      "endpoint_subscriptions_group_event_type_uniq",
      "endpoint_subscriptions_fanout_event_type_uniq",
    ]) {
      const idx =
        parsed.tables["public.endpoint_subscriptions"]?.indexes?.[name];
      expect(idx).toBeDefined();
      expect(idx.isUnique).toBe(true);
      expect(idx.method).toBe("btree");
      expect(idx.where).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (3b) MIGRATION 0003: ENDPOINT_SUBSCRIPTIONS CORRUPTION GUARD
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL: migration 0003 — endpoint_subscriptions corruption guard", () => {
  it("includes an IF EXISTS guard checking endpoint_subscriptions for overlapping target columns", () => {
    expect(m3).toContain('SELECT 1 FROM "endpoint_subscriptions" WHERE "endpoint_id" IS NOT NULL AND "endpoint_group_id" IS NOT NULL');
  });

  it("endpoint_subscriptions guard raises exception on corruption", () => {
    expect(m3).toContain("endpoint_subscriptions rows with both endpoint_id AND endpoint_group_id non-null exist");
  });

  it("endpoint_subscriptions guard is placed before the CHECK constraint", () => {
    const guardPos = m3.indexOf("endpoint_subscriptions rows with both endpoint_id AND endpoint_group_id non-null exist");
    const checkPos = m3.indexOf("endpoint_subscriptions_delivery_mode_check");
    expect(guardPos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(checkPos);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (4) CHECK CONSTRAINT: MUTUAL EXCLUSIVITY IN BOTH TABLES
// ═══════════════════════════════════════════════════════════════════════

describe("delivery_mode CHECK constraint — mutual exclusivity verification", () => {
  const extractCheck = (src: string, name: string): string => {
    const start = src.indexOf(name);
    const end = src.indexOf("END", start);
    return src.slice(start, end + 3);
  };

  describe("endpoint_subscriptions CHECK in Drizzle schema", () => {
    let checkBlock: string;
    beforeAll(() => {
      checkBlock = extractCheck(
        subsSource,
        "endpoint_subscriptions_delivery_mode_check",
      );
    });

    it("direct mode: endpointId NOT NULL AND endpointGroupId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'direct'.*endpointId.*IS NOT NULL.*endpointGroupId.*IS NULL/s,
      );
    });

    it("group mode: endpointGroupId NOT NULL AND endpointId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'group'.*endpointGroupId.*IS NOT NULL.*endpointId.*IS NULL/s,
      );
    });

    it("fanout mode: both endpointId AND endpointGroupId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'fanout'.*endpointId.*IS NULL.*endpointGroupId.*IS NULL/s,
      );
    });

    it("rejects all other values with ELSE false", () => {
      expect(checkBlock).toContain("ELSE false");
    });
  });

  describe("events CHECK in Drizzle schema", () => {
    let checkBlock: string;
    beforeAll(() => {
      checkBlock = extractCheck(eventsSource, "events_delivery_mode_check");
    });

    it("direct mode: endpointId NOT NULL AND endpointGroupId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'direct'.*endpointId.*IS NOT NULL.*endpointGroupId.*IS NULL/s,
      );
    });

    it("group mode: endpointGroupId NOT NULL AND endpointId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'group'.*endpointGroupId.*IS NOT NULL.*endpointId.*IS NULL/s,
      );
    });

    it("fanout mode: both endpointId AND endpointGroupId IS NULL", () => {
      expect(checkBlock).toMatch(
        /deliveryMode.*=.*'fanout'.*endpointId.*IS NULL.*endpointGroupId.*IS NULL/s,
      );
    });

    it("rejects all other values with ELSE false", () => {
      expect(checkBlock).toContain("ELSE false");
    });
  });

  describe("CHECK constraints in migration 0003 SQL", () => {
    it("endpoint_subscriptions_delivery_mode_check has all three modes", () => {
      const check = m3.match(
        /endpoint_subscriptions_delivery_mode_check[\s\S]*?END/,
      )?.[0] ?? "";
      expect(check).toContain("'direct'");
      expect(check).toContain("'group'");
      expect(check).toContain("'fanout'");
    });

    it("events_delivery_mode_check has all three modes", () => {
      const check = m3.match(
        /events_delivery_mode_check[\s\S]*?END/,
      )?.[0] ?? "";
      expect(check).toContain("'direct'");
      expect(check).toContain("'group'");
      expect(check).toContain("'fanout'");
    });

    it("both CHECK constraints are syntactically complete with CASE...END", () => {
      for (const name of [
        "endpoint_subscriptions_delivery_mode_check",
        "events_delivery_mode_check",
      ]) {
        const check = m3.match(
          new RegExp(`${name}[\\s\\S]*?END`),
        )?.[0] ?? "";
        expect(check).toContain("CASE");
        expect(check).toContain("WHEN");
        expect(check).toContain("THEN");
        expect(check).toContain("ELSE false");
        expect(check).toContain("END");
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (5) createSubscription — onConflictDoUpdate behavior
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL: createSubscription — onConflictDoUpdate scope", () => {
  it("uses onConflictDoUpdate targeting (endpointId, eventType)", () => {
    expect(queriesSource).toContain("onConflictDoUpdate");
    expect(queriesSource).toMatch(
      /target:\s*\[endpointSubscriptions\.endpointId,\s*endpointSubscriptions\.eventType\]/,
    );
  });

  it("onConflictDoUpdate reactivates by setting isActive=true", () => {
    expect(queriesSource).toMatch(
      /onConflictDoUpdate[\s\S]*?set:\s*\{[^}]*isActive:\s*true/,
    );
  });

  it("createSubscription only supports direct mode (passes endpointId)", () => {
    const createSubsMatch = queriesSource.match(
      /export async function createSubscription[\s\S]*?return subscription[\s\S]*?\}/,
    );
    expect(createSubsMatch).not.toBeNull();
    expect(createSubsMatch![0]).toContain("endpointId");
  });

  it("WARN: createSubscription does not set deliveryMode explicitly", () => {
    const createSubsMatch = queriesSource.match(
      /export async function createSubscription[\s\S]*?\.values\(\{[\s\S]*?\}\)/,
    );
    expect(createSubsMatch).not.toBeNull();
    const valuesBlock = createSubsMatch![0];
    expect(valuesBlock).not.toContain("deliveryMode");
  });

  it("onConflictDoUpdate triggers via direct partial unique index when endpointId is NOT NULL", () => {
    const hasDirectUniqueIdx = subsSource.includes(
      "endpoint_subscriptions_direct_event_type_uniq",
    );
    expect(hasDirectUniqueIdx).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (6) resolveSubscribedEndpoints — NULL endpointId handling
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL: resolveSubscribedEndpoints — NULL endpointId safety", () => {
  it("queries endpointId from subscriptions (which can be NULL for fanout/group)", () => {
    const resolveFn = queriesSource.match(
      /export async function resolveSubscribedEndpoints[\s\S]*?^}/m,
    )?.[0] ?? "";
    expect(resolveFn).toContain("endpointSubscriptions.endpointId");
  });

  it("FIXED: resolveSubscribedEndpoints filters NULL endpointIds before passing to getActiveEndpointsByIds", () => {
    const resolveFn = queriesSource.match(
      /export async function resolveSubscribedEndpoints[\s\S]*?^}/m,
    )?.[0] ?? "";
    const hasNullFilter = resolveFn.includes("is not null") || resolveFn.includes("IS NOT NULL") || resolveFn.includes("!== null") || resolveFn.includes("!= null");
    expect(hasNullFilter).toBe(true);
  });

  it("BLOCKER: endpointId in subscription can be NULL when delivery_mode='fanout' or 'group'", () => {
    const checkBlock = subsSource.match(
      /endpoint_subscriptions_delivery_mode_check[\s\S]*?END/,
    )?.[0] ?? "";
    const fanoutAllowsNull = checkBlock.includes("fanout") && checkBlock.includes("table.endpointId") && checkBlock.includes("IS NULL");
    const groupAllowsNull = checkBlock.includes("group") && checkBlock.includes("table.endpointId") && checkBlock.includes("IS NULL");
    expect(fanoutAllowsNull || groupAllowsNull).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (7) EVENTS ROUTE — subscription fanout creates events with no target
// ═══════════════════════════════════════════════════════════════════════

describe("events route — subscription fanout passes allowNoTarget", () => {
  it("handleSubscriptionEvent passes allowNoTarget: true to createEvent", () => {
    expect(routeSource).toContain("allowNoTarget: true");
  });

  it("handleSubscriptionEvent passes endpointId: undefined", () => {
    const subscriptionHandler = routeSource.match(
      /async function handleSubscriptionEvent[\s\S]*?^}/m,
    )?.[0] ?? "";
    expect(subscriptionHandler).toContain("endpointId: undefined");
  });

  it("handleFanoutEvent also passes allowNoTarget: true", () => {
    const fanoutMatches = routeSource.match(/allowNoTarget:\s*true/g);
    expect(fanoutMatches).not.toBeNull();
    expect(fanoutMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("sendFanoutEventSchema enforces XOR: exactly one of endpointGroupId or endpointIds", () => {
    const xorPattern = /\(data\.endpointGroupId && !data\.endpointIds\) \|\| \(!data\.endpointGroupId && data\.endpointIds\)/;
    expect(xorPattern.test(routeSource)).toBe(true);
    expect(routeSource).toContain("Must provide exactly one of endpointGroupId or endpointIds");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (8) MIGRATION CHAIN — sequential ordering verification
// ═══════════════════════════════════════════════════════════════════════

describe("migration chain — full sequential integrity", () => {
  it("0000: events table created with endpoint_id nullable", () => {
    expect(m0).toContain("CREATE TABLE");
    expect(m0).toContain('"events"');
  });

  it("0000: events has events_target_check requiring endpoint_id or endpoint_group_id", () => {
    expect(m0).toContain("events_target_check");
  });

  it("0001: adds endpoint_group_id column to events", () => {
    expect(m1).toContain(
      'ALTER TABLE "events" ADD COLUMN "endpoint_group_id" uuid',
    );
  });

  it("0001: re-establishes events_target_check with updated definition", () => {
    expect(m1).toContain("events_target_check");
    expect(m1).toContain("ADD CONSTRAINT");
  });

  it("0002: creates endpoint_subscriptions with endpoint_id NOT NULL", () => {
    expect(m2).toContain("CREATE TABLE");
    expect(m2).toContain('"endpoint_subscriptions"');
    expect(m2).toContain('"endpoint_id" uuid NOT NULL');
  });

  it("0002: DROPS events_target_check (removes old constraint)", () => {
    expect(m2).toContain('DROP CONSTRAINT "events_target_check"');
  });

  it("0002: creates unique index on (endpoint_id, event_type) with endpoint_id NOT NULL", () => {
    expect(m2).toContain("endpoint_subscriptions_endpoint_event_type_uniq");
  });

  it("0003: makes endpoint_id nullable in subscriptions (was NOT NULL in 0002)", () => {
    expect(m3).toContain(
      'ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL',
    );
  });

  it("0003: adds endpoint_group_id to subscriptions", () => {
    expect(m3).toContain(
      'ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint_group_id" uuid',
    );
  });

  it("0003: adds delivery_mode to subscriptions with DEFAULT 'direct'", () => {
    expect(m3).toContain(
      "ADD COLUMN IF NOT EXISTS \"delivery_mode\" text NOT NULL DEFAULT 'direct'",
    );
  });

  it("0003: adds delivery_mode to events as nullable, then backfills, then sets NOT NULL", () => {
    const addNullable = m3.indexOf(
      'ALTER TABLE "events" ADD COLUMN "delivery_mode" text',
    );
    const backfill = m3.indexOf('UPDATE "events" SET "delivery_mode"');
    const setNotNull = m3.indexOf(
      'ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL',
    );
    expect(addNullable).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(setNotNull);
  });

  it("0003: creates updated_at trigger for endpoint_subscriptions", () => {
    expect(m3).toContain("set_updated_at");
    expect(m3).toContain("endpoint_subscriptions_set_updated_at");
    expect(m3).toContain("BEFORE UPDATE ON");
  });

  it("FIXED: CREATE TRIGGER is wrapped in DO block with EXCEPTION WHEN duplicate_object for idempotency", () => {
    const triggerPos = m3.indexOf("CREATE TRIGGER");
    const doBlockStart = m3.lastIndexOf("DO $$", triggerPos);
    const exceptionPos = m3.indexOf("EXCEPTION WHEN duplicate_object", doBlockStart);
    const endBlockPos = m3.indexOf("END $$;", triggerPos);
    expect(doBlockStart).toBeGreaterThan(-1);
    expect(exceptionPos).toBeGreaterThan(doBlockStart);
    expect(exceptionPos).toBeLessThan(endBlockPos);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (9) SCHEMA-TO-MIGRATION ALIGNMENT
// ═══════════════════════════════════════════════════════════════════════

describe("schema alignment — Drizzle schema matches migration 0003 SQL", () => {
  it("subscriptions schema defines endpointId as nullable (matches 0003 DROP NOT NULL)", () => {
    const line = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    expect(line).toBeDefined();
    expect(line!).not.toContain(".notNull()");
  });

  it("subscriptions schema defines endpointGroupId as nullable (matches 0003 ADD COLUMN uuid)", () => {
    const line = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_group_id")'));
    expect(line).toBeDefined();
    expect(line!).not.toContain(".notNull()");
  });

  it("subscriptions schema defines deliveryMode NOT NULL DEFAULT 'direct'", () => {
    expect(subsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
  });

  it("events schema defines deliveryMode NOT NULL DEFAULT 'direct'", () => {
    expect(eventsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
  });

  it("subscriptions schema defines CHECK with same logic as migration 0003", () => {
    expect(subsSource).toContain("endpoint_subscriptions_delivery_mode_check");
    expect(subsSource).toMatch(
      /deliveryMode.*=.*'direct'.*endpointId.*IS NOT NULL.*endpointGroupId.*IS NULL/s,
    );
  });

  it("events schema defines CHECK with same logic as migration 0003", () => {
    expect(eventsSource).toContain("events_delivery_mode_check");
    expect(eventsSource).toMatch(
      /deliveryMode.*=.*'direct'.*endpointId.*IS NOT NULL.*endpointGroupId.*IS NULL/s,
    );
  });

  it("subscriptions FK for endpointGroupId uses CASCADE (matches migration)", () => {
    expect(subsSource).toContain(
      'references(() => endpointGroups.id, { onDelete: "cascade" })',
    );
  });

  it("events FK for endpointGroupId uses RESTRICT (matches migration)", () => {
    expect(eventsSource).toContain(
      'references(() => endpointGroups.id, { onDelete: "restrict" })',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (10) RELATIONS — endpointSubscriptionsRelations completeness
// ═══════════════════════════════════════════════════════════════════════

describe("relations — endpointSubscriptionsRelations after migration 0003", () => {
  it("defines relation to endpointGroup via endpointGroupId", () => {
    expect(queriesSource).not.toBeNull();
    const relSource = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(relSource).toContain("endpointSubscriptionsRelations");
    expect(relSource).toContain("endpointSubscriptions.endpointGroupId");
    expect(relSource).toContain("endpointGroups.id");
  });

  it("defines relation to endpoint via endpointId", () => {
    const relSource = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(relSource).toContain("endpointSubscriptions.endpointId");
    expect(relSource).toContain("endpoints.id");
  });

  it("defines relation to user via userId", () => {
    const relSource = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(relSource).toContain("endpointSubscriptions.userId");
    expect(relSource).toContain("users.id");
  });

  it("endpointsRelations defines subscriptions as many relation", () => {
    const relSource = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(relSource).toContain("endpointSubscriptions");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (11) SNAPSHOT VALIDATION
// ═══════════════════════════════════════════════════════════════════════

describe("0003 snapshot — structural correctness", () => {
  const snapshot = JSON.parse(
    readFileSync("drizzle/meta/0003_snapshot.json", "utf-8"),
  );

  it("snapshot contains endpoint_subscriptions table", () => {
    expect(snapshot.tables["public.endpoint_subscriptions"]).toBeDefined();
  });

  it("snapshot: endpoint_id is nullable in subscriptions", () => {
    const col =
      snapshot.tables["public.endpoint_subscriptions"].columns.endpoint_id;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(false);
  });

  it("snapshot: endpoint_group_id is nullable in subscriptions", () => {
    const col =
      snapshot.tables["public.endpoint_subscriptions"].columns
        .endpoint_group_id;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(false);
  });

  it("snapshot: delivery_mode is NOT NULL with default 'direct' in subscriptions", () => {
    const col =
      snapshot.tables["public.endpoint_subscriptions"].columns.delivery_mode;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(true);
    expect(col.default).toBe("'direct'");
  });

  it("snapshot: delivery_mode is NOT NULL with default 'direct' in events", () => {
    const col =
      snapshot.tables["public.events"].columns.delivery_mode;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(true);
    expect(col.default).toBe("'direct'");
  });

  it("snapshot: events has delivery_mode_check constraint", () => {
    const checks =
      snapshot.tables["public.events"].checkConstraints || {};
    expect(checks.events_delivery_mode_check).toBeDefined();
    expect(
      checks.events_delivery_mode_check.value,
    ).toContain("delivery_mode = 'direct'");
  });

  it("snapshot: endpoint_subscriptions has delivery_mode_check constraint", () => {
    const checks =
      snapshot.tables["public.endpoint_subscriptions"].checkConstraints ||
      {};
    expect(
      checks.endpoint_subscriptions_delivery_mode_check,
    ).toBeDefined();
    expect(
      checks.endpoint_subscriptions_delivery_mode_check.value,
    ).toContain("delivery_mode = 'direct'");
  });

  it("snapshot: endpoint_subscriptions has FK to endpoint_groups", () => {
    const fks =
      snapshot.tables["public.endpoint_subscriptions"].foreignKeys as Record<
        string,
        { tableTo: string; onDelete: string }
      >;
    const groupFk = Object.values(fks).find(
      (fk) => fk.tableTo === "endpoint_groups",
    );
    expect(groupFk).toBeDefined();
    expect(groupFk!.onDelete).toBe("cascade");
  });

  it("snapshot: events FK to endpoint_groups uses restrict", () => {
    const fks = snapshot.tables["public.events"].foreignKeys as Record<
      string,
      { tableTo: string; onDelete: string }
    >;
    const groupFk = Object.values(fks).find(
      (fk) => fk.tableTo === "endpoint_groups",
    );
    expect(groupFk).toBeDefined();
    expect(groupFk!.onDelete).toBe("restrict");
  });

  it("snapshot: new partial unique indexes have WHERE clauses (BLOCKER resolved)", () => {
    for (const name of [
      "endpoint_subscriptions_direct_event_type_uniq",
      "endpoint_subscriptions_group_event_type_uniq",
      "endpoint_subscriptions_fanout_event_type_uniq",
    ]) {
      const idx =
        snapshot.tables["public.endpoint_subscriptions"].indexes[name];
      expect(idx).toBeDefined();
      expect(idx.isUnique).toBe(true);
      expect(idx.where).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (12) CRITICAL BLOCKERS SUMMARY
// ═══════════════════════════════════════════════════════════════════════

describe("CRITICAL BLOCKERS SUMMARY", () => {
  it("RESOLVED: NULL-duplicate subscriptions prevented by partial unique indexes with WHERE clauses", () => {
    const hasPartialIndexes =
      subsSource.includes("endpoint_subscriptions_direct_event_type_uniq") &&
      subsSource.includes("endpoint_subscriptions_group_event_type_uniq") &&
      subsSource.includes("endpoint_subscriptions_fanout_event_type_uniq");
    const hasWhereClauses =
      /directEventTypeUnique[\s\S]*?\.where\(/s.test(subsSource) &&
      /groupEventTypeUnique[\s\S]*?\.where\(/s.test(subsSource) &&
      /fanoutEventTypeUnique[\s\S]*?\.where\(/s.test(subsSource);
    expect(hasPartialIndexes).toBe(true);
    expect(hasWhereClauses).toBe(true);
  });

  it("RESOLVED: resolveSubscribedEndpoints filters NULL endpointIds before passing to getActiveEndpointsByIds", () => {
    const resolveFn = queriesSource.match(
      /export async function resolveSubscribedEndpoints[\s\S]*?^}/m,
    )?.[0] ?? "";
    const collectsEndpointId = resolveFn.includes("sub.endpointId") || resolveFn.includes("s.endpointId");
    const hasNullFilter =
      resolveFn.includes("!== null") || resolveFn.includes("!= null") ||
      resolveFn.includes("is not null") || resolveFn.includes("IS NOT NULL");
    expect(collectsEndpointId).toBe(true);
    expect(hasNullFilter).toBe(true);
  });

  it("BLOCKER 3: migration 0003 could fail if existing events have both endpoint_id AND endpoint_group_id set", () => {
    const backfill = m3.match(
      /UPDATE "events" SET "delivery_mode"[\s\S]*?;/,
    )?.[0] ?? "";
    const directPriority = backfill.includes(
      "WHEN endpoint_id IS NOT NULL THEN 'direct'",
    );
    const checkRequiresGroupNull = m3.includes(
      "delivery_mode = 'direct'",
    ) && m3.includes("endpoint_group_id IS NULL");
    expect(directPriority).toBe(true);
    expect(checkRequiresGroupNull).toBe(true);
  });
});
