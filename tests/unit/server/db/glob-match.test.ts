import { describe, it, expect } from "vitest";
import { globMatch } from "@/server/db/queries";

describe("globMatch — exact matches", () => {
  it("matches identical strings with no wildcards", () => {
    expect(globMatch("order.created", "order.created")).toBe(true);
  });

  it("does not match different strings", () => {
    expect(globMatch("order.created", "order.updated")).toBe(false);
  });

  it("matches empty pattern against empty input", () => {
    expect(globMatch("", "")).toBe(true);
  });

  it("does not match empty pattern against non-empty input", () => {
    expect(globMatch("", "abc")).toBe(false);
  });

  it("does not match non-empty pattern against empty input", () => {
    expect(globMatch("abc", "")).toBe(false);
  });
});

describe("globMatch — single wildcard *", () => {
  it("matches any suffix with trailing *", () => {
    expect(globMatch("order.*", "order.created")).toBe(true);
    expect(globMatch("order.*", "order.anything")).toBe(true);
  });

  it("trailing * matches empty suffix", () => {
    expect(globMatch("order*", "order")).toBe(true);
  });

  it("matches any prefix with leading *", () => {
    expect(globMatch("*.created", "order.created")).toBe(true);
    expect(globMatch("*.created", "invoice.created")).toBe(true);
  });

  it("leading * matches empty prefix", () => {
    expect(globMatch("*created", "created")).toBe(true);
  });

  it("matches middle wildcard", () => {
    expect(globMatch("order.*.shipped", "order.us.shipped")).toBe(true);
  });

  it("does not match when non-wildcard parts differ", () => {
    expect(globMatch("order.*.shipped", "order.us.delivered")).toBe(false);
  });

  it("does not match when suffix after wildcard is missing", () => {
    expect(globMatch("order.*.shipped", "order.delivered")).toBe(false);
  });
});

describe("globMatch — multiple wildcards", () => {
  it("matches multiple wildcards", () => {
    expect(globMatch("*.*.*.*.*.*.created", "a.b.c.d.e.f.created")).toBe(true);
  });

  it("does not match when segment count insufficient", () => {
    expect(globMatch("*.*.*.created", "a.b.created")).toBe(false);
  });

  it("matches adjacent wildcards (zero-width match)", () => {
    expect(globMatch("order**created", "ordercreated")).toBe(true);
  });

  it("matches triple wildcards", () => {
    expect(globMatch("a***b", "ab")).toBe(true);
  });

  it("matches multiple wildcards scattered in pattern", () => {
    expect(globMatch("a*b*c", "axbxc")).toBe(true);
  });
});

describe("globMatch — special characters treated literally", () => {
  it("treats dot as literal", () => {
    expect(globMatch("order.created", "orderXcreated")).toBe(false);
    expect(globMatch("order.created", "order.created")).toBe(true);
  });

  it("treats plus as literal", () => {
    expect(globMatch("user+created", "userXcreated")).toBe(false);
    expect(globMatch("user+created", "user+created")).toBe(true);
  });

  it("treats parentheses as literal", () => {
    expect(globMatch("user(created)", "userXcreatedY")).toBe(false);
    expect(globMatch("user(created)", "user(created)")).toBe(true);
  });

  it("treats dollar sign as literal", () => {
    expect(globMatch("us$er", "usXer")).toBe(false);
    expect(globMatch("us$er", "us$er")).toBe(true);
  });

  it("treats square brackets as literal", () => {
    expect(globMatch("user[0-9]", "user5")).toBe(false);
    expect(globMatch("user[0-9]", "user[0-9]")).toBe(true);
  });

  it("treats curly braces as literal", () => {
    expect(globMatch("a{b}c", "a{b}c")).toBe(true);
    expect(globMatch("a{b}c", "abc")).toBe(false);
  });

  it("treats caret as literal", () => {
    expect(globMatch("^start", "^start")).toBe(true);
    expect(globMatch("^start", "start")).toBe(false);
  });

  it("treats pipe as literal", () => {
    expect(globMatch("a|b", "a|b")).toBe(true);
    expect(globMatch("a|b", "ab")).toBe(false);
  });

  it("treats backslash as literal", () => {
    expect(globMatch("a\\b", "a\\b")).toBe(true);
  });

  it("special chars combined with wildcards", () => {
    expect(globMatch("user.+*", "user.+extra")).toBe(true);
  });
});

describe("globMatch — ReDoS safety (no catastrophic backtracking)", () => {
  it("handles *a*a*a pattern against long input quickly", () => {
    const pattern = "*a*a*a";
    const input = "a".repeat(100) + "b";
    const start = performance.now();
    const result = globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result).toBe(false);
  });

  it("handles *a*b*a pattern against long input quickly", () => {
    const pattern = "*a*b*a";
    const input = "a".repeat(50) + "b".repeat(50) + "c";
    const start = performance.now();
    const result = globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result).toBe(false);
  });

  it("handles ***a pattern against long non-matching input", () => {
    const pattern = "***a";
    const input = "b".repeat(200);
    const start = performance.now();
    const result = globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result).toBe(false);
  });

  it("handles many wildcards with matching input quickly", () => {
    const pattern = "*.*.*.*.*.*.created";
    const input = "a.b.c.d.e.f.created";
    const start = performance.now();
    const result = globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result).toBe(true);
  });

  it("handles pattern with many repeated segments without catastrophic backtracking", () => {
    const pattern = "a.*.a.*.a.*.b";
    const input = "a.xa.xa.x".repeat(10) + "c";
    const start = performance.now();
    globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("handles pathological pattern with many * followed by non-match", () => {
    const pattern = "*a".repeat(20);
    const input = "a".repeat(500) + "b";
    const start = performance.now();
    globMatch(pattern, input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

describe("globMatch — edge cases", () => {
  it("pattern of just * matches everything including empty string", () => {
    expect(globMatch("*", "")).toBe(true);
    expect(globMatch("*", "anything")).toBe(true);
  });

  it("pattern of ** matches everything", () => {
    expect(globMatch("**", "")).toBe(true);
    expect(globMatch("**", "anything")).toBe(true);
  });

  it("wildcard at beginning and end", () => {
    expect(globMatch("*created*", "order.created.now")).toBe(true);
    expect(globMatch("*created*", "created")).toBe(true);
    expect(globMatch("*created*", "order.updated")).toBe(false);
  });

  it("single character patterns", () => {
    expect(globMatch("a", "a")).toBe(true);
    expect(globMatch("a", "b")).toBe(false);
    expect(globMatch("*", "a")).toBe(true);
  });

  it("unicode characters", () => {
    expect(globMatch("order.日本語", "order.日本語")).toBe(true);
    expect(globMatch("order.*", "order.日本語")).toBe(true);
    expect(globMatch("*.日本語", "order.日本語")).toBe(true);
  });

  it("returns false when pattern requires more characters than input has", () => {
    expect(globMatch("order.created.something", "order.created")).toBe(false);
  });

  it("wildcard matches single character", () => {
    expect(globMatch("order.*", "order.a")).toBe(true);
  });
});

describe("globMatch — exported from queries module", () => {
  it("is exported as a named export from @/server/db/queries", async () => {
    const mod = await import("@/server/db/queries");
    expect(typeof mod.globMatch).toBe("function");
  });
});
