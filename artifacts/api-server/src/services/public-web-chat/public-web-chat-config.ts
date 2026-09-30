export const PUBLIC_WEB_CHAT_ROUTE_PREFIX = "/api/public/web-chat";

export const PUBLIC_WEB_CHAT_LIMITS = {
  maxMessageChars: 2000,
  bodyLimit: "8kb",
  sessionTtlSeconds: 24 * 60 * 60,
  maxActiveSessionsPerIp: 5,
  readPageSize: 50,
  readPageMax: 100,
} as const;

export const PUBLIC_WEB_CHAT_VISITOR_TEXT_BY_LOCALE = {
  en: {
    unavailable: "Chat is unavailable right now.",
    handoff: "A team member will be with you shortly.",
    aiFallback: "I'm having trouble responding right now. A team member can help you shortly.",
    received: "Thanks, your message was received. A team member will reply here.",
    invalidRequest: "The request could not be processed.",
    messageTooLong: "The message is too long.",
    payloadTooLarge: "The request is too large.",
    rateLimited: "Too many requests. Please wait and try again.",
  },
  ar: {
    unavailable: "الدردشة غير متاحة حالياً.",
    handoff: "سيتواصل معك أحد أعضاء الفريق قريباً.",
    aiFallback: "أواجه صعوبة في الرد الآن. يمكن لأحد أعضاء الفريق مساعدتك قريباً.",
    received: "شكراً، تم استلام رسالتك. سيرد عليك أحد أعضاء الفريق هنا.",
    invalidRequest: "تعذر معالجة الطلب.",
    messageTooLong: "الرسالة طويلة جداً.",
    payloadTooLarge: "الطلب أكبر من الحد المسموح.",
    rateLimited: "طلبات كثيرة جداً. يرجى الانتظار ثم المحاولة مرة أخرى.",
  },
} as const;

export type PublicWebChatVisitorLocale = keyof typeof PUBLIC_WEB_CHAT_VISITOR_TEXT_BY_LOCALE;

/** English remains the default public contract; Arabic is selected only when the visitor locale is `ar`. */
export const PUBLIC_WEB_CHAT_VISITOR_TEXT = PUBLIC_WEB_CHAT_VISITOR_TEXT_BY_LOCALE.en;

export function resolvePublicWebChatVisitorLocale(raw: unknown): PublicWebChatVisitorLocale {
  if (typeof raw !== "string") return "en";
  const tag = raw.trim().toLowerCase().split(",")[0]?.split(";")[0]?.trim() ?? "";
  if (tag === "ar" || tag.startsWith("ar-")) return "ar";
  return "en";
}

export function publicWebChatVisitorCopy(locale?: unknown) {
  return PUBLIC_WEB_CHAT_VISITOR_TEXT_BY_LOCALE[resolvePublicWebChatVisitorLocale(locale)];
}

/**
 * Closed-conversation product policy (Phase 2.1, unchanged in 2.2/2.3):
 * A visitor POST to a closed Public Web Chat conversation is rejected with HTTP 503
 * (`temporarily_unavailable`). The backend does not persist the visitor message and
 * does not reopen the conversation. This is an existing product decision/gap, not a
 * security regression: staff must start a new session/conversation to continue.
 */
export const PUBLIC_WEB_CHAT_CLOSED_CONVERSATION_POLICY = {
  visitorStatus: 503,
  persistVisitorMessage: false,
  reopen: false,
} as const;

/**
 * Server kill switch on top of entitlement + widget checks.
 * Production stays OFF unless PUBLIC_WEB_CHAT_API_ENABLED=true is set explicitly.
 */
export function isPublicWebChatApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.PUBLIC_WEB_CHAT_API_ENABLED?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return (env.NODE_ENV ?? "development") !== "production";
}
