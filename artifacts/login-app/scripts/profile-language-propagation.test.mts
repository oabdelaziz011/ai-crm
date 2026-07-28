/**
 * Regression: profile language propagation after P5 auth-context split.
 * Run: npm run test:profile-language-propagation
 */
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { Window } from "happy-dom";
import {
  authBootstrapProfilesEqual,
  normalizeAuthBootstrapProfile,
} from "../src/lib/auth/normalize-auth-bootstrap-profile";
import { parseRpcPayloadForTest } from "../src/lib/auth/parse-auth-rpc-payload";
import { MY_PROFILE_KEY } from "../src/hooks/use-my-profile";
import { writeMyProfileCache } from "../src/lib/react-query/seed-auth-cache";
import {
  LANGUAGE_STORAGE_KEY,
  resolveAppLanguage,
} from "../src/lib/i18n/resolve-app-language";
import type { MyProfile } from "../src/lib/types";

const win = new Window();
(globalThis as { window?: Window; localStorage?: Storage; navigator?: Navigator }).window = win;
(globalThis as { window?: Window; localStorage?: Storage; navigator?: Navigator }).localStorage =
  win.localStorage;

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "en-US" },
});

const i18n = (await import("../src/i18n")).default;

async function simulatePreferredLanguageSync(profilePreferred: string | null) {
  const resolved = resolveAppLanguage(profilePreferred);
  if (i18n.resolvedLanguage !== resolved) {
    await i18n.changeLanguage(resolved);
  }
}

console.log("\nProfile language propagation regression\n");

// 1. RPC payload includes preference fields
const rpcPayload = {
  profile: {
    id: "user-1",
    company_id: "company-1",
    full_name: "Alex",
    is_super_admin: false,
    preferred_language: "ar",
    timezone: "Asia/Riyadh",
    avatar_url: "https://example.com/avatar.png",
  },
  company: null,
  roles: [],
  permissions: [],
};

const parsed = parseRpcPayloadForTest(rpcPayload);
assert.equal(parsed.profile?.preferred_language, "ar", "RPC profile includes preferred_language");
assert.equal(parsed.profile?.timezone, "Asia/Riyadh");
assert.equal(parsed.profile?.avatar_url, "https://example.com/avatar.png");
console.log("  ✓ load_user_auth_context RPC profile fields normalized");

// 2. Auth profile equality detects language change (refreshAuthContext update path)
const before = normalizeAuthBootstrapProfile({ ...rpcPayload.profile, preferred_language: "en" });
const after = normalizeAuthBootstrapProfile({ ...rpcPayload.profile, preferred_language: "ar" });
assert.ok(before && after);
assert.equal(authBootstrapProfilesEqual(before, after), false, "language change detected");
assert.equal(authBootstrapProfilesEqual(after, after), true, "unchanged profile preserved");
console.log("  ✓ Auth UserContext profile equality detects preferred_language change");

// 3. Mutation writes React Query cache immediately (setQueryData + invalidate)
const qc = new QueryClient();
const updatedProfile: MyProfile = {
  id: "user-1",
  user_id: "user-1",
  company_id: "company-1",
  email: "alex@example.com",
  full_name: "Alex",
  avatar_url: null,
  job_title: null,
  preferred_language: "ar",
  timezone: "UTC",
  is_super_admin: false,
  is_active: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date().toISOString(),
  company: { id: "company-1", name: "Acme" },
};

writeMyProfileCache(qc, updatedProfile);
const cached = qc.getQueryData<MyProfile>(MY_PROFILE_KEY);
assert.equal(cached?.preferred_language, "ar", "RQ cache updated synchronously");
console.log("  ✓ useUpdateMyProfile cache path: setQueryData then invalidate");

// 4. usePreferredLanguageSync path via UserContext profile (no useMyProfile)
localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
await i18n.changeLanguage("en");
await simulatePreferredLanguageSync(parsed.profile?.preferred_language ?? null);
assert.equal(i18n.language, "ar", "i18n switches when Auth profile has ar");
assert.equal(localStorage.getItem(LANGUAGE_STORAGE_KEY), "ar");
console.log("  ✓ usePreferredLanguageSync + UserContext preferred_language → i18n");

// 5. Simulated post-save refreshAuthContext with updated RPC payload
const refreshedPayload = parseRpcPayloadForTest({
  ...rpcPayload,
  profile: { ...rpcPayload.profile, preferred_language: "en" },
});
await simulatePreferredLanguageSync(refreshedPayload.profile?.preferred_language ?? null);
assert.equal(i18n.language, "en", "refreshAuthContext RPC payload updates i18n");
console.log("  ✓ refreshAuthContext with RPC preferred_language propagates to i18n");

console.log("\nAll profile language propagation checks passed.\n");
