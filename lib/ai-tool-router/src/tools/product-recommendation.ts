/**
 * Ranks products the company catalog search already returned.
 * Evidence is token overlap with catalog text. No invented warranty, stock, or price.
 */

export type RecommendationLanguage = "ar" | "en" | "de";

export type RecommendationPrice =
  | { status: "listed"; amount: number; currency: string }
  | { status: "not_listed" };

export type RecommendationCandidate = {
  productId: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: readonly string[];
  price?: RecommendationPrice | null;
  active?: boolean;
  imageUrls?: readonly string[];
};

export type RecommendationMessage = {
  role: "customer" | "assistant";
  text: string;
};

export type RankedRecommendation = {
  productId: string;
  name: string;
  sku: string | null;
  price: RecommendationPrice;
  reasons: string[];
  imageUrls: string[];
};

export type RecommendationDecision = {
  action:
    | "recommend"
    | "clarify"
    | "no_match"
    | "opt_out"
    | "declined"
    | "already_presented"
    | "contradictory";
  language: RecommendationLanguage;
  products: RankedRecommendation[];
  clarification: string | null;
  evidence: string[];
  customerText: string;
};

const STOP = new Set([
  "the", "and", "for", "with", "this", "that", "want", "need", "looking", "something", "product", "products",
  "please", "about", "from", "your", "have", "any", "can", "you", "recommend", "suggestion", "suggest",
  "عايز", "عايزة", "محتاج", "محتاجة", "منتج", "منتجات", "حاجة", "حاجه", "عن", "في", "من", "على", "عاوز",
  "اقتراح", "اقتراحات", "ترشح", "رشح", "لو", "سمحت",
  "ich", "bitte", "etwas", "für", "fur", "ein", "eine", "einen", "der", "die", "das", "und", "mit",
  "brauche", "möchte", "mochte", "empfehlung", "empfehlen", "produkt", "produkte",
]);

const CHEAP = ["cheap", "budget", "affordable", "رخيص", "رخيصة", "اقتصادي", "günstig", "gunstig", "billig"];
const LUXURY = ["luxury", "premium", "فاخر", "فاخرة", "luxus", "premium"];

const OPT_OUT =
  /(?:don'?t recommend|do not recommend|no recommendations|stop suggesting|لا\s*(?:ترشح|تقترح)|مش\s*عايز\s*اقتراح|بدون\s*اقتراحات|keine\s+(?:empfehlung|vorschl))/iu;

const DECLINE =
  /(?:no thanks|not this|don'?t want (?:this|that)|لا\s*شكرا|مش\s*(?:عايز|ناسب)|غير\s*مناسب|nein\s*danke|nicht\s*das)/iu;

const ALTERNATIVE = /(?:alternative|alternatives|instead|other option|بديل|بدائل|بدل|stattdessen|alternativ)/iu;

const VALID_IMAGE = /^https:\/\/[^\s]+$/i;

export function lastClearRecommendationLanguage(
  messages: readonly RecommendationMessage[],
): RecommendationLanguage {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "customer") continue;
    const detected = detectLanguage(message.text);
    if (detected) return detected;
  }
  return "en";
}

export function customerOptedOutOfRecommendations(text: string): boolean {
  return OPT_OUT.test(text);
}

export function looksLikeProductRecommendationTurn(text: string): boolean {
  if (customerOptedOutOfRecommendations(text) || DECLINE.test(text)) return true;
  return /(?:recommend|suggest|alternative|budget|looking for|something for|need a|اقتراح|ترشح|رشح|بديل|ميزانية|بدور|حاجة\s+ل|brauche|empfehl|vorschlag|etwas\s+für)/iu.test(
    text,
  );
}

export function recommendFromCatalog(input: {
  messages: readonly RecommendationMessage[];
  products: readonly RecommendationCandidate[];
  showPrices: boolean;
  previouslyRecommendedIds?: readonly string[];
  declinedProductIds?: readonly string[];
}): RecommendationDecision {
  const language = lastClearRecommendationLanguage(input.messages);
  const latest = [...input.messages].reverse().find((message) => message.role === "customer")?.text ?? "";
  const empty = (action: RecommendationDecision["action"], customerText: string, clarification: string | null = null): RecommendationDecision => ({
    action,
    language,
    products: [],
    clarification,
    evidence: [],
    customerText,
  });

  if (customerOptedOutOfRecommendations(latest)) {
    return empty("opt_out", copy(language, "optOut"));
  }
  if (DECLINE.test(latest)) {
    return empty("declined", copy(language, "declined"));
  }

  const constraints = extractConstraints(input.messages);
  if (constraints.contradictory) {
    const clarification = copy(language, "contradictory");
    return empty("contradictory", clarification, clarification);
  }
  if (constraints.terms.length === 0) {
    const clarification = copy(language, "clarify");
    return empty("clarify", clarification, clarification);
  }

  const declined = new Set(input.declinedProductIds ?? []);
  const previous = new Set(input.previouslyRecommendedIds ?? []);
  const skipPrevious = ALTERNATIVE.test(latest);
  const ranked: Array<RankedRecommendation & { score: number }> = [];

  for (const product of input.products) {
    if (product.active === false) continue;
    if (!product.productId || !product.name?.trim()) continue;
    if (declined.has(product.productId)) continue;
    if (skipPrevious && previous.has(product.productId)) continue;
    const price = publicPrice(product.price, input.showPrices);
    if (constraints.budget != null && (price.status !== "listed" || price.amount > constraints.budget)) continue;
    const haystack = catalogHaystack(product);
    const matched = constraints.terms.filter((term) => haystack.includes(term));
    const named = customerNamed(latest, product);
    if (matched.length === 0 && !named) continue;
    const reasons = named
      ? [copy(language, "named")]
      : matched.slice(0, 3).map((term) => `${copy(language, "matches")} ${term}`);
    ranked.push({
      productId: product.productId,
      name: product.name.trim(),
      sku: product.sku?.trim() || null,
      price,
      reasons,
      imageUrls: (product.imageUrls ?? []).filter((url) => VALID_IMAGE.test(url)).slice(0, 3),
      score: matched.length + (named ? 5 : 0),
    });
  }

  ranked.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const top = ranked.slice(0, 3).map(({ score: _score, ...product }) => product);
  if (top.length === 0) {
    return empty("no_match", copy(language, "noMatch"));
  }

  const sameAsBefore =
    !skipPrevious &&
    previous.size > 0 &&
    top.every((product) => previous.has(product.productId));
  if (sameAsBefore) {
    return empty("already_presented", copy(language, "already"));
  }

  const lines = top.map((product) => formatLine(product, language, input.showPrices));
  return {
    action: "recommend",
    language,
    products: top,
    clarification: null,
    evidence: top.flatMap((product) => product.reasons),
    customerText: [copy(language, "intro"), ...lines, copy(language, "next")].join("\n"),
  };
}

function extractConstraints(messages: readonly RecommendationMessage[]): {
  terms: string[];
  budget: number | null;
  contradictory: boolean;
} {
  let terms: string[] = [];
  let budget: number | null = null;
  let sawCheap = false;
  let sawLuxury = false;
  let contradictory = false;

  for (const message of messages) {
    if (message.role !== "customer") continue;
    const text = message.text;
    if (ALTERNATIVE.test(text) || /(?:بدل|instead|stattdessen|rather)/iu.test(text)) terms = [];
    const budgets = readBudgets(text);
    if (budgets.length > 1) contradictory = true;
    else if (budgets.length === 1) budget = budgets[0] ?? budget;
    if (CHEAP.some((token) => text.toLocaleLowerCase().includes(token))) sawCheap = true;
    if (LUXURY.some((token) => text.toLocaleLowerCase().includes(token))) sawLuxury = true;
    const latestOnly = detectLanguage(text);
    if (latestOnly && CHEAP.some((token) => text.toLocaleLowerCase().includes(token)) && !LUXURY.some((token) => text.toLocaleLowerCase().includes(token))) {
      sawLuxury = false;
    }
    if (latestOnly && LUXURY.some((token) => text.toLocaleLowerCase().includes(token)) && !CHEAP.some((token) => text.toLocaleLowerCase().includes(token))) {
      sawCheap = false;
    }
    terms = unique([...terms, ...contentTerms(text)]);
  }

  if (sawCheap && sawLuxury) contradictory = true;
  return { terms, budget, contradictory };
}

function contentTerms(text: string): string[] {
  return text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase())
    .filter((token) => token.length >= 3 && !STOP.has(token) && !/^\d+$/.test(token));
}

function readBudgets(text: string): number[] {
  const found: number[] = [];
  // A phone-length digit run is contact data, not a second budget.
  const pattern = /(?<![\d])(\d{2,7})(?!\d)(?:\s*(?:egp|usd|eur|sar|aed|جنيه|دولار|ريال|euro))?/giu;
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1]);
    if (Number.isFinite(amount) && amount > 0) found.push(amount);
  }
  return [...new Set(found)];
}

function catalogHaystack(product: RecommendationCandidate): string {
  return [product.name, product.sku, product.brand, product.summary, product.description, ...(product.tags ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLocaleLowerCase();
}

function customerNamed(latest: string, product: RecommendationCandidate): boolean {
  const text = latest.toLocaleLowerCase();
  const name = product.name.trim().toLocaleLowerCase();
  const sku = product.sku?.trim().toLocaleLowerCase() ?? "";
  return (name.length >= 3 && text.includes(name)) || (sku.length >= 2 && text.includes(sku));
}

function publicPrice(price: RecommendationPrice | null | undefined, showPrices: boolean): RecommendationPrice {
  if (!showPrices || !price || price.status !== "listed") return { status: "not_listed" };
  if (!Number.isFinite(price.amount) || price.amount <= 0 || !price.currency) return { status: "not_listed" };
  return { status: "listed", amount: price.amount, currency: price.currency };
}

function formatLine(product: RankedRecommendation, language: RecommendationLanguage, showPrices: boolean): string {
  const price =
    showPrices && product.price.status === "listed"
      ? ` — ${product.price.amount} ${product.price.currency}`
      : "";
  const reason = product.reasons[0] ? ` (${product.reasons[0]})` : "";
  return `- ${product.name}${product.sku ? ` (${product.sku})` : ""}${price}${reason}`;
}

function detectLanguage(text: string): RecommendationLanguage | null {
  if (/[ء-ي]/.test(text)) return "ar";
  if (/\b(?:ich|bitte|keine|etwas|für|nicht|brauche|empfehlung)\b/iu.test(text)) return "de";
  if (/\b(?:i|need|want|please|budget|something|recommend|looking)\b/i.test(text)) return "en";
  return null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function copy(language: RecommendationLanguage, key: string): string {
  const table: Record<RecommendationLanguage, Record<string, string>> = {
    ar: {
      optOut: "تمام، مش هقترح منتجات تاني غير لما تطلب.",
      declined: "حاضر، مش هكرر الاقتراح ده. قولّي لو احتجت حاجة تانية.",
      contradictory: "المطلوب فيه اتجاهين مختلفين. تحب نركّز على الاقتصادي ولا الفاخر؟",
      clarify: "تحب المنتج يكون لأي استخدام، وفيه ميزانية معينة؟",
      noMatch: "مفيش منتج نشط في كتالوج الشركة يطابق الطلب ده.",
      already: "الاقتراح ده اتقدم قبل كده. تحب خيار مختلف؟",
      named: "العميل طلب هذا المنتج بالاسم",
      matches: "يطابق وصف الكتالوج:",
      intro: "أنسب الخيارات من كتالوج الشركة:",
      next: "تحب تفاصيل أو مقارنة؟",
    },
    de: {
      optOut: "Verstanden. Ich mache keine weiteren Produktempfehlungen, bis Sie danach fragen.",
      declined: "Verstanden. Ich wiederhole diesen Vorschlag nicht.",
      contradictory: "Die Anforderungen widersprechen sich. Soll es günstig oder hochwertig sein?",
      clarify: "Wofür soll das Produkt sein, und gibt es ein Budget?",
      noMatch: "Kein aktives Produkt im Katalog dieses Unternehmens passt dazu.",
      already: "Dieser Vorschlag wurde bereits gemacht. Möchten Sie eine andere Option?",
      named: "vom Kunden namentlich genannt",
      matches: "passt zum Katalogtext:",
      intro: "Passende Produkte aus dem Unternehmenskatalog:",
      next: "Soll ich Details oder einen Vergleich zeigen?",
    },
    en: {
      optOut: "Understood. I will not recommend products unless you ask.",
      declined: "Understood. I will not repeat that suggestion.",
      contradictory: "Those requirements conflict. Should I focus on the lower budget or the premium option?",
      clarify: "What will you use it for, and do you have a budget?",
      noMatch: "No active product in this company's catalog matches that request.",
      already: "That suggestion was already shared. Do you want a different option?",
      named: "customer asked for this product by name",
      matches: "matches catalog text:",
      intro: "Closest matches from this company's catalog:",
      next: "I can share details or a comparison if you want.",
    },
  };
  return table[language][key] ?? table.en[key] ?? "";
}
