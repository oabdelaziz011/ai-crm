import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogSearchVariants,
  catalogTokenSimilarity,
  catalogTypoProbes,
  expandCatalogQueryTerms,
  foldCatalogToken,
  rankCatalogProducts,
} from "./catalog-search-language.js";

describe("catalog search language", () => {
  it("folds Arabic letter classes and stuttered repeats without touching Latin doubles", () => {
    assert.equal(foldCatalogToken("سماعة"), "سماعه");
    assert.equal(foldCatalogToken("سممااعة"), "سممااعه");
    assert.equal(foldCatalogToken("Headphones"), "headphones");
    assert.equal(foldCatalogToken("coffee"), "coffee");
    assert.equal(foldCatalogToken("Kopfhörer"), "kopfhörer");
    assert.equal(foldCatalogToken("Kopfhörer"), "kopfhörer");
  });

  it("keeps a short reversible spelling set", () => {
    const variants = catalogSearchVariants("سممااعه");
    assert.ok(variants.includes("سماعه"));
    assert.ok(variants.includes("سماعة"));
    assert.ok(variants.length <= 8);
    assert.ok(variants.every((variant) => /^[\p{L}\p{N}-]+$/u.test(variant)));
  });

  it("probes a missing vowel without opening full edit distance", () => {
    const probes = catalogTypoProbes("hedphones");
    assert.ok(probes.includes("headphones"));
    assert.ok(probes.length <= 10);
  });

  it("ranks an exact SKU above a similar name", () => {
    const ranked = rankCatalogProducts(
      [
        { name: "WH-100 Case", sku: "CASE-1", brand: "", description: "", categoryName: null, tags: [] },
        { name: "Wireless Headphones", sku: "WH-100", brand: "Sonic", description: "", categoryName: "Audio", tags: [] },
      ],
      ["WH-100"],
    );
    assert.deepEqual(ranked.map((row) => row.sku), ["WH-100"]);
  });

  it("expands clinic-system colloquial terms for ranking/search", () => {
    const expanded = expandCatalogQueryTerms(["سيستم", "عيادات"]);
    assert.ok(expanded.includes("سيستم"));
    assert.ok(expanded.includes("عيادات"));
    assert.ok(expanded.includes("عياده") || expanded.includes("عيادة"));
    assert.ok(expanded.includes("نظام"));
    const ranked = rankCatalogProducts(
      [
        {
          name: "ValueOR Clinic OS",
          sku: "CLN-OS",
          brand: "",
          description: "نظام إدارة العيادات والمستشفيات",
          categoryName: "Software",
          tags: [],
          aliases: ["سيستم عيادات"],
        },
        {
          name: "Office Chair",
          sku: "CH-200",
          brand: "",
          description: "كرسي مكتب",
          categoryName: null,
          tags: [],
        },
      ],
      expanded,
    );
    assert.equal(ranked[0]?.sku, "CLN-OS");
  });

  it("keeps close name matches together and drops a weak one", () => {
    const ranked = rankCatalogProducts(
      [
        { name: "Wireless Headphones", sku: "WH-100", brand: "", description: "", categoryName: null, tags: [] },
        { name: "Wireless Headphones Studio", sku: "WH-300", brand: "", description: "", categoryName: null, tags: [] },
        { name: "Office Chair", sku: "CH-200", brand: "", description: "", categoryName: null, tags: [] },
      ],
      ["headphones"],
    );
    assert.deepEqual(
      ranked.map((row) => row.sku).sort(),
      ["WH-100", "WH-300"],
    );
    assert.ok(catalogTokenSimilarity("hedphones", "headphones") >= 0.84);
    assert.ok(catalogTokenSimilarity("hedphones", "chair") < 0.84);
  });
});
