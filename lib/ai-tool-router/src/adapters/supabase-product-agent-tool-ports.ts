import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProductAgentRecord,
  ProductAgentToolPorts,
} from "../tools/product-agent-ports.js";
import {
  catalogSearchVariants,
  catalogTypoProbes,
  foldCatalogText,
  foldCatalogToken,
  rankCatalogProducts,
} from "../tools/catalog-search-language.js";
import { isProductAliasSearchEnabled } from "../tools/product-alias-search-flag.js";
import { publicProductImageUrls } from "../tools/product-agent-tools.js";

/** Explicit columns only: cost, margin_percent, stock and metadata are never read. */
const PRODUCT_COLUMNS_BASE =
  "id, company_id, category_id, product_type, name, sku, brand, description, base_price, currency, price_tax_mode, tax_percent, subscription_interval, subscription_price, unit, tags, image_urls, is_active, deleted_at";

const PRODUCT_COLUMNS_WITH_ALIASES = `${PRODUCT_COLUMNS_BASE}, aliases`;

/** Bare generics never drive alias-only matches (mirrors product-platform denylist). */
const GENERIC_ALIAS_SEARCH_TOKENS = new Set(
  [
    "system",
    "systems",
    "software",
    "platform",
    "platforms",
    "product",
    "products",
    "service",
    "services",
    "app",
    "apps",
    "application",
    "applications",
    "module",
    "modules",
    "tool",
    "tools",
    "program",
    "programs",
    "سيستم",
    "السيستم",
    "برنامج",
    "البرنامج",
    "منصه",
    "المنصه",
    "منصة",
    "المنصة",
    "منتج",
    "المنتج",
    "منتجات",
    "المنتجات",
    "خدمه",
    "الخدمة",
    "خدمة",
    "الخدمات",
    "خدمات",
    "موديول",
    "الموديول",
    "تطبيق",
    "التطبيق",
  ].map((token) => foldCatalogToken(token)),
);

function productSelectColumns(aliasSearch: boolean): string {
  return aliasSearch ? PRODUCT_COLUMNS_WITH_ALIASES : PRODUCT_COLUMNS_BASE;
}

function isBareGenericAliasSearchTerm(term: string): boolean {
  const folded = foldCatalogToken(term);
  return folded.length > 0 && GENERIC_ALIAS_SEARCH_TOKENS.has(folded);
}

/** Candidates fetched before ranking; keeps the query bounded on large catalogs. */
const SEARCH_CANDIDATE_LIMIT = 25;
const CATEGORY_MATCH_LIMIT = 20;
const SAFE_TERM_PATTERN = /^[\p{L}\p{N}-]+$/u;

type Row = Record<string, unknown>;

function requireTrustedCompanyId(companyId: string): string {
  const id = typeof companyId === "string" ? companyId.trim() : "";
  if (!id) throw new Error("Company context is required.");
  return id;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isVisibleProductRow(row: Row, companyId: string): boolean {
  return row.company_id === companyId && row.is_active === true && row.deleted_at == null;
}

function mapProductRow(row: Row, categoryNames: Map<string, string>): ProductAgentRecord {
  const categoryId = typeof row.category_id === "string" ? row.category_id : null;
  const imageUrls = publicProductImageUrls(readStringArray(row.image_urls));
  return {
    id: String(row.id),
    name: readText(row.name),
    sku: readText(row.sku),
    brand: readText(row.brand),
    description: readText(row.description),
    productType: readText(row.product_type) || "product",
    categoryId,
    categoryName: categoryId ? categoryNames.get(categoryId) ?? null : null,
    basePrice: readNumber(row.base_price),
    currency: typeof row.currency === "string" ? row.currency : null,
    priceTaxMode:
      row.price_tax_mode === "exclusive" || row.price_tax_mode === "unspecified"
        ? row.price_tax_mode
        : "inclusive",
    taxPercent: readNumber(row.tax_percent) ?? 0,
    subscriptionPrice: readNumber(row.subscription_price),
    subscriptionInterval: typeof row.subscription_interval === "string" ? row.subscription_interval : null,
    unit: readText(row.unit),
    tags: readStringArray(row.tags),
    aliases: readStringArray(row.aliases),
    imageUrls,
    imageCount: imageUrls.length,
  };
}

function expandedSearchTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const expanded: string[] = [];
  for (const term of terms) {
    for (const variant of catalogSearchVariants(term)) {
      const key = variant.toLocaleLowerCase();
      if (seen.has(key) || !SAFE_TERM_PATTERN.test(variant)) continue;
      seen.add(key);
      expanded.push(variant);
    }
  }
  return expanded;
}

function productLookupUnavailable(error: { message?: string }): never {
  const cause = error instanceof Error ? error : new Error(error.message || "Product query failed.");
  throw new Error("Product lookup is temporarily unavailable.", { cause });
}

async function loadCategoryNames(
  client: SupabaseClient,
  companyId: string,
  categoryIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(categoryIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from("product_categories")
    .select("id, name, company_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) productLookupUnavailable(error);
  const names = new Map<string, string>();
  for (const row of (data ?? []) as Row[]) {
    if (row.company_id !== companyId) continue;
    names.set(String(row.id), readText(row.name));
  }
  return names;
}

async function findMatchingCategoryIds(
  client: SupabaseClient,
  companyId: string,
  terms: string[],
): Promise<string[]> {
  if (terms.length === 0) return [];
  const { data, error } = await client
    .from("product_categories")
    .select("id, company_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(terms.map((term) => `name.ilike.%${term}%`).join(","))
    .limit(CATEGORY_MATCH_LIMIT);
  if (error) productLookupUnavailable(error);
  return ((data ?? []) as Row[])
    .filter((row) => row.company_id === companyId)
    .map((row) => String(row.id));
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

/** Quote only when PostgREST array literals need it (spaces / reserved chars). */
function formatCsArrayItem(value: string): string {
  const cleaned = value.replace(/"/g, "");
  if (/[\s,(){}\\]/.test(cleaned)) return `"${cleaned}"`;
  return cleaned;
}

/** Title-case words so folded search terms can still hit stored display aliases. */
function latinTitleCaseWords(value: string): string {
  return value.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => `${sep}${ch.toLocaleUpperCase()}`);
}

/**
 * PostgREST `aliases.cs` is case-sensitive. Search terms are folded lowercase, while
 * AI/admin aliases are often stored in display case — emit both casings.
 */
function aliasContainsFilters(value: string): string[] {
  const trimmed = value.trim().replace(/"/g, "");
  if (!trimmed || isBareGenericAliasSearchTerm(trimmed)) return [];
  const variants = new Set<string>([trimmed]);
  const folded = foldCatalogText(trimmed).trim();
  if (folded) {
    variants.add(folded);
    variants.add(latinTitleCaseWords(folded));
  }
  if (!/\s/.test(trimmed) && trimmed.length > 1) {
    variants.add(`${trimmed[0]!.toLocaleUpperCase()}${trimmed.slice(1)}`);
  }
  return [...variants].map((entry) => `aliases.cs.{${formatCsArrayItem(entry)}}`);
}

/** Case-insensitive equality for the full phrase, outside the broad candidate window. */
function buildExactMatchFilter(terms: string[], aliasSearch: boolean): string {
  const phraseRaw = terms.join(" ");
  const phrase = quoteFilterValue(phraseRaw);
  const clauses = [`name.ilike.${phrase}`, `sku.ilike.${phrase}`];
  for (const variant of expandedSearchTerms(terms)) {
    const quoted = quoteFilterValue(variant);
    clauses.push(`name.ilike.${quoted}`, `sku.ilike.${quoted}`);
    if (aliasSearch) clauses.push(...aliasContainsFilters(variant));
  }
  if (aliasSearch && phraseRaw.trim()) {
    clauses.push(...aliasContainsFilters(phraseRaw));
  }
  return clauses.join(",");
}

const PRODUCT_TYPE_TERMS: Record<string, string> = {
  خدمه: "service",
  خدمة: "service",
  خدمات: "service",
  service: "service",
  services: "service",
  اشتراك: "subscription",
  اشتراكات: "subscription",
  subscription: "subscription",
  subscriptions: "subscription",
  حزمه: "bundle",
  حزمة: "bundle",
  حزم: "bundle",
  bundle: "bundle",
  bundles: "bundle",
  اضافه: "addon",
  إضافة: "addon",
  addon: "addon",
  عقار: "real_estate",
  عقارات: "real_estate",
  property: "real_estate",
  properties: "real_estate",
  realty: "real_estate",
  realestate: "real_estate",
  real_estate: "real_estate",
  رقمي: "digital",
  digital: "digital",
};

function productTypeCode(term: string): string | null {
  const key = term.toLocaleLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
  return PRODUCT_TYPE_TERMS[term] ?? PRODUCT_TYPE_TERMS[key] ?? null;
}

function buildProductSearchFilter(
  terms: string[],
  categoryIds: string[],
  aliasSearch: boolean,
): string {
  const clauses: string[] = [];
  for (const term of expandedSearchTerms(terms)) {
    clauses.push(
      `name.ilike.%${term}%`,
      `sku.ilike.%${term}%`,
      `brand.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `product_type.ilike.%${term}%`,
      `tags.cs.{${term}}`,
    );
    if (aliasSearch) clauses.push(...aliasContainsFilters(term));
    const typeCode = productTypeCode(term);
    if (typeCode) clauses.push(`product_type.eq.${typeCode}`);
  }
  if (categoryIds.length > 0) clauses.push(`category_id.in.(${categoryIds.join(",")})`);
  return clauses.join(",");
}

function dedupeRows(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  for (const row of rows) byId.set(String(row.id), row);
  return [...byId.values()];
}

async function loadExactProductMatches(
  client: SupabaseClient,
  companyId: string,
  terms: string[],
  categoryId: string | null,
  aliasSearch: boolean,
): Promise<Row[]> {
  let query = client
    .from("catalog_products")
    .select(productSelectColumns(aliasSearch))
    .eq("company_id", companyId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(buildExactMatchFilter(terms, aliasSearch));
  if (categoryId) query = query.eq("category_id", categoryId);
  const { data, error } = await query.order("name", { ascending: true }).limit(SEARCH_CANDIDATE_LIMIT);
  if (error) productLookupUnavailable(error);
  return (data ?? []) as unknown as Row[];
}

export function createSupabaseProductAgentToolPorts(client: SupabaseClient): ProductAgentToolPorts {
  return {
    async searchProducts(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      const terms = input.terms.filter((term) => SAFE_TERM_PATTERN.test(term));
      if (input.terms.length > 0 && terms.length === 0) return { products: [], truncated: false };
      const aliasSearch = isProductAliasSearchEnabled();

      const matchingCategoryIds = await findMatchingCategoryIds(client, companyId, expandedSearchTerms(terms));

      let query = client
        .from("catalog_products")
        .select(productSelectColumns(aliasSearch))
        .eq("company_id", companyId)
        .eq("is_active", true)
        .is("deleted_at", null);
      if (input.categoryId) query = query.eq("category_id", input.categoryId);
      if (input.productType?.trim()) query = query.eq("product_type", input.productType.trim());
      if (terms.length > 0) query = query.or(buildProductSearchFilter(terms, matchingCategoryIds, aliasSearch));

      const { data, error } = await query.order("name", { ascending: true }).limit(SEARCH_CANDIDATE_LIMIT);
      if (error) productLookupUnavailable(error);

      const exactRows =
        terms.length > 0
          ? await loadExactProductMatches(client, companyId, terms, input.categoryId, aliasSearch)
          : [];
      let rows = dedupeRows([
        ...exactRows,
        ...((data ?? []) as unknown as Row[]),
      ]).filter((row) => isVisibleProductRow(row, companyId));
      if (rows.length === 0 && terms.length > 0) {
        const probes = terms.flatMap((term) => catalogTypoProbes(term)).filter((term) => SAFE_TERM_PATTERN.test(term)).slice(0, 10);
        if (probes.length > 0) {
          const probeFilter = probes
            .flatMap((term) => [`name.ilike.%${term}%`, `sku.ilike.%${term}%`])
            .join(",");
          let probeQuery = client
            .from("catalog_products")
            .select(productSelectColumns(aliasSearch))
            .eq("company_id", companyId)
            .eq("is_active", true)
            .is("deleted_at", null)
            .or(probeFilter);
          if (input.categoryId) probeQuery = probeQuery.eq("category_id", input.categoryId);
          if (input.productType?.trim()) probeQuery = probeQuery.eq("product_type", input.productType.trim());
          const probed = await probeQuery.order("name", { ascending: true }).limit(SEARCH_CANDIDATE_LIMIT);
          if (probed.error) productLookupUnavailable(probed.error);
          rows = ((probed.data ?? []) as unknown as Row[]).filter((row) => isVisibleProductRow(row, companyId));
        }
      }
      const categoryNames = await loadCategoryNames(
        client,
        companyId,
        rows.map((row) => row.category_id).filter((id): id is string => typeof id === "string"),
      );
      const records = rows.map((row) => mapProductRow(row, categoryNames));
      const ranked = terms.length > 0 ? rankCatalogProducts(records, terms) : records;

      return {
        products: ranked.slice(0, input.limit),
        truncated: ranked.length > input.limit,
      };
    },

    async getProductsByIds(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      const ids = [...new Set(input.productIds)];
      if (ids.length === 0) return [];
      const aliasSearch = isProductAliasSearchEnabled();

      const { data, error } = await client
        .from("catalog_products")
        .select(productSelectColumns(aliasSearch))
        .eq("company_id", companyId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .in("id", ids)
        .limit(ids.length);
      if (error) productLookupUnavailable(error);

      const rows = ((data ?? []) as unknown as Row[]).filter(
        (row) => isVisibleProductRow(row, companyId) && ids.includes(String(row.id)),
      );
      const categoryNames = await loadCategoryNames(
        client,
        companyId,
        rows.map((row) => row.category_id).filter((id): id is string => typeof id === "string"),
      );
      return rows.map((row) => mapProductRow(row, categoryNames));
    },
  };
}
