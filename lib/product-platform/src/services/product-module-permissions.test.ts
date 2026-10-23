import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductRepository } from "../repositories/product-repository-port.js";
import type { CatalogProductRecord, ProductServiceContext } from "../types.js";
import { ProductPermissionError } from "../errors.js";
import { ProductCommandService } from "./product-command-service.js";
import { ProductQueryService } from "./product-query-service.js";

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
  cost: 40,
  marginPercent: 60,
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

function repository(): ProductRepository {
  return {
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
    listRegionalPrices: async () => [],
    upsertRegionalPrice: async () => {
      throw new Error("not implemented");
    },
    listBundleItems: async () => [],
    setBundleItems: async () => [],
    listOpportunityLines: async () => [],
    getOpportunityLine: async () => null,
    getOpportunityCurrency: async () => "USD",
    upsertOpportunityLine: async () => {
      throw new Error("not implemented");
    },
    removeOpportunityLine: async () => {},
    addHistory: async () => {},
    listHistory: async () => [],
  };
}

function events() {
  return {
    async publishCreated() {},
    async publishUpdated() {},
    async publishArchived() {},
    async publishPriceChanged() {},
    async publishCategoryChanged() {},
    async publishOpportunityProductsAdded() {},
  };
}

function actor(permissions: readonly string[], companyId = "company-1"): ProductServiceContext {
  const allowed = new Set(permissions);
  return {
    userId: "user-1",
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) => allowed.has(code),
  };
}

describe("product module permissions", () => {
  it("requires products.view to list and rejects another company", async () => {
    const queries = new ProductQueryService({ products: repository() });
    await assert.rejects(
      () => queries.listProducts(actor([]), { companyId: "company-1" }),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("products.view"),
    );
    const listed = await queries.listProducts(actor(["products.view"]), { companyId: "company-1" });
    assert.equal(listed.total, 1);
    await assert.rejects(
      () => queries.getProduct(actor(["products.view", "products.edit", "products.delete"]), "company-2", "prod-1"),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("tenant"),
    );
  });

  it("does not treat AI price disclosure or a view grant as create, edit, pricing, or delete", async () => {
    const commands = new ProductCommandService({ products: repository(), events: events() });
    const createInput = { companyId: "company-1", name: "Widget", sku: "W-1" };

    await assert.rejects(
      () => commands.createProduct(actor(["products.view"]), createInput),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("products.create"),
    );
    await assert.rejects(
      () => commands.createProduct(actor(["showProductPrices"]), createInput),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("products.create"),
    );

    await assert.rejects(
      () => commands.updateProduct(actor(["products.edit"]), {
        companyId: "company-1",
        productId: "prod-1",
        basePrice: 80,
      }),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("products.pricing"),
    );

    const renamed = await commands.updateProduct(actor(["products.edit"]), {
      companyId: "company-1",
      productId: "prod-1",
      name: "Renamed",
    });
    assert.equal(renamed.product.id, "prod-1");

    await assert.rejects(
      () => commands.archiveProduct(actor(["products.view", "products.edit"]), {
        companyId: "company-1",
        productId: "prod-1",
      }),
      (error: unknown) => error instanceof ProductPermissionError && error.message.includes("products.delete"),
    );
  });
});
