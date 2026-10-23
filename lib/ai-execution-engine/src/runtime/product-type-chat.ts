/**
 * Product-type vocabulary for customer chat.
 * Maps colloquial Arabic/English listing phrases onto catalog product_type codes.
 */

export type ProductTypeChatCode =
  | "product"
  | "service"
  | "subscription"
  | "bundle"
  | "addon"
  | "real_estate";

export type ProductTypeChatDef = {
  code: ProductTypeChatCode;
  /** Normalized aliases (arabicWordKey form preferred for Arabic). */
  aliases: readonly string[];
  labelAr: string;
  listIntro: string;
  emptyList: string;
  notFound: string;
};

function arabicWordKey(word: string): string {
  return word.toLocaleLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

/** Strip common Arabic possessives so "منتجاتك" matches "منتجات". */
export function arabicCatalogWordStem(word: string): string {
  const key = arabicWordKey(word);
  if (key.length < 4) return key;
  const stripped = key.replace(/(كم|كو|كن|نا|كي|هن|هم|ها|ك|ي)$/u, "");
  return stripped.length >= 3 ? stripped : key;
}

/** More specific types first so "عقارات" wins over generic "منتجات". */
export const PRODUCT_TYPE_CHAT: readonly ProductTypeChatDef[] = [
  {
    code: "real_estate",
    aliases: [
      "عقار",
      "عقارات",
      "العقار",
      "العقارات",
      "عقاراتكم",
      "property",
      "properties",
      "realty",
      "realestate",
      "real_estate",
      "real-estate",
    ],
    labelAr: "عقار",
    listIntro: "العقارات المتاحة:",
    emptyList: "مفيش عقارات متاحة دلوقتي.",
    notFound: "ملقتش عقار بالوصف ده. ابعت الاسم أو الرمز.",
  },
  {
    code: "subscription",
    aliases: ["اشتراك", "اشتراكات", "الاشتراك", "الاشتراكات", "subscription", "subscriptions"],
    labelAr: "اشتراك",
    listIntro: "الاشتراكات المتاحة:",
    emptyList: "مفيش اشتراكات متاحة دلوقتي.",
    notFound: "ملقتش اشتراك بالوصف ده. ابعت الاسم أو الرمز.",
  },
  {
    code: "bundle",
    aliases: ["حزمه", "حزمة", "حزم", "الحزم", "حزمكم", "باقه", "باقة", "باقات", "bundle", "bundles", "package", "packages"],
    labelAr: "حزمة",
    listIntro: "الحزم المتاحة:",
    emptyList: "مفيش حزم متاحة دلوقتي.",
    notFound: "ملقتش حزمة بالوصف ده. ابعت الاسم أو الرمز.",
  },
  {
    code: "addon",
    aliases: ["اضافه", "إضافة", "اضافات", "إضافات", "الاضافات", "الإضافات", "addon", "add-on", "addons", "add-ons"],
    labelAr: "إضافة",
    listIntro: "الإضافات المتاحة:",
    emptyList: "مفيش إضافات متاحة دلوقتي.",
    notFound: "ملقتش إضافة بالوصف ده. ابعت الاسم أو الرمز.",
  },
  {
    code: "service",
    aliases: ["خدمه", "خدمة", "خدمات", "الخدمه", "الخدمة", "الخدمات", "خدماتكم", "service", "services"],
    labelAr: "خدمة",
    listIntro: "الخدمات المتاحة من الكتالوج:",
    emptyList: "مفيش خدمات كتالوج متاحة دلوقتي.",
    notFound: "ملقتش خدمة بالوصف ده. ابعت الاسم أو الرمز.",
  },
  {
    code: "product",
    aliases: [
      "منتج",
      "منتجات",
      "المنتج",
      "المنتجات",
      "منتجاتكم",
      "منتجاتنا",
      "منتجاتك",
      "منتجاتكو",
      "product",
      "products",
      "كتالوج",
      "catalog",
    ],
    labelAr: "منتج",
    listIntro: "المنتجات المتاحة:",
    emptyList: "مفيش منتجات متاحة دلوقتي.",
    notFound: "ملقتش منتج بالوصف ده. ابعت اسم المنتج أو رمزه.",
  },
] as const;

const ALIAS_TO_CODE = (() => {
  const map = new Map<string, ProductTypeChatCode>();
  for (const def of PRODUCT_TYPE_CHAT) {
    for (const alias of def.aliases) {
      map.set(arabicWordKey(alias), def.code);
      map.set(alias.toLocaleLowerCase(), def.code);
    }
  }
  return map;
})();

const TYPE_ALIAS_KEYS = new Set(ALIAS_TO_CODE.keys());

export function productTypeChatDef(code: string | null | undefined): ProductTypeChatDef | null {
  if (!code) return null;
  return PRODUCT_TYPE_CHAT.find((entry) => entry.code === code) ?? null;
}

/**
 * Detect a catalog type filter from the customer message.
 * Generic "منتجات / products / كتالوج" means the whole catalog (no type filter).
 * Specific nouns (عقارات، خدمات، اشتراكات، …) narrow to that product_type.
 */
export function detectProductTypeIntent(text: string): ProductTypeChatCode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const words = trimmed
    .replace(/[?؟!.،,]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  for (const def of PRODUCT_TYPE_CHAT) {
    if (def.code === "product") continue;
    for (const alias of [...def.aliases].sort((a, b) => b.length - a.length)) {
      const key = arabicWordKey(alias);
      if (words.some((word) => arabicWordKey(word) === key)) return def.code;
      if (key.length >= 4 && arabicWordKey(trimmed).includes(key)) return def.code;
    }
  }
  return null;
}

export function isProductTypeAlias(word: string): boolean {
  return TYPE_ALIAS_KEYS.has(arabicWordKey(word));
}

export function productTypeCodeFromTerm(term: string): ProductTypeChatCode | null {
  return ALIAS_TO_CODE.get(arabicWordKey(term)) ?? ALIAS_TO_CODE.get(term.toLocaleLowerCase()) ?? null;
}

/**
 * "Tell me about your company / services" — not a catalog browse turn.
 * Keeps "ايه الخدمات اللي عندك" on the catalog path.
 */
export function looksLikeCompanyIntroQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  // "عرفني عن سيستم عيادات" is a catalog product ask, not company intro.
  if (looksLikeSoftwareProductDescriptor(trimmed)) return false;
  if (
    /(?:ايه|إيه|اي|what).{0,24}(?:الخدمات|خدمات|services)|(?:الخدمات|خدمات).{0,20}(?:ايه|إيه|available|عندك|عندكم|عندكو|متاح)/iu.test(
      trimmed,
    )
  ) {
    return false;
  }
  if (
    /(?:عرفني|قولي|قولّي|قول|احكي|احكيلي|معلومات|اكتر|أكتر|tell\s+me|about).{0,48}(?:شركه|شركة|شركتكم|شركتك|العياده|العيادة|company)/iu.test(
      trimmed,
    )
  ) {
    return true;
  }
  return /(?:عرفني|قولي|قولّي|قول|احكي|احكيلي|tell\s+me|about).{0,48}(?:خدماتكم|خدمتكم|خدماتنا|خدمتنا|\bservices\b)/iu.test(
    trimmed,
  );
}

/**
 * Customers describe software products without saying "منتج"
 * (e.g. سيستم عيادات / نظام محاسبي / clinic system).
 */
export function looksLikeSoftwareProductDescriptor(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /(?:سيستم|نظام|برنامج|منصه|منصة|software|system|platform|erp|crm).{0,28}(?:عياد|عياده|عيادة|عيادات|محاسب|مبيعات|مخزون|clinic|hospital|hospitality)|(?:عياد|عياده|عيادة|عيادات|محاسب|مبيعات|مخزون|clinic).{0,28}(?:سيستم|نظام|برنامج|منصه|منصة|software|system|platform)|(?:عندكم|عندك|موجود|متاح).{0,40}(?:سيستم|نظام|برنامج|software|system)|(?:سيستم|نظام|برنامج|software|system).{0,20}(?:عندكم|عندك|موجود|متاح)/iu.test(
    trimmed,
  );
}

/**
 * Current catalog facts that must be looked up (price, exact spec, availability, comparison).
 * Demo and quote requests are excluded so those tools stay in charge.
 */
export function looksLikeCurrentCatalogFactQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/(?:احجز|أحجز|هحجز|book(?:\s+a)?\s+demo|demo\s+booking|quotation|\bquote\b)/iu.test(trimmed)) {
    return false;
  }
  return /(?:\bprices?\b|how much|\bcost\b|specification|\bspecs?\b|battery|waterproof|noise[\s-]?cancell|compare|versus|\bvs\.?\b|in stock|availability|بكام|بكم|سعر|مواصفات|بطارية|قارن|مقارنة|متاح|مخزون)/iu.test(
    trimmed,
  );
}

/** True when the customer is browsing the catalog by type/name without booking intent. */
export function looksLikeProductCatalogQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  if (looksLikeCompanyIntroQuestion(trimmed)) return false;
  if (detectProductTypeIntent(trimmed)) return true;
  if (looksLikeSoftwareProductDescriptor(trimmed)) return true;
  const words = trimmed
    .replace(/[?؟!.،,]+/gu, " ")
    .split(/\s+/)
    .map((word) => arabicCatalogWordStem(word.trim()))
    .filter(Boolean);
  const generic = productTypeChatDef("product");
  if (
    generic?.aliases.some((alias) => {
      const aliasStem = arabicCatalogWordStem(alias);
      return words.includes(aliasStem) || words.includes(arabicWordKey(alias));
    })
  ) {
    return true;
  }
  // "قولي منتجاتك ايه" / "منتجاتكم ايه" — possessive forms not always split as the bare alias.
  if (/(?:منتجاتك|منتجاتكم|منتجاتنا|منتجاتكو|المنتجات|منتجات|products?\b)/iu.test(trimmed)) {
    return true;
  }
  return /(?:كتالوج|catalog)/iu.test(trimmed);
}
