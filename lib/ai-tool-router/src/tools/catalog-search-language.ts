/**
 * Search-only folding for catalog lookup.
 * Never write the folded form back into the conversation transcript.
 * Letter-class swaps (أ/ا, ة/ه, ى/ي) and stuttered repeats stay reversible variants.
 */

const ARABIC_LETTER = /[\u0600-\u06FF]/u;

export function foldCatalogText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{M}\u0640]+/gu, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/([\u0600-\u06FF])\1{2,}/gu, "$1")
    .toLocaleLowerCase();
}

export function foldCatalogToken(value: string): string {
  return foldCatalogText(value).replace(/[^\p{L}\p{N}-]+/gu, "");
}

/** At most six PostgREST-safe spellings of one token. */
export function catalogSearchVariants(term: string): string[] {
  const folded = foldCatalogToken(term);
  if (folded.length < 2) return [];
  const variants = new Set<string>([folded]);
  if (folded.endsWith("ه")) variants.add(`${folded.slice(0, -1)}ة`);
  if (folded.endsWith("ي")) variants.add(`${folded.slice(0, -1)}ى`);
  if (ARABIC_LETTER.test(folded)) {
    let collapsed = folded;
    for (let pass = 0; pass < 2; pass += 1) {
      const next = collapsed.replace(/([\u0600-\u06FF])\1/u, "$1");
      if (next === collapsed || next.length < 4) break;
      collapsed = next;
      variants.add(collapsed);
      if (collapsed.endsWith("ه")) variants.add(`${collapsed.slice(0, -1)}ة`);
    }
  }
  const alef = folded.indexOf("ا");
  if (alef >= 0 && variants.size < 8) variants.add(`${folded.slice(0, alef)}أ${folded.slice(alef + 1)}`);
  return [...variants].slice(0, 8);
}

/**
 * Bounded typo probes used only after an exact/variant search misses.
 * Vowel insertion plus a few adjacent swaps — not an open edit-distance expansion.
 */
const SOFTWARE_QUERY_TOKENS = new Set(
  ["سيستم", "نظام", "برنامج", "منصه", "منصة", "software", "system", "platform", "erp", "crm"].map((token) =>
    foldCatalogToken(token),
  ),
);

const CLINIC_QUERY_TOKENS = new Set(
  ["عياد", "عياده", "عيادة", "عيادات", "clinic", "clinics", "hospital"].map((token) => foldCatalogToken(token)),
);

/**
 * Expand colloquial product phrases so "سيستم عيادات" still hits
 * name/description/alias rows that say "نظام إدارة العيادات".
 * Only expands when the query already mixes software + domain tokens.
 */
export function expandCatalogQueryTerms(terms: readonly string[]): string[] {
  const folded = terms.map((term) => foldCatalogToken(term)).filter((term) => term.length >= 2);
  if (folded.length === 0) return [];
  const seen = new Set<string>(folded);
  const out = [...folded];
  const push = (value: string) => {
    const key = foldCatalogToken(value);
    if (key.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  const hasSoftware = folded.some((term) => SOFTWARE_QUERY_TOKENS.has(term));
  const hasClinic = folded.some(
    (term) => CLINIC_QUERY_TOKENS.has(term) || [...CLINIC_QUERY_TOKENS].some((clinic) => term.startsWith(clinic)),
  );
  // Only expand known clinic stems — never every Arabic plural (سماعات ≠ سماعه search noise).
  if (hasClinic || hasSoftware) {
    for (const term of folded) {
      if (term.startsWith("عياد")) {
        push("عياده");
        push("عيادات");
        push("عياد");
      }
    }
  }
  if (hasSoftware && hasClinic) {
    for (const token of ["سيستم", "نظام", "برنامج", "عياده", "عيادات", "clinic"]) push(token);
  }
  return out;
}

export function catalogTypoProbes(term: string): string[] {
  const base = foldCatalogToken(term);
  if (base.length < 5 || base.length > 14) return [];
  const probes = new Set<string>();
  const mid = Math.floor(base.length / 2);
  for (const index of [mid - 1, mid, 1, base.length - 2]) {
    if (index < 0 || index + 1 >= base.length) continue;
    const chars = [...base];
    const swap = chars[index]!;
    chars[index] = chars[index + 1]!;
    chars[index + 1] = swap;
    const next = chars.join("");
    if (next !== base) probes.add(next);
  }
  const vowels = ARABIC_LETTER.test(base) ? ["ا"] : ["a", "e"];
  for (let index = 1; index < base.length && probes.size < 10; index += 1) {
    for (const vowel of vowels) {
      if (probes.size >= 10) break;
      probes.add(`${base.slice(0, index)}${vowel}${base.slice(index)}`);
    }
  }
  probes.delete(base);
  return [...probes].slice(0, 10);
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length > 40 || right.length > 40) return Math.max(left.length, right.length);
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let previous = rows[0]!;
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = rows[leftIndex]!;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex] = Math.min(current + 1, rows[leftIndex - 1]! + 1, previous + cost);
      previous = current;
    }
  }
  return rows[left.length]!;
}

export function catalogTokenSimilarity(left: string, right: string): number {
  const a = foldCatalogToken(left);
  const b = foldCatalogToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export type CatalogRankRecord = {
  name: string;
  sku: string;
  brand: string;
  description: string;
  categoryName: string | null;
  tags: string[];
  /** Optional synonyms used when alias search is enabled. */
  aliases?: string[];
};

const FUZZY_MIN = 0.84;

function fieldTokens(value: string): string[] {
  return foldCatalogText(value)
    .split(/[^\p{L}\p{N}-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreCatalogRecord(record: CatalogRankRecord, terms: string[]): number {
  const name = foldCatalogText(record.name);
  const sku = foldCatalogToken(record.sku);
  const brand = foldCatalogText(record.brand);
  const category = foldCatalogText(record.categoryName ?? "");
  const description = foldCatalogText(record.description);
  const tags = record.tags.map((tag) => foldCatalogToken(tag));
  const aliases = (record.aliases ?? []).map((alias) => foldCatalogText(alias));
  const aliasTokens = (record.aliases ?? []).flatMap((alias) => fieldTokens(alias));
  const phrase = terms.join(" ");
  let score = 0;
  if (phrase && name === phrase) score += 30;
  if (phrase && sku === foldCatalogToken(phrase)) score += 40;
  if (phrase && aliases.some((alias) => alias === phrase)) score += 28;
  const nameTokens = fieldTokens(record.name);
  for (const term of terms) {
    if (name.includes(term)) score += 6;
    if (sku === term) score += 12;
    else if (sku.includes(term)) score += 5;
    if (brand.includes(term)) score += 3;
    if (category.includes(term)) score += 2;
    if (tags.some((tag) => tag.includes(term))) score += 2;
    if (aliases.some((alias) => alias === term || alias.includes(term))) score += 5;
    if (description.includes(term)) score += 1;
    const fuzzy = Math.max(
      0,
      ...nameTokens.map((token) => catalogTokenSimilarity(token, term)),
      ...aliasTokens.map((token) => catalogTokenSimilarity(token, term)),
      catalogTokenSimilarity(sku, term),
    );
    if (fuzzy >= FUZZY_MIN && fuzzy < 1) score += 4;
  }
  return score;
}

/** Exact SKU wins. Close scores stay together so the caller can ask instead of guessing. */
export function rankCatalogProducts<T extends CatalogRankRecord>(records: T[], terms: string[]): T[] {
  const foldedTerms = terms.map((term) => foldCatalogToken(term)).filter((term) => term.length >= 2);
  if (foldedTerms.length === 0) return records;
  const exactSku = records.filter((record) =>
    foldedTerms.some((term) => foldCatalogToken(record.sku) === term),
  );
  if (exactSku.length > 0) return exactSku;
  const scored = records
    .map((record) => ({ record, score: scoreCatalogRecord(record, foldedTerms) }))
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name, "ar"));
  if (scored.length === 0) return [];
  const best = scored[0]!.score;
  // A full-name hit stays first, and other name matches stay visible. Weak field hits do not.
  if (best >= 20) return scored.filter((entry) => entry.score >= 6).map((entry) => entry.record);
  return scored.filter((entry) => entry.score >= Math.max(1, best - 2)).map((entry) => entry.record);
}
