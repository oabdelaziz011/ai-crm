/**
 * Verifies profile-first language authority model.
 * Run: npm run test:language-authority
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  LANGUAGE_STORAGE_KEY,
  cacheAppLanguage,
  resolveAppLanguage,
  resolveBootstrapAppLanguage,
} from "../src/lib/i18n/resolve-app-language";

const win = new Window();
(globalThis as { window?: Window; document?: Document; localStorage?: Storage; navigator?: Navigator }).window =
  win;
(globalThis as { window?: Window; document?: Document; localStorage?: Storage; navigator?: Navigator }).document =
  win.document;
(globalThis as { window?: Window; document?: Document; localStorage?: Storage; navigator?: Navigator }).localStorage =
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
  } else {
    cacheAppLanguage(resolved);
  }
}

console.log("\nLanguage authority tests\n");

localStorage.clear();

// Cascade: null profile → cache → browser → default
cacheAppLanguage("ar");
assert.equal(resolveAppLanguage(null), "ar", "null profile uses localStorage cache");
localStorage.clear();
assert.equal(resolveAppLanguage(null), "en", "null profile + no cache uses browser en");

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "ar-EG" },
});
localStorage.clear();
assert.equal(resolveAppLanguage(null), "ar", "null profile uses browser ar");

// Database authority overrides cache
localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
assert.equal(resolveAppLanguage("ar"), "ar", "profile ar beats cache en");

// Bootstrap before profile
localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
assert.equal(resolveBootstrapAppLanguage(), "ar");

console.log("  ✓ resolveAppLanguage cascade");

// Settings flow: persist ar to profile, sync applies UI
localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
await i18n.changeLanguage("en");

async function persistPreferredLanguage(preferred: "en" | "ar") {
  // Simulates successful update_my_profile + invalidateQueries
  return preferred;
}

const persisted = await persistPreferredLanguage("ar");
await simulatePreferredLanguageSync(persisted);

assert.equal(i18n.language, "ar");
assert.equal(localStorage.getItem(LANGUAGE_STORAGE_KEY), "ar");
assert.equal(i18n.t("billing.nav.overview"), "نظرة عامة");
console.log("  ✓ settings persist → sync → Arabic UI");

// Page refresh: bootstrap from cache, then profile confirms
localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
const bootLang = resolveBootstrapAppLanguage();
await i18n.changeLanguage(bootLang);
await simulatePreferredLanguageSync("ar");
assert.equal(i18n.language, "ar");
console.log("  ✓ refresh: cache bootstrap + profile confirm");

// Cross-device: empty cache, bootstrap en, profile ar from DB
localStorage.clear();
await i18n.changeLanguage(resolveBootstrapAppLanguage());
await simulatePreferredLanguageSync("ar");
assert.equal(i18n.language, "ar");
assert.equal(localStorage.getItem(LANGUAGE_STORAGE_KEY), "ar");
console.log("  ✓ cross-device: profile ar seeds empty cache");

// English path
await simulatePreferredLanguageSync("en");
assert.equal(i18n.language, "en");
assert.equal(i18n.t("billing.nav.overview"), "Overview");
console.log("  ✓ English profile works");

// NULL profile does NOT coerce to en when cache is ar
localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
await simulatePreferredLanguageSync(null);
assert.equal(i18n.language, "ar", "null DB falls through to cache, not forced en");
console.log("  ✓ null preferred_language does not normalize to en");

console.log("\nAll language authority checks passed.\n");
