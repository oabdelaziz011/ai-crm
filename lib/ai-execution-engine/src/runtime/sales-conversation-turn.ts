/**
 * Deterministic demo and quote turns.
 * The model is not asked to decide whether these tools run.
 */
import { detectCustomerLanguage } from "./customer-language.js";

export type SalesToolRouteResult = {
  status: string;
  output: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type SalesToolRoute = (
  toolKey: string,
  toolInput: Record<string, unknown>,
) => Promise<SalesToolRouteResult>;

type SalesLanguage = "ar" | "en" | "de";

export function salesCalendarYmd(offsetDays = 0, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (offsetDays === 0) return today;
  const [year, month, day] = today.split("-").map((part) => Number(part));
  const utc = new Date(Date.UTC(year!, month! - 1, day! + offsetDays));
  return utc.toISOString().slice(0, 10);
}

function salesLanguage(text: string): SalesLanguage {
  return detectCustomerLanguage(text) ?? "ar";
}

function looksLikeQuoteRequest(text: string): boolean {
  return /\b(?:quote|quotation|angebot|kostenvoranschlag)\b|عرض\s*سعر/iu.test(text);
}

function looksLikeDemoRequest(text: string): boolean {
  if (looksLikeQuoteRequest(text) && !/\bdemo\b|عرض\s*تجريبي|ديمو|demo\s+buchen|eine\s+demo/iu.test(text)) return false;
  return /book(?:\s+a)?\s+(?:product\s+)?demo|(?:احجز|أحجز|هحجز).{0,24}(?:عرض\s*تجريبي|ديمو|demo)|\bdemo\s+booking\b|demo\s+buchen|eine\s+demo|demo-termin/iu.test(
    text,
  );
}

function productLabels(text: string): string[] {
  const matches = text.match(/\b[A-Z][\p{L}\p{N}]*(?:\s+[A-Z][\p{L}\p{N}]*)+/gu) ?? [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const match of matches) {
    const label = match.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function quoteQuantity(text: string): number {
  const digit = text.match(/\b(\d{1,4})\b/);
  if (digit) {
    const value = Number(digit[1]);
    if (value >= 1 && value <= 999) return value;
  }
  return 1;
}

function demoDate(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];
  if (/(?:\btomorrow\b|بكره|بكرة|غدًا|غدا|\bmorgen\b)/iu.test(text)) return salesCalendarYmd(1);
  if (/(?:\btoday\b|\bheute\b|النهاردة|اليوم)/iu.test(text)) return salesCalendarYmd(0);
  return null;
}

function demoSlot(text: string): string | null {
  const clock = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock?.[1] && clock[2]) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${clock[2]}`;
    }
  }
  return null;
}

function rows(output: Record<string, unknown> | null, key: string): Array<Record<string, unknown>> {
  const value = output?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function ask(language: SalesLanguage, key: "demoWhen" | "demoTime" | "demoDay" | "demoPast" | "demoUnavailable" | "quoteProduct" | "quoteMissing" | "quoteFailed" | "actionFailed"): string {
  const copy: Record<typeof key, Record<SalesLanguage, string>> = {
    demoWhen: {
      ar: "عشان أحجز العرض، محتاج اليوم والساعة.",
      en: "To book the demo, I need the day and the start time.",
      de: "Für die Demo brauche ich den Tag und die Uhrzeit.",
    },
    demoTime: {
      ar: "قولي الساعة اللي تحب نبدأ بيها.",
      en: "What start time should I use?",
      de: "Welche Uhrzeit soll ich nehmen?",
    },
    demoDay: {
      ar: "قولي اليوم، من النهاردة أو بعده.",
      en: "Which day should I book? Today or a later day.",
      de: "Welchen Tag soll ich buchen? Heute oder später.",
    },
    demoPast: {
      ar: "التاريخ ده فات. قولي يوم من النهاردة أو بعده.",
      en: "That date has already passed. Tell me today or a later day.",
      de: "Dieses Datum liegt in der Vergangenheit. Nennen Sie heute oder einen späteren Tag.",
    },
    demoUnavailable: {
      ar: "حجز العرض مش متاح دلوقتي.",
      en: "Demo booking is not available right now.",
      de: "Die Demo-Buchung ist derzeit nicht verfügbar.",
    },
    quoteProduct: {
      ar: "عرض السعر لأي منتج؟ ابعت الاسم أو الرمز.",
      en: "Which product is the quote for? Send the name or SKU.",
      de: "Für welches Produkt ist das Angebot? Senden Sie den Namen oder die SKU.",
    },
    quoteMissing: {
      ar: "مش لاقي المنتج ده، فمسودة عرض السعر ما اتعملتش.",
      en: "I could not find that product, so the quote draft was not created.",
      de: "Dieses Produkt habe ich nicht gefunden, daher wurde kein Angebotsentwurf erstellt.",
    },
    quoteFailed: {
      ar: "مسودة عرض السعر ما اتعملتش، وما اتبعتش.",
      en: "The quote draft was not created, and it was not sent.",
      de: "Der Angebotsentwurf wurde nicht erstellt und nicht gesendet.",
    },
    actionFailed: {
      ar: "المعلومات تعذّر تحميلها، فمش هأكد إن الإجراء حصل.",
      en: "I could not load that information, so I can't confirm the action happened.",
      de: "Die Informationen konnten nicht geladen werden, daher bestätige ich die Aktion nicht.",
    },
  };
  return copy[key][language];
}

function bookingReply(language: SalesLanguage, confirmation: string, handedOff: boolean): string {
  if (language === "en") {
    return handedOff
      ? `The demo is booked. Confirmation ${confirmation}. A teammate will continue with you.`
      : `The demo is booked. Confirmation ${confirmation}. I could not confirm that a teammate has the conversation yet.`;
  }
  if (language === "de") {
    return handedOff
      ? `Die Demo ist gebucht. Bestätigung ${confirmation}. Ein Kollege übernimmt das Gespräch.`
      : `Die Demo ist gebucht. Bestätigung ${confirmation}. Ich konnte nicht bestätigen, dass ein Kollege das Gespräch übernommen hat.`;
  }
  return handedOff
    ? `تم حجز العرض. رقم الحجز: ${confirmation}. زميل من الفريق هيكمل معاك.`
    : `تم حجز العرض. رقم الحجز: ${confirmation}. لسه مش متأكد إن زميل استلم المحادثة.`;
}

async function runDemoTurn(input: {
  text: string;
  language: SalesLanguage;
  allowedToolKeys: readonly string[];
  route: SalesToolRoute;
}): Promise<string> {
  if (!input.allowedToolKeys.includes("create_demo_booking")) return "";
  const today = salesCalendarYmd(0);
  const date = demoDate(input.text, today);
  const slot = demoSlot(input.text);
  if (date && date < today) return ask(input.language, "demoPast");
  if (!date && !slot) return ask(input.language, "demoWhen");
  if (!date) return ask(input.language, "demoDay");
  if (!slot) return ask(input.language, "demoTime");

  let serviceId = "";
  if (input.allowedToolKeys.includes("list_demo_types")) {
    const listed = await input.route("list_demo_types", {});
    if (listed.status === "failed") return ask(input.language, "actionFailed");
    const demos = rows(listed.output, "demos");
    const choices = demos
      .map((demo) => ({
        serviceId: String(demo.serviceId ?? demo.id ?? "").trim(),
        name: String(demo.name ?? demo.title ?? "").trim(),
      }))
      .filter((demo) => demo.serviceId);
    if (choices.length === 1) {
      serviceId = choices[0]!.serviceId;
    } else if (choices.length > 1) {
      const labels = productLabels(input.text).map((label) => label.toLowerCase());
      const matched = choices.filter((demo) =>
        labels.some((label) => demo.name.toLowerCase().includes(label)),
      );
      if (matched.length === 1) serviceId = matched[0]!.serviceId;
      else {
        const names = choices.map((demo) => `- ${demo.name || demo.serviceId}`).join("\n");
        return input.language === "en"
          ? `Which demo should I book?\n${names}`
          : input.language === "de"
            ? `Welche Demo soll ich buchen?\n${names}`
            : `تحب أحجز أنهي عرض؟\n${names}`;
      }
    }
  }
  if (!serviceId) return ask(input.language, "demoUnavailable");

  const booked = await input.route("create_demo_booking", {
    serviceId,
    date,
    slotStart: slot,
  });
  const output = booked.output;
  const persisted = output?.success === true && output.bookingPersisted !== false && booked.status !== "failed";
  const confirmation = typeof output?.confirmationNumber === "string" ? output.confirmationNumber.trim() : "";
  if (!persisted || !confirmation) {
    return input.language === "en"
      ? "The demo was not booked."
      : input.language === "de"
        ? "Die Demo wurde nicht gebucht."
        : "العرض ما اتحجزش.";
  }
  let handedOff = output?.handoffSucceeded === true;
  if (!handedOff && input.allowedToolKeys.includes("escalate_to_human")) {
    const handed = await input.route("escalate_to_human", {
      reason: "Product demo booked. A human representative continues the demo.",
    });
    handedOff = handed.status !== "failed" && handed.output?.success !== false;
  }
  return bookingReply(input.language, confirmation, handedOff);
}

async function runQuoteTurn(input: {
  text: string;
  language: SalesLanguage;
  allowedToolKeys: readonly string[];
  route: SalesToolRoute;
}): Promise<string> {
  const canDraft = input.allowedToolKeys.includes("create_draft_quote");
  const canRequest = input.allowedToolKeys.includes("request_send_quote");
  if (!canDraft || !canRequest) return "";
  const labels = productLabels(input.text);
  if (labels.length !== 1) return ask(input.language, "quoteProduct");
  if (!input.allowedToolKeys.includes("search_products")) return ask(input.language, "actionFailed");

  const search = await input.route("search_products", { query: labels[0], limit: 5 });
  if (search.status === "failed") return ask(input.language, "actionFailed");
  const products = rows(search.output, "products");
  const wanted = labels[0]!.toLowerCase();
  const matches = products.filter((product) => {
    const name = String(product.name ?? "").toLowerCase();
    const sku = String(product.sku ?? "").toLowerCase();
    return name.includes(wanted) || wanted.includes(name) || sku === wanted;
  });
  if (matches.length !== 1) return ask(input.language, "quoteMissing");
  const productId = String(matches[0]?.productId ?? "").trim();
  if (!productId) return ask(input.language, "quoteMissing");

  const draft = await input.route("create_draft_quote", {
    productId,
    quantity: quoteQuantity(input.text),
  });
  const quoteId = typeof draft.output?.quoteId === "string" ? draft.output.quoteId.trim() : "";
  const drafted = draft.status !== "failed" && draft.output?.success === true && quoteId.length > 0;
  if (!drafted) return ask(input.language, "quoteFailed");

  const approval = await input.route("request_send_quote", { quoteId });
  const sent = approval.output?.sent === true;
  if (approval.status === "failed" || approval.output?.success === false) {
    return input.language === "en"
      ? "The quote draft was prepared, but approval was not requested, and it was not sent."
      : input.language === "de"
        ? "Der Angebotsentwurf wurde vorbereitet, aber die Freigabe wurde nicht angefordert und nichts wurde gesendet."
        : "مسودة عرض السعر اتجهزت، لكن طلب الموافقة ما حصلش، وما اتبعتش.";
  }
  if (sent) {
    return input.language === "en"
      ? "The quote was sent."
      : input.language === "de"
        ? "Das Angebot wurde gesendet."
        : "عرض السعر اتبعت.";
  }
  const number = typeof draft.output?.quoteNumber === "string" ? draft.output.quoteNumber.trim() : "";
  const label = number ? ` ${number}` : "";
  if (input.language === "en") {
    return `I prepared quote draft${label}. A teammate still has to approve it. It has not been sent.`;
  }
  if (input.language === "de") {
    return `Ich habe den Angebotsentwurf${label} vorbereitet. Ein Kollege muss ihn noch freigeben. Er wurde nicht gesendet.`;
  }
  return `جهّزت مسودة عرض السعر${label}. لسه محتاجة موافقة زميل، ولسه ما اتبعتش.`;
}

/**
 * Returns customer text when this turn is a demo or quote action.
 * An empty string means the turn is not one of those actions.
 */
export async function trySalesConversationTurn(input: {
  text: string;
  allowedToolKeys: readonly string[];
  route: SalesToolRoute;
}): Promise<string | null> {
  const text = input.text.trim();
  if (!text) return null;
  const language = salesLanguage(text);
  if (looksLikeQuoteRequest(text)) {
    const reply = await runQuoteTurn({ ...input, text, language });
    return reply || null;
  }
  if (looksLikeDemoRequest(text)) {
    const reply = await runDemoTurn({ ...input, text, language });
    return reply || null;
  }
  return null;
}
