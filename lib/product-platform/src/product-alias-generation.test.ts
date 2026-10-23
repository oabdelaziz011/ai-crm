import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceGeneratedAliases,
  mergeProductAliases,
  parseAliasGenerationResponse,
  productAliasContentFingerprint,
  readAliasGenerationMeta,
  withAliasGenerationMeta,
  PRODUCT_ALIAS_GENERATION_MAX,
} from "./product-alias-generation.js";
import { isProductAliasGenerationEnabled } from "./product-alias-generation-flag.js";
import { detectProductAliasLanguages } from "./product-alias-language.js";
import { executeProductAliasGeneration } from "./services/product-alias-generation-service.js";
import type { CatalogProductRecord, ProductRepository } from "./repositories/product-repository-port.js";
import { displayProductAliases } from "./product-aliases.js";

function baseProduct(overrides: Partial<CatalogProductRecord> = {}): CatalogProductRecord {
  return {
    id: "prod-1",
    companyId: "company-1",
    categoryId: null,
    productType: "product",
    name: "Widget",
    sku: "W-1",
    brand: "",
    description: "",
    basePrice: 100,
    currency: "USD",
    taxClass: "standard",
    priceTaxMode: "inclusive",
    taxPercent: 0,
    cost: null,
    marginPercent: null,
    isActive: true,
    subscriptionInterval: null,
    subscriptionPrice: null,
    trackInventory: false,
    stockQuantity: null,
    unit: "each",
    tags: [],
    aliases: [],
    imageUrls: [],
    documentUrls: [],
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("product alias generation flag", () => {
  it("defaults to off", () => {
    assert.equal(isProductAliasGenerationEnabled({}), false);
    assert.equal(isProductAliasGenerationEnabled({ VALUEOR_PRODUCT_ALIAS_GENERATION: "no" }), false);
  });

  it("enables on true/1/on/yes", () => {
    assert.equal(isProductAliasGenerationEnabled({ VALUEOR_PRODUCT_ALIAS_GENERATION: "true" }), true);
    assert.equal(isProductAliasGenerationEnabled({ VALUEOR_PRODUCT_ALIAS_GENERATION: "1" }), true);
    assert.equal(isProductAliasGenerationEnabled({ VALUEOR_PRODUCT_ALIAS_GENERATION: "ON" }), true);
  });

  it("does not throw when called without env in a process-less runtime simulation", () => {
    // Mirrors the Vite browser call site: isProductAliasGenerationEnabled()
    // must not evaluate a default parameter of `process.env`.
    assert.doesNotThrow(() => {
      isProductAliasGenerationEnabled();
    });
  });
});

describe("product alias language detection", () => {
  it("detects Arabic product copy", () => {
    const result = detectProductAliasLanguages(
      "موديول الحسابات",
      "موديول لإدارة الفواتير والمصروفات والتقارير المالية.",
    );
    assert.equal(result.primary, "ar");
    assert.deepEqual(result.languages, ["ar"]);
  });

  it("detects English product copy", () => {
    const result = detectProductAliasLanguages(
      "Accounting Module",
      "A module for invoices, expenses, and financial reports.",
    );
    assert.equal(result.primary, "en");
    assert.deepEqual(result.languages, ["en"]);
  });

  it("detects German product copy", () => {
    const result = detectProductAliasLanguages(
      "Buchhaltungsmodul",
      "Ein Modul für Rechnungen, Ausgaben und finanzielle Berichte für die Miete.",
    );
    assert.equal(result.primary, "de");
    assert.ok(result.languages.includes("de"));
  });

  it("detects mixed Arabic + English product copy", () => {
    const result = detectProductAliasLanguages(
      "Accounting Module — موديول الحسابات",
      "Invoices and التقارير المالية.",
    );
    assert.equal(result.primary, "mixed");
    assert.ok(result.languages.includes("ar"));
    assert.ok(result.languages.includes("en"));
  });

  it("does not treat brand/SKU-like Latin alone as English when name is Arabic", () => {
    const result = detectProductAliasLanguages("موديول الحسابات", "إدارة الفواتير.");
    assert.equal(result.primary, "ar");
  });

  it("prefers description language when name and description disagree", () => {
    const result = detectProductAliasLanguages(
      "Accounting Module",
      "موديول لإدارة الفواتير والمصروفات والتقارير المالية.",
    );
    assert.equal(result.primary, "ar");
    assert.ok(result.languages.includes("ar"));
    assert.ok(result.languages.includes("en"));
  });
});

describe("parse and coerce alias generation output", () => {
  it("parses valid JSON aliases", () => {
    const parsed = parseAliasGenerationResponse(
      JSON.stringify({
        primaryLanguage: "ar",
        languages: ["ar"],
        aliases: ["موديول الحسابات", "برنامج الحسابات", "system"],
      }),
    );
    assert.equal(parsed.primaryLanguage, "ar");
    assert.ok(parsed.aliases.includes("موديول الحسابات"));
    assert.ok(!parsed.aliases.includes("system"));
  });

  it("salvages fenced JSON", () => {
    const parsed = parseAliasGenerationResponse(
      '```json\n{"primaryLanguage":"en","languages":["en"],"aliases":["Accounting","Accounting module"]}\n```',
    );
    assert.equal(parsed.primaryLanguage, "en");
    assert.ok(parsed.aliases.length >= 1);
  });

  it("rejects empty or invalid payloads", () => {
    assert.throws(() => parseAliasGenerationResponse("not-json"), /invalid_json|empty/);
    assert.throws(
      () => parseAliasGenerationResponse(JSON.stringify({ primaryLanguage: "en", aliases: [] })),
      /empty_aliases/,
    );
    assert.throws(
      () => parseAliasGenerationResponse(JSON.stringify({ primaryLanguage: "en", aliases: ["system"] })),
      /empty_aliases/,
    );
  });

  it("caps generated aliases", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Alias Phrase ${i}`);
    const coerced = coerceGeneratedAliases(many);
    assert.ok(coerced.length <= PRODUCT_ALIAS_GENERATION_MAX);
  });

  it("drops exact product-name duplicates", () => {
    const coerced = coerceGeneratedAliases(["Accounting Module", "Accounting"], {
      productName: "Accounting Module",
    });
    assert.deepEqual(coerced, ["Accounting"]);
  });
});

describe("merge and fingerprint", () => {
  it("keeps existing aliases when merging generated ones", () => {
    const merged = mergeProductAliases(
      ["اسم يدوي", "Accounting"],
      ["موديول الحسابات", "برنامج الحسابات", "system"],
      { productName: "موديول المحاسبة" },
    );
    const display = displayProductAliases(merged);
    assert.ok(display.includes("اسم يدوي"));
    assert.ok(display.includes("Accounting"));
    assert.ok(display.some((alias) => alias.includes("الحسابات")));
    assert.ok(!display.includes("system"));
  });

  it("changes fingerprint when name/description change, not when only aliases would", () => {
    const a = productAliasContentFingerprint({
      name: "Apartment for Rent",
      description: "Residential apartment for rent.",
      productType: "product",
      tags: ["rent"],
    });
    const b = productAliasContentFingerprint({
      name: "Apartment for Rent",
      description: "Residential apartment for rent.",
      productType: "product",
      tags: ["rent"],
    });
    const c = productAliasContentFingerprint({
      name: "Apartment for Sale",
      description: "Residential apartment for rent.",
      productType: "product",
      tags: ["rent"],
    });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("reads and writes generation metadata", () => {
    const meta = withAliasGenerationMeta(
      { other: 1 },
      {
        status: "pending",
        fingerprint: "abc",
        requestedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    assert.equal((meta as { other: number }).other, 1);
    const read = readAliasGenerationMeta(meta);
    assert.equal(read?.status, "pending");
    assert.equal(read?.fingerprint, "abc");
  });
});

describe("executeProductAliasGeneration", () => {
  it("merges Arabic AI aliases for an Arabic product", async () => {
    let saved: CatalogProductRecord | null = null;
    const product = baseProduct({
      name: "موديول الحسابات",
      description: "موديول لإدارة الفواتير والمصروفات والتقارير المالية.",
      aliases: ["اسم يدوي"],
      metadata: withAliasGenerationMeta(
        {},
        {
          status: "pending",
          fingerprint: productAliasContentFingerprint({
            name: "موديول الحسابات",
            description: "موديول لإدارة الفواتير والمصروفات والتقارير المالية.",
            productType: "product",
          }),
          requestedAt: "2026-01-01T00:00:00.000Z",
        },
      ),
    });
    const fingerprint = productAliasContentFingerprint(product);

    const products = {
      getProduct: async () => saved ?? product,
      getCategory: async () => null,
      updateProduct: async (input) => {
        saved = {
          ...product,
          ...(saved ?? {}),
          aliases: input.aliases ?? (saved ?? product).aliases,
          metadata: (input.metadata as Record<string, unknown>) ?? (saved ?? product).metadata,
        };
        return saved;
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: "user-1",
      },
      ai: {
        completeJson: async () =>
          JSON.stringify({
            primaryLanguage: "ar",
            languages: ["ar"],
            aliases: ["موديول الحسابات", "برنامج الحسابات", "محاسبة"],
          }),
      },
    });

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.ok(displayProductAliases(result.aliases).includes("اسم يدوي"));
    assert.ok(displayProductAliases(result.aliases).some((a) => /حساب|محاسب/.test(a)));
    assert.equal(readAliasGenerationMeta(saved?.metadata)?.status, "completed");
  });

  it("accepts English software aliases without inventing integrations in validator path", async () => {
    const product = baseProduct({
      name: "Accounting Module",
      description: "A module for invoices, expenses, and financial reports.",
    });
    const fingerprint = productAliasContentFingerprint(product);
    let savedAliases: string[] = [];
    const products = {
      getProduct: async () => product,
      getCategory: async () => null,
      updateProduct: async (input) => {
        savedAliases = input.aliases ?? [];
        return { ...product, aliases: savedAliases, metadata: input.metadata as Record<string, unknown> };
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () =>
          JSON.stringify({
            primaryLanguage: "en",
            languages: ["en"],
            aliases: ["Accounting", "Accounting module", "Invoicing module"],
          }),
      },
    });

    assert.equal(result.status, "completed");
    assert.ok(savedAliases.some((a) => /accounting/i.test(a)));
  });

  it("accepts German aliases for German product copy", async () => {
    const product = baseProduct({
      name: "Buchhaltungsmodul",
      description: "Ein Modul für Rechnungen und Ausgaben.",
    });
    const fingerprint = productAliasContentFingerprint(product);
    const products = {
      getProduct: async () => product,
      getCategory: async () => null,
      updateProduct: async (input) => ({
        ...product,
        aliases: input.aliases ?? [],
        metadata: input.metadata as Record<string, unknown>,
      }),
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () =>
          JSON.stringify({
            primaryLanguage: "de",
            languages: ["de"],
            aliases: ["Buchhaltung", "Rechnungsmodul"],
          }),
      },
    });
    assert.equal(result.status, "completed");
  });

  it("skips stale fingerprint writes", async () => {
    const product = baseProduct({
      name: "Apartment for Rent",
      description: "Residential apartment available for rent.",
    });
    let updateCalls = 0;
    const products = {
      getProduct: async () => product,
      getCategory: async () => null,
      updateProduct: async () => {
        updateCalls += 1;
        return product;
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint: "stale-fingerprint",
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () => {
          throw new Error("should not call AI for stale job");
        },
      },
    });

    assert.equal(result.status, "skipped_stale");
    assert.equal(updateCalls, 0);
  });

  it("skips inactive products and does not revive them", async () => {
    const product = baseProduct({ isActive: false });
    let updateCalls = 0;
    const products = {
      getProduct: async () => product,
      getCategory: async () => null,
      updateProduct: async () => {
        updateCalls += 1;
        return product;
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint: productAliasContentFingerprint(product),
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () => JSON.stringify({ primaryLanguage: "en", aliases: ["X"] }),
      },
    });

    assert.equal(result.status, "skipped_inactive");
    assert.equal(updateCalls, 0);
  });

  it("retries once after a transient provider failure", async () => {
    const product = baseProduct({
      name: "Accounting Module",
      description: "Invoices and expenses.",
    });
    const fingerprint = productAliasContentFingerprint(product);
    let saved = product;
    let calls = 0;
    const products = {
      getProduct: async () => saved,
      getCategory: async () => null,
      updateProduct: async (input) => {
        saved = {
          ...saved,
          aliases: input.aliases ?? saved.aliases,
          metadata: (input.metadata as Record<string, unknown>) ?? saved.metadata,
        };
        return saved;
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () => {
          calls += 1;
          if (calls === 1) throw new Error("connection reset");
          return JSON.stringify({
            primaryLanguage: "en",
            languages: ["en"],
            aliases: ["Invoice Module", "Expense Tracker"],
          });
        },
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(calls, 2);
    assert.ok(saved.aliases.includes("Invoice Module"));
  });

  it("keeps existing aliases when provider fails", async () => {
    const product = baseProduct({
      name: "Apartment for Rent",
      description: "Residential apartment available for rent.",
      aliases: ["شقة للإيجار"],
      metadata: {},
    });
    const fingerprint = productAliasContentFingerprint(product);
    let saved = product;
    const products = {
      getProduct: async () => saved,
      getCategory: async () => null,
      updateProduct: async (input) => {
        saved = {
          ...saved,
          aliases: input.aliases ?? saved.aliases,
          metadata: (input.metadata as Record<string, unknown>) ?? saved.metadata,
        };
        return saved;
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () => {
          throw new Error("timeout");
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.deepEqual(saved.aliases, ["شقة للإيجار"]);
    assert.equal(readAliasGenerationMeta(saved.metadata)?.status, "failed");
  });

  it("handles real-estate rent wording without requiring sale aliases", async () => {
    const product = baseProduct({
      name: "Apartment for Rent",
      description: "Residential apartment available for rent.",
    });
    const fingerprint = productAliasContentFingerprint(product);
    let savedAliases: string[] = [];
    const products = {
      getProduct: async () => product,
      getCategory: async () => null,
      updateProduct: async (input) => {
        savedAliases = input.aliases ?? [];
        return { ...product, aliases: savedAliases, metadata: input.metadata as Record<string, unknown> };
      },
    } as unknown as ProductRepository;

    const result = await executeProductAliasGeneration({
      products,
      job: {
        companyId: "company-1",
        productId: "prod-1",
        fingerprint,
        requestedAt: "2026-01-01T00:00:00.000Z",
        actorUserId: null,
      },
      ai: {
        completeJson: async () =>
          JSON.stringify({
            primaryLanguage: "en",
            languages: ["en"],
            aliases: ["Apartment rental", "Apartment for rent", "Rental apartment"],
          }),
      },
    });

    assert.equal(result.status, "completed");
    assert.ok(savedAliases.some((a) => /rent/i.test(a)));
    assert.ok(!savedAliases.some((a) => /for sale|للبيع/i.test(a)));
  });
});
