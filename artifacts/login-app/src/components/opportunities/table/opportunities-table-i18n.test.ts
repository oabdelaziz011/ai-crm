import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const localesRoot = join(here, "../../../locales");

function readLocale(lang: "en" | "ar"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(localesRoot, lang, "common.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

function getPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, root);
}

const REQUIRED_KEYS = [
  "opportunities.table.permissionTitle",
  "opportunities.table.columns.opportunity",
  "opportunities.table.columns.product",
  "opportunities.table.fallbacks.noCustomer",
  "opportunities.table.fallbacks.noProduct",
  "opportunities.table.lostDialog.reasonLabel",
  "opportunities.table.errors.lostReasonRequired",
  "opportunities.table.pagination.next",
  "opportunities.nav.table",
  "leads.table.rowActions.completeDemo",
];

describe("opportunities table EN/AR labels", () => {
  it("includes required English and Arabic strings", () => {
    const en = readLocale("en");
    const ar = readLocale("ar");
    for (const key of REQUIRED_KEYS) {
      const enValue = getPath(en, key);
      const arValue = getPath(ar, key);
      assert.equal(typeof enValue, "string", `missing EN ${key}`);
      assert.equal(typeof arValue, "string", `missing AR ${key}`);
      assert.ok(String(enValue).trim().length > 0, `empty EN ${key}`);
      assert.ok(String(arValue).trim().length > 0, `empty AR ${key}`);
    }
  });

  it("labels the single Opportunities tab Opportunities / فرص", () => {
    const en = readLocale("en");
    const ar = readLocale("ar");
    assert.equal(getPath(en, "opportunities.nav.table"), "Opportunities");
    assert.equal(getPath(ar, "opportunities.nav.table"), "فرص");
  });
});
