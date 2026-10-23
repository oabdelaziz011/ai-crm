/**
 * AI product-alias generation: fingerprinting, prompts, parse/validate, merge.
 * Does not call any AI provider — callers inject a completion port.
 */

import {
  PRODUCT_ALIAS_MAX_CHARS,
  PRODUCT_ALIAS_MAX_COUNT,
  isGenericProductAliasToken,
  normalizeProductAliases,
  readProductAliases,
} from "./product-aliases.js";
import {
  detectProductAliasLanguages,
  type ProductAliasLanguageCode,
  type ProductAliasPrimaryLanguage,
} from "./product-alias-language.js";
import { foldCatalogToken } from "./catalog-text-fold.js";

/**
 * Soft cap for phrase aliases produced in one generation pass (before token expansion).
 * Must stay comfortably under PRODUCT_ALIAS_MAX_COUNT after token indexing.
 */
export const PRODUCT_ALIAS_GENERATION_MAX = 20;

/** Browser-safe fingerprint (avoids node:crypto in the login-app bundle). */
function fingerprintHex(raw: string): string {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 ^= code;
    h2 = Math.imul(h2, 16777619);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  const c = (Math.imul(h1 ^ h2, 2246822507) >>> 0).toString(16).padStart(8, "0");
  const d = (Math.imul(h1 + h2, 3266489917) >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}${c}${d}`;
}

export type ProductAliasGenerationStatus = "pending" | "completed" | "failed";

export type ProductAliasGenerationMeta = {
  status: ProductAliasGenerationStatus;
  fingerprint: string;
  requestedAt: string;
  completedAt?: string;
  primaryLanguage?: ProductAliasPrimaryLanguage;
  languages?: ProductAliasLanguageCode[];
  generatedCount?: number;
  errorCode?: string;
};

export type ProductAliasContentFields = {
  name: string;
  description?: string | null;
  productType?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  tags?: readonly string[] | null;
};

export type ProductAliasGenerationJob = {
  companyId: string;
  productId: string;
  fingerprint: string;
  requestedAt: string;
  actorUserId: string | null;
};

export type ProductAliasAiCompletionPort = {
  completeJson(input: {
    companyId: string;
    system: string;
    user: string;
  }): Promise<string>;
};

export type ParsedAliasGenerationOutput = {
  primaryLanguage: ProductAliasPrimaryLanguage;
  languages: ProductAliasLanguageCode[];
  aliases: string[];
};

function foldKey(value: string): string {
  return foldCatalogToken(value) || value.toLocaleLowerCase();
}

/** Stable fingerprint of fields that affect product understanding for aliases. */
export function productAliasContentFingerprint(input: ProductAliasContentFields): string {
  const tags = [...(input.tags ?? [])]
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  const raw = [
    String(input.name ?? "").trim(),
    String(input.description ?? "").trim(),
    String(input.productType ?? "").trim(),
    String(input.categoryId ?? "").trim(),
    String(input.brand ?? "").trim(),
    tags,
  ].join("\n");
  return fingerprintHex(raw);
}

export function readAliasGenerationMeta(metadata: unknown): ProductAliasGenerationMeta | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).aliasGeneration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (status !== "pending" && status !== "completed" && status !== "failed") return null;
  const fingerprint = typeof record.fingerprint === "string" ? record.fingerprint : "";
  const requestedAt = typeof record.requestedAt === "string" ? record.requestedAt : "";
  if (!fingerprint || !requestedAt) return null;

  const languages = Array.isArray(record.languages)
    ? record.languages.filter(
        (code): code is ProductAliasLanguageCode =>
          code === "ar" || code === "en" || code === "de",
      )
    : undefined;

  const primary =
    record.primaryLanguage === "ar" ||
    record.primaryLanguage === "en" ||
    record.primaryLanguage === "de" ||
    record.primaryLanguage === "mixed" ||
    record.primaryLanguage === "unknown"
      ? record.primaryLanguage
      : undefined;

  return {
    status,
    fingerprint,
    requestedAt,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
    primaryLanguage: primary,
    languages,
    generatedCount:
      typeof record.generatedCount === "number" && Number.isFinite(record.generatedCount)
        ? record.generatedCount
        : undefined,
    errorCode: typeof record.errorCode === "string" ? record.errorCode : undefined,
  };
}

export function withAliasGenerationMeta(
  metadata: Record<string, unknown> | null | undefined,
  meta: ProductAliasGenerationMeta,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    aliasGeneration: {
      status: meta.status,
      fingerprint: meta.fingerprint,
      requestedAt: meta.requestedAt,
      ...(meta.completedAt ? { completedAt: meta.completedAt } : {}),
      ...(meta.primaryLanguage ? { primaryLanguage: meta.primaryLanguage } : {}),
      ...(meta.languages?.length ? { languages: meta.languages } : {}),
      ...(meta.generatedCount !== undefined ? { generatedCount: meta.generatedCount } : {}),
      ...(meta.errorCode ? { errorCode: meta.errorCode } : {}),
    },
  };
}

/**
 * Soft coerce of AI/user alias candidates: skip invalids instead of throwing.
 * Does not expand folded search tokens (that happens via normalizeProductAliases on save).
 */
export function coerceGeneratedAliases(
  input: unknown,
  options: { maxCount?: number; productName?: string } = {},
): string[] {
  const maxCount = options.maxCount ?? PRODUCT_ALIAS_GENERATION_MAX;
  if (!Array.isArray(input)) return [];

  const nameKey = options.productName ? foldKey(options.productName) : "";
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().replace(/\s+/g, " ");
    if (!trimmed || trimmed.length > PRODUCT_ALIAS_MAX_CHARS) continue;
    if (isGenericProductAliasToken(trimmed) && !/\s/.test(trimmed)) continue;
    const key = foldKey(trimmed);
    if (!key || seen.has(key)) continue;
    // Exact product-name duplicates add no search value.
    if (nameKey && key === nameKey) continue;
    seen.add(key);
    aliases.push(trimmed);
    if (aliases.length >= maxCount) break;
  }

  return aliases;
}

/**
 * Merge existing aliases with newly generated ones. Never drops existing entries
 * that remain valid. Dedupes and applies catalog normalize rules for search indexing.
 */
export function mergeProductAliases(
  existing: readonly string[] | undefined,
  generated: readonly string[] | undefined,
  options: { productName?: string } = {},
): string[] {
  const existingClean = readProductAliases(existing ?? []);
  const generatedClean = coerceGeneratedAliases(generated ?? [], {
    maxCount: PRODUCT_ALIAS_GENERATION_MAX,
    productName: options.productName,
  });

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const alias of [...existingClean, ...generatedClean]) {
    const key = foldKey(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(alias);
  }

  // Normalize in chunks so a single bad expansion cannot wipe the whole set.
  const merged: string[] = [];
  const mergedKeys = new Set<string>();
  for (const alias of ordered) {
    if (merged.length >= PRODUCT_ALIAS_MAX_COUNT) break;
    try {
      const normalized = normalizeProductAliases([alias]);
      for (const entry of normalized) {
        const key = foldKey(entry);
        if (!key || mergedKeys.has(key)) continue;
        if (merged.length >= PRODUCT_ALIAS_MAX_COUNT) break;
        mergedKeys.add(key);
        merged.push(entry);
      }
    } catch {
      // Skip entries that fail strict validation.
    }
  }
  return merged;
}

function extractJsonPayload(raw: string): unknown {
  let text = String(raw ?? "").trim();
  if (!text) throw new Error("empty_ai_output");

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    }
    throw new Error("invalid_json");
  }
}

const LANGUAGE_CODES = new Set(["ar", "en", "de"]);

/**
 * Validate structured AI output. Rejects empty/invalid payloads.
 */
export function parseAliasGenerationResponse(raw: string): ParsedAliasGenerationOutput {
  const parsed = extractJsonPayload(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_shape");
  }
  const record = parsed as Record<string, unknown>;

  const aliasesRaw = record.aliases ?? record.synonyms ?? record.names;
  if (!Array.isArray(aliasesRaw)) {
    throw new Error("missing_aliases");
  }

  const aliases = coerceGeneratedAliases(aliasesRaw, { maxCount: PRODUCT_ALIAS_GENERATION_MAX });
  if (aliases.length === 0) {
    throw new Error("empty_aliases");
  }

  let languages: ProductAliasLanguageCode[] = [];
  if (Array.isArray(record.languages)) {
    languages = record.languages.filter(
      (code): code is ProductAliasLanguageCode =>
        typeof code === "string" && LANGUAGE_CODES.has(code),
    );
  }

  let primary: ProductAliasPrimaryLanguage = "unknown";
  if (
    record.primaryLanguage === "ar" ||
    record.primaryLanguage === "en" ||
    record.primaryLanguage === "de" ||
    record.primaryLanguage === "mixed" ||
    record.primaryLanguage === "unknown"
  ) {
    primary = record.primaryLanguage;
  } else if (languages.length === 1) {
    primary = languages[0]!;
  } else if (languages.length > 1) {
    primary = "mixed";
  }

  if (languages.length === 0 && primary !== "unknown" && primary !== "mixed") {
    languages = [primary];
  }

  return { primaryLanguage: primary, languages, aliases };
}

export type AliasGenerationPromptProduct = {
  name: string;
  description?: string | null;
  productType?: string | null;
  brand?: string | null;
  tags?: readonly string[] | null;
  categoryName?: string | null;
};

export function buildAliasGenerationSystemPrompt(): string {
  return [
    "You generate search aliases and synonyms for a catalog product.",
    "Return ONLY valid JSON with this exact shape:",
    '{"primaryLanguage":"ar|en|de|mixed|unknown","languages":["ar"|"en"|"de"],"aliases":["..."]}',
    "",
    "Rules:",
    "- Infer language ONLY from the product name and description (never UI language or actor locale).",
    "- When name and description differ in language, follow the description / semantic details for the primary alias language.",
    "- If product text is Arabic, aliases must be Arabic by default.",
    "- If English, aliases must be English by default.",
    "- If German, aliases must be German by default.",
    "- If the product text is clearly in another language the model supports, write aliases in that same language and set primaryLanguage to unknown.",
    "- If the product text clearly mixes languages, include aliases in those languages only.",
    "- Do NOT translate into every language automatically.",
    "- Produce useful search nicknames, common customer phrases, and short abbreviations.",
    "- Do NOT invent features, integrations, brands, prices, discounts, locations, or availability.",
    "- Do NOT invent sale vs rent (or other intents) unless the product text states them.",
    "- Do NOT invent a different product.",
    "- Reject bare generic words alone (system, product, software, برنامج, سيستم, Modul, etc.).",
    "- Avoid long keyword stuffing and near-duplicate rewrites of the exact product name.",
    "- At most 20 aliases.",
    "- Each alias max 60 characters.",
  ].join("\n");
}

export function buildAliasGenerationUserPrompt(product: AliasGenerationPromptProduct): string {
  const detection = detectProductAliasLanguages(
    product.name,
    product.description ?? "",
    product.categoryName ?? "",
  );

  const lines = [
    "Generate search aliases for this product.",
    `Detected language hint: ${detection.primary} (${detection.languages.join(",") || "none"}).`,
    "Prefer the description language when name and description disagree.",
    "Use only facts present below.",
    "",
    `name: ${product.name}`,
    `description: ${String(product.description ?? "").trim() || "(none)"}`,
    `productType: ${String(product.productType ?? "").trim() || "(none)"}`,
    `category: ${String(product.categoryName ?? "").trim() || "(none)"}`,
    `brand: ${String(product.brand ?? "").trim() || "(none)"}`,
    `tags: ${(product.tags ?? []).filter(Boolean).join(", ") || "(none)"}`,
  ];
  return lines.join("\n");
}
