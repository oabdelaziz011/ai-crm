import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const localesRoot = join(here, "../../locales");

function extractObject(raw: string, marker: string): Record<string, unknown> {
  const i = raw.indexOf(marker);
  if (i < 0) throw new Error(`missing ${marker}`);
  const start = raw.indexOf("{", i);
  let depth = 0;
  for (let j = start; j < raw.length; j++) {
    const c = raw[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, j + 1)) as Record<string, unknown>;
    }
  }
  throw new Error(`unclosed ${marker}`);
}

function leafKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return leafKeys(value, path);
    }
    return [path];
  });
}

describe("customerImport locale parity", () => {
  it("keeps EN/AR customerImport keys in parity including company + template", () => {
    const en = extractObject(
      readFileSync(join(localesRoot, "en/common.json"), "utf8"),
      '"customerImport"',
    );
    const ar = extractObject(
      readFileSync(join(localesRoot, "ar/common.json"), "utf8"),
      '"customerImport"',
    );
    const enKeys = leafKeys(en).sort();
    const arKeys = leafKeys(ar).sort();
    assert.deepEqual(enKeys, arKeys);
    assert.ok(enKeys.includes("fields.companyName.label"));
    assert.ok(enKeys.includes("template.sheetCustomers"));
    assert.ok(enKeys.includes("template.exampleNameSara"));
  });

  it("keeps EN/AR forms.customer companyName keys in parity", () => {
    const enForms = extractObject(
      readFileSync(join(localesRoot, "en/common.json"), "utf8"),
      '"forms"',
    );
    const arForms = extractObject(
      readFileSync(join(localesRoot, "ar/common.json"), "utf8"),
      '"forms"',
    );
    const enCustomer = (enForms.customer ?? {}) as Record<string, unknown>;
    const arCustomer = (arForms.customer ?? {}) as Record<string, unknown>;
    for (const key of ["companyName", "companyNamePlaceholder", "companyNameHint"]) {
      assert.equal(typeof enCustomer[key], "string");
      assert.equal(typeof arCustomer[key], "string");
    }
  });
});
