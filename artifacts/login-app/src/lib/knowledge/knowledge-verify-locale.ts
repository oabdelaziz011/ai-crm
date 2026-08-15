import type { KnowledgeCitation } from "@workspace/retrieval-engine";

const ARABIC_RE = /[\u0600-\u06FF]/;

/**
 * Arabic intents → short English FTS queries.
 * Keep each query to 1–2 words: Postgres plainto_tsquery ANDs every term.
 */
const ARABIC_SEARCH_HINTS: Array<{ match: RegExp; english: string }> = [
  { match: /ساعات|مواعيد|أوقات العمل|وقت العمل|الدوام/, english: "hours" },
  { match: /سياسة|السياسات|policy/, english: "policy" },
  { match: /استرداد|إلغاء|refund|cancel/, english: "refund" },
  { match: /تجربة|تجريبي|trial/, english: "trial" },
  { match: /دعم|عملاء|تذاكر|شكوى|ticket|support/, english: "support" },
  { match: /حجز|booking|appointment/, english: "booking" },
  { match: /فاتورة|فواتير|invoice|billing/, english: "invoice" },
  { match: /قاعدة المعرفة|معرفة الشركة|عن الشركة|المحتوى/, english: "knowledge" },
  { match: /ذكاء اصطناعي|موظف ذكاء|ai employee/, english: "AI" },
];

/** Lightweight EN→AR gloss for verify fallback when the model refuses. */
const EXCERPT_GLOSS: Array<{ match: RegExp; ar: string }> = [
  { match: /trial\s*policy/i, ar: "سياسة التجربة (Trial): مذكورة في المستند وقد تكون قيد التحديد (TBD)." },
  {
    match: /refund|cancellation/i,
    ar: "سياسة الاسترداد/الإلغاء: مذكورة ضمن سياسات الشركة في قاعدة المعرفة.",
  },
  {
    match: /ai\s*ticketing|suggested\s*replies/i,
    ar: "يوجد سياسات تشغيل للذكاء الاصطناعي مثل التذاكر المقترحة والردود المقترحة.",
  },
  {
    match: /customer\s*support|support\s*rules/i,
    ar: "توجد قواعد لدعم العملاء مذكورة في المقاطع المسترجعة.",
  },
  {
    match: /knowledge\s*base|purpose/i,
    ar: "المستند يوضح غرض قاعدة معرفة الشركة وقواعد التشغيل المرتبطة بها.",
  },
];

const ARABIC_REFUSAL_RE =
  /لا توجد معلومات|مفيش معلومات|لا يتوفر|غير متوفرة|لا يمكنني|لا أملك|not (enough|sufficient)|no (specific|relevant|information)/i;

export function containsArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

export function isArabicRefusalAnswer(text: string): boolean {
  return ARABIC_REFUSAL_RE.test(text.trim());
}

export function resolveKnowledgeVerifySearchQuery(
  question: string,
  documentTitles: string[] = [],
): { searchQueries: string[]; searchQuery: string; wantsArabicAnswer: boolean } {
  const trimmed = question.trim();
  const wantsArabicAnswer = containsArabic(trimmed);
  if (!wantsArabicAnswer) {
    return {
      searchQueries: [trimmed],
      searchQuery: trimmed,
      wantsArabicAnswer: false,
    };
  }

  const queries: string[] = [];
  for (const hint of ARABIC_SEARCH_HINTS) {
    if (hint.match.test(trimmed)) queries.push(hint.english);
  }

  const latinTerms = trimmed.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  for (const term of latinTerms) queries.push(term);

  // Last resort: a distinctive word from the document title (single token).
  for (const title of documentTitles) {
    const token = title
      .split(/[_\-\s.]+/)
      .map((part) => part.trim())
      .find((part) => part.length >= 4 && /[A-Za-z]/.test(part));
    if (token) {
      queries.push(token);
      break;
    }
  }

  if (queries.length === 0) {
    queries.push("policy", "knowledge", "support");
  }

  const searchQueries = [...new Set(queries.map((item) => item.trim()).filter(Boolean))];
  return {
    searchQueries,
    searchQuery: searchQueries[0]!,
    wantsArabicAnswer: true,
  };
}

function glossFromCitations(citations: KnowledgeCitation[]): string[] {
  const joined = citations.map((cite) => cite.excerpt).join("\n");
  const points = EXCERPT_GLOSS.filter((item) => item.match.test(joined)).map((item) => `- ${item.ar}`);
  return [...new Set(points)].slice(0, 4);
}

export function buildArabicVerifyFallbackAnswer(citations: KnowledgeCitation[]): string {
  if (citations.length === 0) return "";

  const glossPoints = glossFromCitations(citations);
  const bullets = citations
    .slice(0, 3)
    .map((cite, index) => `${index + 1}) من «${cite.documentTitle}»: ${cite.excerpt}`)
    .join("\n\n");

  if (glossPoints.length > 0) {
    return [
      "حسب المقاطع المسترجعة من قاعدة المعرفة، دي النقاط المتعلقة بالسياسات/القواعد:",
      "",
      ...glossPoints,
      "",
      "تفاصيل المصدر (بالإنجليزي):",
      bullets,
    ].join("\n");
  }

  return [
    "لقينا مقاطع ذات صلة في قاعدة المعرفة. ملخص سريع من المصدر:",
    "",
    bullets,
  ].join("\n");
}

export function buildArabicAnswerPrompt(question: string, citations: KnowledgeCitation[]): string {
  const context = citations
    .slice(0, 4)
    .map((cite, index) => `[${index + 1}] ${cite.documentTitle}\n${cite.excerpt}`)
    .join("\n\n");

  return [
    "أجب بالعربية المبسطة فقط، في 3–6 جمل أو نقاط قصيرة.",
    "المقاطع التالية تم استرجاعها لأنها مرتبطة بالسؤال — لخّص ما فيها حتى لو العنوان مش مطابق حرفيًا.",
    "مثال: سؤال عن «سياسة الشركة» لازم يذكر أي سياسات/قواعد ظاهرة (تجربة، استرداد، دعم، تشغيل AI...) حتى لو مكتوبة بالإنجليزي أو TBD.",
    "ممنوع تقول إن المعلومة غير موجودة إذا كانت المقاطع فيها محتوى ذو صلة.",
    "لو جزء ناقص أو TBD، اذكر ذلك بصراحة مع ذكر ما هو موجود.",
    "لا تخترع تفاصيل خارج المقاطع.",
    "",
    `السؤال: ${question}`,
    "",
    "المقاطع:",
    context,
  ].join("\n");
}

export function pickArabicVerifyAnswer(
  modelAnswer: string | null | undefined,
  citations: KnowledgeCitation[],
): string {
  const trimmed = modelAnswer?.trim() ?? "";
  if (trimmed && !isArabicRefusalAnswer(trimmed)) return trimmed;
  return buildArabicVerifyFallbackAnswer(citations);
}
