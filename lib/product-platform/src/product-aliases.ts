/**
 * Normalize and validate catalog product aliases (synonyms / trade names).
 * Empty / missing input → []. Never required for create/update.
 */

import { foldCatalogText, foldCatalogToken } from "./catalog-text-fold.js";

/** Stored aliases including expanded search tokens (phrases + folded tokens). */
export const PRODUCT_ALIAS_MAX_COUNT = 60;
export const PRODUCT_ALIAS_MAX_CHARS = 60;

/** Single-token generics that must not uniquely identify a product via aliases alone. */
const GENERIC_ALIAS_TOKENS = new Set(
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

export function isGenericProductAliasToken(value: string): boolean {
  const folded = foldCatalogToken(value);
  return folded.length > 0 && GENERIC_ALIAS_TOKENS.has(folded);
}

/**
 * Trims, dedupes (case/fold insensitive), drops empties and banned generics.
 * Soft-caps at PRODUCT_ALIAS_MAX_COUNT (AI preview + token expansion often exceed it).
 * Throws only for invalid shape, overlong single aliases, or bare generic tokens.
 */
export function normalizeProductAliases(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new Error("aliases must be an array of strings.");
  }

  const seen = new Set<string>();
  const aliases: string[] = [];

  const pushAlias = (value: string): boolean => {
    const key = foldCatalogToken(value) || value.toLocaleLowerCase();
    if (!key || seen.has(key)) return true;
    if (aliases.length >= PRODUCT_ALIAS_MAX_COUNT) return false;
    seen.add(key);
    aliases.push(value);
    return true;
  };

  for (const entry of input) {
    if (aliases.length >= PRODUCT_ALIAS_MAX_COUNT) break;
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    if (trimmed.length > PRODUCT_ALIAS_MAX_CHARS) {
      throw new Error(`Each alias must be at most ${PRODUCT_ALIAS_MAX_CHARS} characters.`);
    }
    if (isGenericProductAliasToken(trimmed) && !/\s/.test(trimmed)) {
      // Reject bare generics; multi-word phrases like "ValueOR system" stay allowed.
      throw new Error(
        `Alias "${trimmed}" is too generic to identify a single product. Use a more specific synonym.`,
      );
    }
    if (!pushAlias(trimmed)) break;
    const foldedPhrase = foldCatalogText(trimmed).trim();
    if (foldedPhrase && foldedPhrase !== trimmed && !pushAlias(foldedPhrase)) break;
    // Index non-generic folded tokens so PostgREST aliases.cs matches AI search terms.
    for (const token of trimmed.split(/\s+/)) {
      if (token.length < 4 || isGenericProductAliasToken(token)) continue;
      const folded = foldCatalogToken(token);
      if (folded.length >= 4 && !pushAlias(folded)) break;
    }
  }

  return aliases;
}

/** Safe read helper when the column is missing, null, or contains legacy junk. */
export function readProductAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().replace(/\s+/g, " ");
    if (!trimmed || trimmed.length > PRODUCT_ALIAS_MAX_CHARS) continue;
    const key = foldCatalogToken(trimmed) || trimmed.toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    aliases.push(trimmed);
    if (aliases.length >= PRODUCT_ALIAS_MAX_COUNT) break;
  }
  return aliases;
}

/**
 * Aliases shown in admin UI / forms. Hides lowercase Latin search-index tokens
 * that normalizeProductAliases adds for AI matching.
 */
export function displayProductAliases(aliases: readonly string[] | undefined): string[] {
  if (!aliases?.length) return [];
  return aliases.filter((alias) => {
    const trimmed = alias.trim();
    if (!trimmed) return false;
    if (/\s/.test(trimmed)) return true;
    if (/[A-Z\u0600-\u06FF]/.test(trimmed)) return true;
    return false;
  });
}
