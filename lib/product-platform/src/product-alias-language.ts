/**
 * Detect product-data language for alias generation.
 * Uses product name/description text only — never UI locale or actor language.
 */

const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F]/;
const GERMAN_CHAR_RE = /[äöüÄÖÜß]/;
const GERMAN_WORD_RE =
  /\b(und|oder|für|mit|der|die|das|ein|eine|einen|einem|einer|nicht|auch|bei|von|zum|zur|wohnungen?|miete|vermietung|verkauf|modul|software|buchhaltung|rechnung)\b/i;

export type ProductAliasLanguageCode = "ar" | "en" | "de";
export type ProductAliasPrimaryLanguage = ProductAliasLanguageCode | "mixed" | "unknown";

export type ProductAliasLanguageDetection = {
  primary: ProductAliasPrimaryLanguage;
  languages: ProductAliasLanguageCode[];
};

function significantArabic(text: string): boolean {
  const matches = text.match(/[\u0600-\u06FF]/g);
  return (matches?.length ?? 0) >= 2;
}

function significantLatin(text: string): boolean {
  const matches = text.match(/[A-Za-z\u00C0-\u024F]/g);
  return (matches?.length ?? 0) >= 3;
}

function looksGerman(text: string): boolean {
  return GERMAN_CHAR_RE.test(text) || GERMAN_WORD_RE.test(text);
}

function detectLanguagesInText(text: string): ProductAliasLanguageCode[] {
  const languages: ProductAliasLanguageCode[] = [];
  if (!text.trim()) return languages;

  const hasArabic = significantArabic(text) || ARABIC_RE.test(text);
  const hasLatin = significantLatin(text) || LATIN_LETTER_RE.test(text);

  if (hasArabic) languages.push("ar");

  if (hasLatin) {
    if (looksGerman(text)) languages.push("de");
    else languages.push("en");
    // Mixed Latin signals: German markers plus clear English product words → both
    if (looksGerman(text) && /\b(the|and|for|with|module|apartment|rental|software|accounting)\b/i.test(text)) {
      if (!languages.includes("en")) languages.push("en");
    }
  }

  return languages;
}

function primaryFromLanguages(languages: ProductAliasLanguageCode[]): ProductAliasPrimaryLanguage {
  if (languages.length === 0) return "unknown";
  if (languages.length === 1) return languages[0]!;
  return "mixed";
}

function uniqueLanguages(codes: ProductAliasLanguageCode[]): ProductAliasLanguageCode[] {
  const seen = new Set<ProductAliasLanguageCode>();
  const out: ProductAliasLanguageCode[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Infer languages present in product copy. Brand/SKU alone must not decide language —
 * callers should pass name + description (and optional category), not SKU/brand codes.
 *
 * When name and description disagree, description / semantic details win for `primary`.
 * UI locale and actor language must never be passed here.
 */
export function detectProductAliasLanguages(
  name: string,
  description = "",
  extraText = "",
): ProductAliasLanguageDetection {
  const nameText = String(name ?? "").trim();
  const descriptionText = String(description ?? "").trim();
  const extra = String(extraText ?? "").trim();

  if (!nameText && !descriptionText && !extra) {
    return { primary: "unknown", languages: [] };
  }

  const fromDescription = detectLanguagesInText([descriptionText, extra].filter(Boolean).join("\n"));
  const fromName = detectLanguagesInText(nameText);

  // Prefer description/details for the primary language when they carry a clear signal.
  if (fromDescription.length > 0) {
    const languages = uniqueLanguages([...fromDescription, ...fromName]);
    const primary =
      fromDescription.length === 1 ? fromDescription[0]! : primaryFromLanguages(fromDescription);
    return { primary, languages };
  }

  const languages = uniqueLanguages([...fromName, ...fromDescription]);
  return { primary: primaryFromLanguages(languages), languages };
}
