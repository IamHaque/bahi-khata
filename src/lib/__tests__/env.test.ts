import { describe, expect, it } from "vitest";
import { readEnv } from "@/lib/env";

const VALID = {
  VITE_SUPABASE_URL: "https://abc.supabase.co",
  VITE_SUPABASE_ANON_KEY: "a".repeat(40),
};

describe("readEnv", () => {
  it("accepts a valid URL and a long enough key", () => {
    const result = readEnv(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.VITE_SUPABASE_URL).toBe(VALID.VITE_SUPABASE_URL);
  });

  it("reports a missing URL", () => {
    const result = readEnv({ VITE_SUPABASE_ANON_KEY: VALID.VITE_SUPABASE_ANON_KEY });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toContain("VITE_SUPABASE_URL");
    }
  });

  it("reports a value that is not a full URL", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "abc.supabase.co",
      VITE_SUPABASE_ANON_KEY: VALID.VITE_SUPABASE_ANON_KEY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0]).toContain("VITE_SUPABASE_URL must be a full URL");
    }
  });

  it("reports a key that is missing or too short", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: VALID.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: "too-short",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0]).toContain("VITE_SUPABASE_ANON_KEY is missing or too short");
    }
  });

  it("reports both problems when both variables are missing", () => {
    const result = readEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(2);
  });
});
