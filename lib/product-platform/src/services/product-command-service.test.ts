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
  cost: null,
  marginPercent: null,
  isActive: true,
  subscriptionInterval: null,
  subscriptionPrice: null,
  trackInventory: false,
  stockQuantity: null,
  unit: "each",
  tags: [],
  imageUrls: [],
  documentUrls: [],
  metadata: {},
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
