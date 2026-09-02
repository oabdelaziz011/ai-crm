import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/**
 * Node port of edge validation (Deno not required in CI host).
 * Mirrors supabase/functions/reset-company-admin-password/validation.ts
 */
function validatePasswordPair(password: string, confirmPassword: string) {
  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { ok: false as const, code: "password_invalid" as const };
  }
  if (password !== confirmPassword) {
    return { ok: false as const, code: "password_mismatch" as const };
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false as const, code: "password_policy" as const };
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLower || !hasUpper || !hasDigit) {
    return { ok: false as const, code: "password_policy" as const };
  }
  return { ok: true as const };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

const here = dirname(fileURLToPath(import.meta.url));

describe("reset-company-admin-password validation (node mirror)", () => {
  it("stays in sync with edge validation.ts source", () => {
    const edge = readFileSync(
      resolve(here, "../supabase/functions/reset-company-admin-password/validation.ts"),
      "utf8",
    );
    assert.match(edge, /password\.length < 8/);
    assert.match(edge, /password_mismatch/);
    assert.match(edge, /hasLower/);
    assert.match(edge, /hasUpper/);
    assert.match(edge, /hasDigit/);
  });

  it("rejects weak / mismatched passwords", () => {
    assert.deepEqual(validatePasswordPair("Abcdefg1", "Abcdefg2"), {
      ok: false,
      code: "password_mismatch",
    });
    assert.equal(validatePasswordPair("short1A", "short1A").ok, false);
    assert.deepEqual(validatePasswordPair("alllowercase1", "alllowercase1"), {
      ok: false,
      code: "password_policy",
    });
    assert.deepEqual(validatePasswordPair("TempReset2026!", "TempReset2026!"), { ok: true });
    assert.equal(isUuid("d4fdae9a-bb72-4bae-903c-cb4b971d18a8"), true);
    assert.equal(isUuid("nope"), false);
  });
});

// silence unused require helper for future live imports
void createRequire;
