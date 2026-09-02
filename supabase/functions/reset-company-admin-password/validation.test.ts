import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isUuid, validatePasswordPair } from "./validation.ts";

Deno.test("validatePasswordPair rejects mismatch", () => {
  assertEquals(validatePasswordPair("Abcdefg1", "Abcdefg2"), {
    ok: false,
    code: "password_mismatch",
  });
});

Deno.test("validatePasswordPair rejects weak passwords", () => {
  assertEquals(validatePasswordPair("short1A", "short1A").ok, false);
  assertEquals(validatePasswordPair("alllowercase1", "alllowercase1"), {
    ok: false,
    code: "password_policy",
  });
  assertEquals(validatePasswordPair("ALLUPPERCASE1", "ALLUPPERCASE1"), {
    ok: false,
    code: "password_policy",
  });
  assertEquals(validatePasswordPair("NoDigitsHere", "NoDigitsHere"), {
    ok: false,
    code: "password_policy",
  });
});

Deno.test("validatePasswordPair accepts strong matching passwords", () => {
  assertEquals(validatePasswordPair("TempReset2026!", "TempReset2026!"), { ok: true });
});

Deno.test("isUuid accepts only uuid strings", () => {
  assertEquals(isUuid("d4fdae9a-bb72-4bae-903c-cb4b971d18a8"), true);
  assertEquals(isUuid("not-a-uuid"), false);
  assertEquals(isUuid(null), false);
});
