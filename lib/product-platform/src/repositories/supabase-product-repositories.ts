import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogProductRecord,
  OpportunityLineItemRecord,
  ProductBundleItemRecord,
  ProductCategoryRecord,
  ProductHistoryRecord,
  ProductRegionalPriceRecord,
  ProductType,
  SubscriptionInterval,
} from "../types.js";
import type {
  CreateProductInput,
  ProductRepository,
  UpdateProductInput,
} from "./product-repository-port.js";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCategory(row: Record<string, unknown>): ProductCategoryRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProduct(row: Record<string, unknown>): CatalogProductRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    productType: String(row.product_type) as ProductType,
    name: String(row.name),
    sku: String(row.sku),
    brand: String(row.brand ?? ""),
    description: String(row.description ?? ""),
    basePrice: Number(row.base_price ?? 0),
    currency: String(row.currency ?? "USD"),
    taxClass: String(row.tax_class ?? "standard"),
    cost: num(row.cost),
    marginPercent: num(row.margin_percent),
    isActive: Boolean(row.is_active),
    subscriptionInterval: row.subscription_interval
      ? (String(row.subscription_interval) as SubscriptionInterval)
      : null,
    subscriptionPrice: num(row.subscription_price),
    trackInventory: Boolean(row.track_inventory),
    stockQuantity: num(row.stock_quantity),
    unit: String(row.unit ?? "each"),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : [],
    documentUrls: Array.isArray(row.document_urls) ? row.document_urls.map(String) : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRegional(row: Record<string, unknown>): ProductRegionalPriceRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productId: String(row.product_id),
    country: row.country != null ? String(row.country) : null,
    market: row.market != null ? String(row.market) : null,
    region: row.region != null ? String(row.region) : null,
    localPrice: Number(row.local_price ?? 0),
    currencyOverride: row.currency_override != null ? String(row.currency_override) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapBundle(row: Record<string, unknown>): ProductBundleItemRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    bundleProductId: String(row.bundle_product_id),
    componentProductId: String(row.component_product_id),
    quantity: Number(row.quantity ?? 1),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapLine(row: Record<string, unknown>): OpportunityLineItemRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    opportunityId: String(row.opportunity_id),
    productId: String(row.product_id),
    productNameSnapshot: String(row.product_name_snapshot),
    skuSnapshot: String(row.sku_snapshot ?? ""),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    discountPercent: Number(row.discount_percent ?? 0),
    taxPercent: Number(row.tax_percent ?? 0),
    currency: String(row.currency ?? "USD"),
    subtotal: Number(row.subtotal ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    total: Number(row.total ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHistory(row: Record<string, unknown>): ProductHistoryRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productId: String(row.product_id),
    eventType: String(row.event_type),
    fieldName: row.field_name != null ? String(row.field_name) : null,
    previousValue: row.previous_value != null ? String(row.previous_value) : null,
    newValue: row.new_value != null ? String(row.new_value) : null,
    summary: String(row.summary ?? ""),
    payload: (row.payload as Record<string, unknown>) ?? {},
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    createdAt: String(row.created_at),
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "category";
}

export function createSupabaseProductRepository(client: SupabaseClient): ProductRepository {
  return {
    async createCategory(input) {
      const slug = input.slug?.trim() || slugify(input.name);
      const { data, error } = await client
        .from("product_categories")
        .insert({
          company_id: input.companyId,
          parent_id: input.parentId ?? null,
          name: input.name.trim(),
          slug,
          description: input.description ?? "",
          sort_order: input.sortOrder ?? 0,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapCategory(data as Record<string, unknown>);
    },

    async updateCategory(input) {
      const patch: Record<string, unknown> = {
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.parentId !== undefined) patch.parent_id = input.parentId;
      if (input.description !== undefined) patch.description = input.description;
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      const { data, error } = await client
        .from("product_categories")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.categoryId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapCategory(data as Record<string, unknown>);
    },

    async listCategories(companyId) {
      const { data, error } = await client
        .from("product_categories")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
    },

    async getCategory(companyId, categoryId) {
      const { data, error } = await client
        .from("product_categories")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", categoryId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCategory(data as Record<string, unknown>) : null;
    },

    async createProduct(input) {
      const { data, error } = await client
        .from("catalog_products")
        .insert({
          company_id: input.companyId,
          category_id: input.categoryId ?? null,
          product_type: input.productType,
          name: input.name.trim(),
          sku: input.sku.trim(),
          brand: input.brand ?? "",
          description: input.description ?? "",
          base_price: input.basePrice,
          currency: input.currency ?? "USD",
          tax_class: input.taxClass ?? "standard",
          cost: input.cost ?? null,
          margin_percent: input.marginPercent ?? null,
          is_active: input.isActive ?? true,
          subscription_interval: input.subscriptionInterval ?? null,
          subscription_price: input.subscriptionPrice ?? null,
          track_inventory: input.trackInventory ?? false,
          stock_quantity: input.stockQuantity ?? null,
          unit: input.unit ?? "each",
          tags: input.tags ?? [],
          image_urls: input.imageUrls ?? [],
          document_urls: input.documentUrls ?? [],
          metadata: input.metadata ?? {},
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapProduct(data as Record<string, unknown>);
    },

    async updateProduct(input: UpdateProductInput) {
      const patch: Record<string, unknown> = {
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      };
      if (input.categoryId !== undefined) patch.category_id = input.categoryId;
      if (input.productType !== undefined) patch.product_type = input.productType;
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.sku !== undefined) patch.sku = input.sku.trim();
      if (input.brand !== undefined) patch.brand = input.brand;
      if (input.description !== undefined) patch.description = input.description;
      if (input.basePrice !== undefined) patch.base_price = input.basePrice;
      if (input.currency !== undefined) patch.currency = input.currency;
      if (input.taxClass !== undefined) patch.tax_class = input.taxClass;
      if (input.cost !== undefined) patch.cost = input.cost;
      if (input.marginPercent !== undefined) patch.margin_percent = input.marginPercent;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (input.subscriptionInterval !== undefined) patch.subscription_interval = input.subscriptionInterval;
      if (input.subscriptionPrice !== undefined) patch.subscription_price = input.subscriptionPrice;
      if (input.trackInventory !== undefined) patch.track_inventory = input.trackInventory;
      if (input.stockQuantity !== undefined) patch.stock_quantity = input.stockQuantity;
      if (input.unit !== undefined) patch.unit = input.unit;
      if (input.tags !== undefined) patch.tags = input.tags;
      if (input.imageUrls !== undefined) patch.image_urls = input.imageUrls;
      if (input.documentUrls !== undefined) patch.document_urls = input.documentUrls;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      const { data, error } = await client
        .from("catalog_products")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.productId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapProduct(data as Record<string, unknown>);
    },

    async softDeleteProduct(companyId, productId, updatedBy) {
      const { error } = await client
        .from("catalog_products")
        .update({
          deleted_at: new Date().toISOString(),
          is_active: false,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", productId);
      if (error) throw error;
    },

    async getProduct(companyId, productId) {
      const { data, error } = await client
        .from("catalog_products")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", productId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProduct(data as Record<string, unknown>) : null;
    },

    async listProducts(input) {
      let query = client
        .from("catalog_products")
        .select("*", { count: "exact" })
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.categoryId) query = query.eq("category_id", input.categoryId);
      if (input.productType) query = query.eq("product_type", input.productType);
      if (input.activeOnly) query = query.eq("is_active", true);
      if (input.query?.trim()) {
        const q = `%${input.query.trim()}%`;
        query = query.or(`name.ilike.${q},sku.ilike.${q},brand.ilike.${q}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((r) => mapProduct(r as Record<string, unknown>)),
        total: count ?? 0,
      };
    },

    async listRegionalPrices(companyId, productId) {
      const { data, error } = await client
        .from("product_regional_prices")
        .select("*")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapRegional(r as Record<string, unknown>));
    },

    async upsertRegionalPrice(input) {
      if (input.id) {
        const { data, error } = await client
          .from("product_regional_prices")
          .update({
            country: input.country ?? null,
            market: input.market ?? null,
            region: input.region ?? null,
            local_price: input.localPrice,
            currency_override: input.currencyOverride ?? null,
            is_active: input.isActive ?? true,
            updated_by: input.actorUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", input.companyId)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return mapRegional(data as Record<string, unknown>);
      }
      const { data, error } = await client
        .from("product_regional_prices")
        .insert({
          company_id: input.companyId,
          product_id: input.productId,
          country: input.country ?? null,
          market: input.market ?? null,
          region: input.region ?? null,
          local_price: input.localPrice,
          currency_override: input.currencyOverride ?? null,
          is_active: input.isActive ?? true,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapRegional(data as Record<string, unknown>);
    },

    async listBundleItems(companyId, bundleProductId) {
      const { data, error } = await client
        .from("product_bundle_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("bundle_product_id", bundleProductId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapBundle(r as Record<string, unknown>));
    },

    async setBundleItems(input) {
      await client
        .from("product_bundle_items")
        .delete()
        .eq("company_id", input.companyId)
        .eq("bundle_product_id", input.bundleProductId);

      if (!input.items.length) return [];

      const { data, error } = await client
        .from("product_bundle_items")
        .insert(
          input.items.map((item, index) => ({
            company_id: input.companyId,
            bundle_product_id: input.bundleProductId,
            component_product_id: item.componentProductId,
            quantity: item.quantity,
            sort_order: index,
          })),
        )
        .select("*");
      if (error) throw error;
      return (data ?? []).map((r) => mapBundle(r as Record<string, unknown>));
    },

    async listOpportunityLines(companyId, opportunityId) {
      const { data, error } = await client
        .from("opportunity_line_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("opportunity_id", opportunityId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
    },

    async upsertOpportunityLine(input) {
      const row = {
        company_id: input.companyId,
        opportunity_id: input.opportunityId,
        product_id: input.productId,
        product_name_snapshot: input.productNameSnapshot,
        sku_snapshot: input.skuSnapshot,
        quantity: input.quantity,
        unit_price: input.unitPrice,
        discount_percent: input.discountPercent,
        tax_percent: input.taxPercent,
        currency: input.currency,
        subtotal: input.subtotal,
        tax_amount: input.taxAmount,
        total: input.total,
        sort_order: input.sortOrder ?? 0,
        updated_by: input.actorUserId,
        updated_at: new Date().toISOString(),
      };

      if (input.id) {
        const { data, error } = await client
          .from("opportunity_line_items")
          .update(row)
          .eq("company_id", input.companyId)
          .eq("id", input.id)
          .is("deleted_at", null)
          .select("*")
          .single();
        if (error) throw error;
        return mapLine(data as Record<string, unknown>);
      }

      const { data, error } = await client
        .from("opportunity_line_items")
        .insert({ ...row, created_by: input.actorUserId })
        .select("*")
        .single();
      if (error) throw error;
      return mapLine(data as Record<string, unknown>);
    },

    async removeOpportunityLine(companyId, lineId, actorUserId) {
      const { error } = await client
        .from("opportunity_line_items")
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: actorUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", lineId);
      if (error) throw error;
    },

    async addHistory(input) {
      const { data, error } = await client
        .from("product_history")
        .insert({
          company_id: input.companyId,
          product_id: input.productId,
          event_type: input.eventType,
          field_name: input.fieldName ?? null,
          previous_value: input.previousValue ?? null,
          new_value: input.newValue ?? null,
          summary: input.summary ?? "",
          payload: input.payload ?? {},
          actor_user_id: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapHistory(data as Record<string, unknown>);
    },

    async listHistory(companyId, productId, limit = 100) {
      const { data, error } = await client
        .from("product_history")
        .select("*")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => mapHistory(r as Record<string, unknown>));
    },
  };
}
