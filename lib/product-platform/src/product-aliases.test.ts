import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isGenericProductAliasToken,
  normalizeProductAliases,
  readProductAliases,
} from "./product-aliases.js";

function foldKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, "");
}

describe("product aliases", () => {
  it("normalizes trim, dedupe, and fold-equivalent Arabic", () => {
    const aliases = normalizeProductAliases(["  CRM Pro  ", "crm pro", "نظام crm", "نظام CRM"]);
    assert.ok(aliases.includes("CRM Pro"));
    assert.ok(aliases.includes("نظام crm"));
    assert.ok(aliases.includes("نظام"));
    assert.equal(aliases.filter((entry) => foldKey(entry) === "crmpro").length, 1);
  });

  it("accepts multilingual trade names and indexes searchable tokens", () => {
    const aliases = normalizeProductAliases(["السيستم المحاسبي", "Accounting Suite", "Buchhaltung Pro"]);
    assert.ok(aliases.includes("السيستم المحاسبي"));
    assert.ok(aliases.includes("المحاسبي"));
    assert.ok(aliases.includes("Accounting Suite"));
    assert.ok(aliases.includes("accounting"));
    assert.ok(aliases.includes("suite"));
    assert.ok(aliases.includes("Buchhaltung Pro"));
    assert.ok(aliases.includes("buchhaltung"));
    assert.equal(aliases.includes("السيستم"), false);
    assert.equal(aliases.includes("pro"), false);
  });

  it("rejects bare generic tokens", () => {
    assert.equal(isGenericProductAliasToken("system"), true);
    assert.equal(isGenericProductAliasToken("السيستم"), true);
    assert.throws(() => normalizeProductAliases(["system"]), /too generic/i);
    assert.throws(() => normalizeProductAliases(["سيستم"]), /too generic/i);
  });

  it("allows multi-word phrases that include a generic word", () => {
    const aliases = normalizeProductAliases(["ValueOR system"]);
    assert.ok(aliases.includes("ValueOR system"));
    assert.ok(aliases.includes("valueor"));
    assert.equal(aliases.includes("system"), false);
  });

  it("treats missing or empty as empty list", () => {
    assert.deepEqual(normalizeProductAliases(undefined), []);
    assert.deepEqual(normalizeProductAliases([]), []);
    assert.deepEqual(readProductAliases(null), []);
    assert.deepEqual(readProductAliases(undefined), []);
  });

  it("soft-caps at max count instead of failing create/save", () => {
    const many = Array.from({ length: 120 }, (_, index) => `Alias phrase number ${index + 1}`);
    const aliases = normalizeProductAliases(many);
    assert.equal(aliases.length, 60);
    assert.ok(aliases[0]?.includes("1"));
  });

  it("read path stays resilient for unexpected rows", () => {
    assert.deepEqual(readProductAliases(["ok", 12, "", "ok"]), ["ok"]);
  });
});
