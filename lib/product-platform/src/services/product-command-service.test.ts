import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogProductRecord, OpportunityLineItemRecord, ProductRepository } from "../repositories/product-repository-port.js";
import { ProductCommandService } from "./product-command-service.js";

const product: CatalogProductRecord = {
  id: "prod-1",
  companyId: "company-1",
  categoryId: null,
  productType: "product",
  name: "Widget",
  sku: "W-1",
  brand: null,
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
  createdAt: "",
  updatedAt: "",
};

function createRepository(overrides: Partial<ProductRepository> = {}): ProductRepository {
  let savedLine: OpportunityLineItemRecord | null = null;

  const base: ProductRepository = {
    createCategory: async () => {
      throw new Error("not implemented");
    },
    updateCategory: async () => {
      throw new Error("not implemented");
    },
    listCategories: async () => [],
    getCategory: async () => null,
    createProduct: async () => product,
    updateProduct: async () => product,
    softDeleteProduct: async () => {},
    getProduct: async () => product,
    listProducts: async () => ({ items: [product], total: 1 }),
    listRegionalPrices: async () => [
      {
        id: "rp-1",
        companyId: "company-1",
        productId: "prod-1",
        country: "SA",
        market: null,
        region: null,
        localPrice: 375,
        currencyOverride: "SAR",
        isActive: true,
        createdAt: "",
        updatedAt: "",
      },
    ],
    upsertRegionalPrice: async () => {
      throw new Error("not implemented");
    },
    listBundleItems: async () => [],
    setBundleItems: async () => [],
    listOpportunityLines: async () => [],
    getOpportunityLine: async () => null,
    getOpportunityCurrency: async () => "EGP",
    upsertOpportunityLine: async (input) => {
      savedLine = {
        id: "line-1",
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        productId: input.productId,
        productNameSnapshot: input.productNameSnapshot,
        skuSnapshot: input.skuSnapshot,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent,
        taxPercent: input.taxPercent,
        currency: input.currency,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        total: input.total,
        sortOrder: input.sortOrder ?? 0,
        createdAt: "",
        updatedAt: "",
      };
      return savedLine;
    },
    removeOpportunityLine: async () => {},
    addHistory: async () => {
      throw new Error("not implemented");
    },
    listHistory: async () => [],
  };

  const repo = { ...base, ...overrides };
  return Object.assign(repo, {
    getSavedLine: () => savedLine,
  }) as ProductRepository & { getSavedLine: () => OpportunityLineItemRecord | null };
}

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: true,
  hasPermission: () => true,
};

describe("ProductCommandService.attachProductToOpportunity", () => {
  it("stores opportunity currency on line items even when regional pricing uses another code", async () => {
    const products = createRepository();
    const service = new ProductCommandService({
      products,
      events: {
        async publishCreated() {},
        async publishUpdated() {},
        async publishArchived() {},
        async publishPriceChanged() {},
        async publishCategoryChanged() {},
        async publishOpportunityProductsAdded() {},
      },
    });

    const result = await service.attachProductToOpportunity(ctx, {
      companyId: "company-1",
      opportunityId: "opp-1",
      productId: "prod-1",
      country: "SA",
    });

    assert.equal(result.line.currency, "EGP");
    assert.equal(result.line.unitPrice, 375);
    assert.equal((products as ReturnType<typeof createRepository>).getSavedLine()?.currency, "EGP");
  });

  it("writes product_attached opportunity history", async () => {
    const history: Array<Record<string, unknown>> = [];
    const products = createRepository();
    const service = new ProductCommandService({
      products,
      events: {
        async publishCreated() {},
        async publishUpdated() {},
        async publishArchived() {},
        async publishPriceChanged() {},
        async publishCategoryChanged() {},
        async publishOpportunityProductsAdded() {},
      },
      opportunityHistory: {
        addHistory: async (input) => {
          history.push({ ...input });
        },
      },
    });

    await service.attachProductToOpportunity(ctx, {
      companyId: "company-1",
      opportunityId: "opp-1",
      productId: "prod-1",
      quantity: 2,
    });

    assert.equal(history.length, 1);
    assert.equal(history[0]?.eventType, "product_attached");
    assert.match(String(history[0]?.summary), /Widget/);
    assert.match(String(history[0]?.summary), /Qty:/);
  });
});

describe("ProductCommandService alias generation scheduling", () => {
  const noopEvents = {
    async publishCreated() {},
    async publishUpdated() {},
    async publishArchived() {},
    async publishPriceChanged() {},
    async publishCategoryChanged() {},
    async publishOpportunityProductsAdded() {},
  };

  it("schedules generation after create when flag is on", async () => {
    const previous = process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = "true";
    const scheduled: Array<Record<string, unknown>> = [];
    try {
      const products = createRepository({
        createProduct: async (input) => ({
          ...product,
          id: "prod-new",
          name: input.name,
          description: input.description ?? "",
          metadata: (input.metadata as Record<string, unknown>) ?? {},
          aliases: input.aliases ?? [],
        }),
        addHistory: async () => ({
          id: "h1",
          companyId: "company-1",
          productId: "prod-new",
          eventType: "product_created",
          fieldName: null,
          previousValue: null,
          newValue: null,
          summary: "",
          payload: {},
          actorUserId: null,
          createdAt: "",
        }),
      });
      const service = new ProductCommandService({
        products,
        events: noopEvents,
        aliasGeneration: {
          schedule(job) {
            scheduled.push({ ...job });
          },
        },
      });

      await service.createProduct(ctx, {
        companyId: "company-1",
        name: "Accounting Module",
        sku: "ACC-1",
        description: "Invoices and expenses",
      });

      assert.equal(scheduled.length, 1);
      assert.equal(scheduled[0]?.productId, "prod-new");
      assert.ok(typeof scheduled[0]?.fingerprint === "string");
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
      else process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = previous;
    }
  });

  it("does not schedule when only aliases change", async () => {
    const previous = process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = "true";
    const scheduled: unknown[] = [];
    try {
      const products = createRepository({
        getProduct: async () => product,
        updateProduct: async () => ({ ...product, aliases: ["Manual"] }),
        addHistory: async () => ({
          id: "h1",
          companyId: "company-1",
          productId: "prod-1",
          eventType: "product_updated",
          fieldName: null,
          previousValue: null,
          newValue: null,
          summary: "",
          payload: {},
          actorUserId: null,
          createdAt: "",
        }),
      });
      const service = new ProductCommandService({
        products,
        events: noopEvents,
        aliasGeneration: {
          schedule() {
            scheduled.push(true);
          },
        },
      });

      await service.updateProduct(ctx, {
        companyId: "company-1",
        productId: "prod-1",
        aliases: ["Manual alias"],
      });

      assert.equal(scheduled.length, 0);
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
      else process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = previous;
    }
  });

  it("does not schedule when flag is off", async () => {
    const previous = process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    delete process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    const scheduled: unknown[] = [];
    try {
      const products = createRepository({
        createProduct: async (input) => ({
          ...product,
          name: input.name,
          metadata: (input.metadata as Record<string, unknown>) ?? {},
        }),
        addHistory: async () => ({
          id: "h1",
          companyId: "company-1",
          productId: "prod-1",
          eventType: "product_created",
          fieldName: null,
          previousValue: null,
          newValue: null,
          summary: "",
          payload: {},
          actorUserId: null,
          createdAt: "",
        }),
      });
      const service = new ProductCommandService({
        products,
        events: noopEvents,
        aliasGeneration: {
          schedule() {
            scheduled.push(true);
          },
        },
      });

      await service.createProduct(ctx, {
        companyId: "company-1",
        name: "Accounting Module",
        sku: "ACC-2",
      });

      assert.equal(scheduled.length, 0);
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
      else process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = previous;
    }
  });

  it("regenerateProductAliases sets pending and schedules without content change", async () => {
    const previous = process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = "true";
    const scheduled: Array<Record<string, unknown>> = [];
    try {
      const failedProduct = {
        ...product,
        metadata: {
          aliasGeneration: {
            status: "failed",
            fingerprint: "old",
            requestedAt: "2026-01-01T00:00:00.000Z",
            errorCode: "provider_error",
          },
        },
      };
      const products = createRepository({
        getProduct: async () => failedProduct,
        updateProduct: async (input) => ({
          ...failedProduct,
          metadata: (input.metadata as Record<string, unknown>) ?? failedProduct.metadata,
        }),
      });
      const service = new ProductCommandService({
        products,
        events: noopEvents,
        aliasGeneration: {
          schedule(job) {
            scheduled.push({ ...job });
          },
        },
      });

      const { product: updated } = await service.regenerateProductAliases(ctx, {
        companyId: "company-1",
        productId: "prod-1",
      });

      assert.equal(scheduled.length, 1);
      assert.equal((updated.metadata as { aliasGeneration?: { status?: string } }).aliasGeneration?.status, "pending");
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_GENERATION;
      else process.env.VALUEOR_PRODUCT_ALIAS_GENERATION = previous;
    }
  });
});
