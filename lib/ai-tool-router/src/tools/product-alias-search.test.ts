import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankCatalogProducts } from "./catalog-search-language.js";
import { isProductAliasSearchEnabled } from "./product-alias-search-flag.js";

describe("product alias search flag", () => {
  it("defaults to off", () => {
    assert.equal(isProductAliasSearchEnabled({}), false);
    assert.equal(isProductAliasSearchEnabled({ VALUEOR_PRODUCT_ALIAS_SEARCH: "" }), false);
    assert.equal(isProductAliasSearchEnabled({ VALUEOR_PRODUCT_ALIAS_SEARCH: "no" }), false);
  });

  it("enables for explicit truthy values", () => {
    assert.equal(isProductAliasSearchEnabled({ VALUEOR_PRODUCT_ALIAS_SEARCH: "1" }), true);
    assert.equal(isProductAliasSearchEnabled({ VALUEOR_PRODUCT_ALIAS_SEARCH: "true" }), true);
    assert.equal(isProductAliasSearchEnabled({ VALUEOR_PRODUCT_ALIAS_SEARCH: "ON" }), true);
  });

  it("does not throw when process is undefined and stays off", () => {
    const previous = globalThis.process;
    // Browser bundle: `process` is not declared. The no-arg call must not touch it.
    // @ts-expect-error test removes the Node global on purpose
    delete globalThis.process;
    try {
      assert.equal(isProductAliasSearchEnabled(), false);
    } finally {
      globalThis.process = previous;
    }
  });

  it("reads VALUEOR_PRODUCT_ALIAS_SEARCH from the server process when env is omitted", () => {
    const previous = process.env.VALUEOR_PRODUCT_ALIAS_SEARCH;
    process.env.VALUEOR_PRODUCT_ALIAS_SEARCH = "true";
    try {
      assert.equal(isProductAliasSearchEnabled(), true);
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_SEARCH;
      else process.env.VALUEOR_PRODUCT_ALIAS_SEARCH = previous;
    }
  });
});

describe("product alias ranking", () => {
  const base = {
    brand: "",
    description: "",
    categoryName: null as string | null,
    tags: [] as string[],
  };

  it("ranks an Arabic alias above an unrelated name", () => {
    const ranked = rankCatalogProducts(
      [
        {
          ...base,
          name: "Office Chair",
          sku: "CH-1",
          aliases: [],
        },
        {
          ...base,
          name: "ValueOR ERP",
          sku: "ERP-1",
          aliases: ["السيستم المحاسبي", "Accounting Suite"],
        },
      ],
      ["السيستم", "المحاسبي"],
    );
    assert.equal(ranked[0]?.sku, "ERP-1");
  });

  it("ranks English and German aliases", () => {
    const rankedEn = rankCatalogProducts(
      [
        { ...base, name: "Widget", sku: "W-1", aliases: [] },
        { ...base, name: "ValueOR ERP", sku: "ERP-1", aliases: ["Accounting Suite"] },
      ],
      ["accounting", "suite"],
    );
    assert.equal(rankedEn[0]?.sku, "ERP-1");

    const rankedDe = rankCatalogProducts(
      [
        { ...base, name: "Widget", sku: "W-1", aliases: [] },
        { ...base, name: "ValueOR ERP", sku: "ERP-1", aliases: ["Buchhaltung Pro"] },
      ],
      ["buchhaltung", "pro"],
    );
    assert.equal(rankedDe[0]?.sku, "ERP-1");
  });

  it("keeps close alias matches together instead of a single random winner", () => {
    const ranked = rankCatalogProducts(
      [
        { ...base, name: "CRM Alpha", sku: "A-1", aliases: ["Sales Desk"] },
        { ...base, name: "CRM Beta", sku: "B-1", aliases: ["Sales Desk Cloud"] },
        { ...base, name: "Chair", sku: "C-1", aliases: [] },
      ],
      ["sales", "desk"],
    );
    assert.deepEqual(
      ranked.map((row) => row.sku).sort(),
      ["A-1", "B-1"],
    );
  });

  it("still ranks by original name when aliases are empty", () => {
    const ranked = rankCatalogProducts(
      [
        { ...base, name: "Wireless Headphones", sku: "WH-100", aliases: [] },
        { ...base, name: "Office Chair", sku: "CH-200", aliases: [] },
      ],
      ["headphones"],
    );
    assert.equal(ranked[0]?.sku, "WH-100");
  });
});
