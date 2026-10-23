/**
 * Sales follow-up message composition: AI-first with anti-duplicate + safe fallbacks.
 * Does not invent prices/offers; uses only provided context.
 */

export type SalesFollowUpMessageContext = {
  companyId: string;
  customerDisplayName?: string | null;
  productOrInterest?: string | null;
  lastCustomerMessage?: string | null;
  salesStage?: string | null;
  openQuestions?: string[];
  channel: string;
  language?: string | null;
  attemptNumber: number;
  maxAttempts: number;
  previousFollowUpMessages: string[];
  goalHint?: string | null;
};

export type SalesFollowUpAiChatPort = {
  complete: (input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<{ text: string }>;
};

export type ComposeSalesFollowUpMessageResult = {
  text: string;
  source: "ai" | "fallback";
  rejectedDuplicates: number;
};

const FALLBACK_BY_ATTEMPT: Record<number, { ar: string[]; en: string[] }> = {
  1: {
    ar: [
      "مرحباً {name}، هل ما زلت مهتماً بـ {interest}؟ يسعدني مساعدتك بأي استفسار.",
      "أهلاً {name}، تواصلنا بخصوص {interest}. هل يناسبك أن نكمل من حيث توقفنا؟",
    ],
    en: [
      "Hi {name}, are you still interested in {interest}? Happy to help with any questions.",
      "Hello {name}, following up on {interest}. Would you like to continue where we left off?",
    ],
  },
  2: {
    ar: [
      "{name}، إن كان لديك سؤال عن {interest} لم نجب عليه بعد، أخبرني وسأوضحه لك.",
      "أردت التأكد أن تفاصيل {interest} واضحة لديك. هل تحتاج مقارنة أو توضيح إضافي؟",
    ],
    en: [
      "{name}, if you still have an unanswered question about {interest}, tell me and I’ll clarify.",
      "Just checking that the details for {interest} are clear. Need a comparison or more info?",
    ],
  },
  3: {
    ar: [
      "{name}، هذه متابعة أخيرة بخصوص {interest}. إن رغبت بالمتابعة لاحقاً يمكنك الرد في أي وقت.",
      "إذا كان توقيت {interest} غير مناسب الآن، أخبرني بما يناسبك وسأعيد التنسيق.",
    ],
    en: [
      "{name}, this is a final follow-up on {interest}. Reply anytime if you’d like to continue later.",
      "If the timing for {interest} isn’t right, tell me what works and we can reschedule.",
    ],
  },
};

function normalizeComparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when texts are identical or differ only by greeting/punctuation fluff. */
export function isSalesFollowUpMessageTooSimilar(candidate: string, previous: string): boolean {
  const a = normalizeComparable(candidate);
  const b = normalizeComparable(previous);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 24 && longer.includes(shorter)) return true;
  const tokensA = new Set(a.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(b.split(" ").filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.min(tokensA.size, tokensB.size);
  return ratio >= 0.85;
}

export function isDuplicateSalesFollowUpMessage(
  candidate: string,
  previousMessages: string[],
): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return true;
  return previousMessages.some((prev) => isSalesFollowUpMessageTooSimilar(trimmed, prev));
}

function languageIsArabic(language: string | null | undefined, lastMessage: string | null | undefined): boolean {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("ar")) return true;
  if (lang.startsWith("en")) return false;
  return /[\u0600-\u06FF]/.test(lastMessage || "");
}

function fillTemplate(
  template: string,
  ctx: SalesFollowUpMessageContext,
  arabic: boolean,
): string {
  const name =
    (ctx.customerDisplayName || "").trim() ||
    (arabic ? "عزيزي العميل" : "there");
  const interest =
    (ctx.productOrInterest || "").trim() ||
    (arabic ? "عرضنا" : "our offer");
  return template.replaceAll("{name}", name).replaceAll("{interest}", interest).trim();
}

export function composeSalesFollowUpFallbackMessage(
  ctx: SalesFollowUpMessageContext,
): string {
  const arabic = languageIsArabic(ctx.language, ctx.lastCustomerMessage);
  const bucket =
    FALLBACK_BY_ATTEMPT[Math.min(3, Math.max(1, ctx.attemptNumber))] ?? FALLBACK_BY_ATTEMPT[1]!;
  const pool = arabic ? bucket.ar : bucket.en;
  const previous = ctx.previousFollowUpMessages || [];
  for (const template of pool) {
    const text = fillTemplate(template, ctx, arabic);
    if (!isDuplicateSalesFollowUpMessage(text, previous)) return text;
  }
  // Last resort: append attempt marker so text is not identical.
  const base = fillTemplate(pool[0]!, ctx, arabic);
  const suffix = arabic
    ? ` (متابعة ${ctx.attemptNumber})`
    : ` (follow-up ${ctx.attemptNumber})`;
  return `${base}${suffix}`;
}

function buildSystemPrompt(arabic: boolean): string {
  if (arabic) {
    return [
      "أنت كاتب رسائل متابعة مبيعات لشركة ValueOR.",
      "اكتب رسالة قصيرة واحدة فقط (جملتان إلى أربع) مناسبة للقناة المحددة.",
      "لا تخترع أسعاراً أو خصومات أو مواعيد أو مواصفات غير موجودة في السياق.",
      "لا تدّعِ أن موظفاً تواصل مع العميل ما لم يُذكر ذلك.",
      "لا تستخدم إلحاحاً أو ضغطاً. كن مهذباً ومفيداً.",
      "اجعل الرسالة مختلفة جوهرياً عن رسائل المتابعة السابقة المعطاة.",
      "أجب بنص الرسالة فقط دون عنوان أو علامات اقتباس.",
    ].join("\n");
  }
  return [
    "You write sales follow-up messages for ValueOR.",
    "Write one short message only (2–4 sentences) suitable for the given channel.",
    "Do not invent prices, discounts, dates, or specs not in the context.",
    "Do not claim a human contacted the customer unless stated.",
    "No pressure or misleading urgency. Be polite and useful.",
    "Make the message substantively different from prior follow-ups provided.",
    "Reply with the message text only — no title or quotes.",
  ].join("\n");
}

function buildUserPrompt(ctx: SalesFollowUpMessageContext, arabic: boolean): string {
  const lines = [
    `attempt: ${ctx.attemptNumber} of ${ctx.maxAttempts}`,
    `channel: ${ctx.channel}`,
    `language: ${arabic ? "ar" : ctx.language || "en"}`,
    `customer: ${ctx.customerDisplayName || "(unknown)"}`,
    `interest: ${ctx.productOrInterest || "(unspecified)"}`,
    `stage: ${ctx.salesStage || "(unknown)"}`,
    `goal: ${ctx.goalHint || (ctx.attemptNumber === 1 ? "gentle check-in" : "add a new helpful reason to reconnect")}`,
    `last_customer_message: ${ctx.lastCustomerMessage || "(none)"}`,
    `open_questions: ${(ctx.openQuestions || []).join(" | ") || "(none)"}`,
    "previous_follow_ups:",
    ...(ctx.previousFollowUpMessages.length
      ? ctx.previousFollowUpMessages.map((m, i) => `${i + 1}. ${m}`)
      : ["(none)"]),
  ];
  return lines.join("\n");
}

export async function composeSalesFollowUpMessage(input: {
  context: SalesFollowUpMessageContext;
  ai?: SalesFollowUpAiChatPort | null;
  maxAiRetries?: number;
}): Promise<ComposeSalesFollowUpMessageResult> {
  const previous = input.context.previousFollowUpMessages || [];
  const arabic = languageIsArabic(input.context.language, input.context.lastCustomerMessage);
  let rejectedDuplicates = 0;
  const maxRetries = Math.max(1, Math.min(3, input.maxAiRetries ?? 2));

  if (input.ai) {
    for (let i = 0; i < maxRetries; i += 1) {
      try {
        const result = await input.ai.complete({
          system: buildSystemPrompt(arabic),
          user: buildUserPrompt(input.context, arabic) + (i > 0 ? "\nRewrite with a clearly different angle." : ""),
          temperature: 0.7 + i * 0.1,
          maxTokens: 280,
        });
        const text = (result.text || "").trim();
        if (!text) continue;
        if (isDuplicateSalesFollowUpMessage(text, previous)) {
          rejectedDuplicates += 1;
          continue;
        }
        return { text, source: "ai", rejectedDuplicates };
      } catch {
        // fall through to fallback
        break;
      }
    }
  }

  const fallback = composeSalesFollowUpFallbackMessage(input.context);
  return { text: fallback, source: "fallback", rejectedDuplicates };
}
