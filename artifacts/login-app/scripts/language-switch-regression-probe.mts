/**
 * Regression guard: profile authority must not be overridden by stale cache after persist.
 * Run: npm run test:language-regression
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { resolveAppLanguage } from "../src/lib/i18n/resolve-app-language";

const win = new Window();
(globalThis as { window?: Window; localStorage?: Storage }).window = win;
(globalThis as { window?: Window; localStorage?: Storage }).localStorage = win.localStorage;

const i18n = (await import("../src/i18n")).default;

function syncFromProfile(profilePreferred: string | null) {
  const resolved = resolveAppLanguage(profilePreferred);
  if (i18n.resolvedLanguage !== resolved) {
    void i18n.changeLanguage(resolved);
  }
}

console.log("\nLanguage regression probe (profile authority)\n");

localStorage.setItem("app.language", "en");
await i18n.changeLanguage("en");

// User selects Arabic — Settings persists to DB first (simulated)
const profileAfterSave: "ar" = "ar";
syncFromProfile(profileAfterSave);
await new Promise((r) => setTimeout(r, 10));

assert.equal(i18n.language, "ar", "after DB persist + sync, language must stay ar");
assert.equal(i18n.t("billing.nav.overview"), "نظرة عامة");
assert.equal(localStorage.getItem("app.language"), "ar");

console.log("  ✓ Arabic persists after profile-first sync (no revert to en)\n");
