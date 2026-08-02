import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";

export type SlashCommand = {
  command: string;
  label: string;
  body: string;
};

export type SavedReply = {
  id: string;
  title: string;
  body: string;
};

export type ReplyTemplate = {
  id: string;
  title: string;
  body: string;
};

export type RewriteOption = {
  id: string;
  label: string;
};

const SLASH_COMMANDS: Record<ResolvedConversationLanguage, SlashCommand[]> = {
  ar: [
    { command: "/مرحبا", label: "ترحيب", body: "أهلاً بحضرتك، شكراً لتواصلك معنا." },
    { command: "/شكرا", label: "شكر", body: "شكراً لتواصلك معنا." },
    { command: "/موعد", label: "موعد", body: "سأتحقق من المواعيد المتاحة وأعود إليك." },
    { command: "/فاتورة", label: "فاتورة", body: "سأراجع تفاصيل الفاتورة وأبلغك فوراً." },
    { command: "/استرجاع", label: "استرجاع", body: "سأساعدك في طلب الاسترجاع، هل يمكنك مشاركة رقم الطلب؟" },
    { command: "/إلغاء", label: "إلغاء", body: "سأتابع طلب الإلغاء الآن." },
    { command: "/شكوى", label: "شكوى", body: "أعتذر عن الإزعاج، سأرفع شكواك للفريق المختص." },
    { command: "/تصعيد", label: "تصعيد", body: "سأصعد طلبك إلى المشرف المختص لمتابعة أسرع." },
  ],
  en: [
    { command: "/hello", label: "Hello", body: "Hello! Thanks for reaching out — how can I help you today?" },
    { command: "/thanks", label: "Thanks", body: "Thank you for contacting us." },
    { command: "/refund", label: "Refund", body: "I can help with your refund. Could you share your order number?" },
    { command: "/order", label: "Order", body: "I'll check your order status and update you shortly." },
    { command: "/invoice", label: "Invoice", body: "I'll review your invoice details and get back to you." },
    { command: "/escalate", label: "Escalate", body: "I'll escalate this to a senior agent for faster resolution." },
    { command: "/cancel", label: "Cancel", body: "I'll process your cancellation request now." },
    { command: "/appointment", label: "Appointment", body: "I can help schedule that. What date works best for you?" },
  ],
};

const SAVED_REPLIES: Record<ResolvedConversationLanguage, SavedReply[]> = {
  ar: [
    { id: "ar-greet", title: "ترحيب", body: "أهلاً بحضرتك، كيف يمكنني مساعدتك؟" },
    { id: "ar-review", title: "مراجعة", body: "جاري مراجعة طلبك وسأعود إليك في أقرب وقت." },
    { id: "ar-thanks", title: "شكر", body: "شكراً لتواصلك معنا." },
    { id: "ar-wait", title: "انتظار", body: "شكراً على صبرك، ما زلت أتحقق من الأمر." },
  ],
  en: [
    { id: "en-greet", title: "Greeting", body: "Hello! How can I help you today?" },
    { id: "en-review", title: "Reviewing", body: "I'm reviewing your request and will follow up shortly." },
    { id: "en-thanks", title: "Thanks", body: "Thank you for contacting us." },
    { id: "en-wait", title: "Hold", body: "Thanks for your patience — I'm still checking on this." },
  ],
};

const REPLY_TEMPLATES: Record<ResolvedConversationLanguage, ReplyTemplate[]> = {
  ar: [
    {
      id: "ar-billing",
      title: "استفسار فواتير",
      body: "شكراً لتواصلك. سأراجع تفاصيل الفاتورة رقم {{invoice}} وأعود إليك.",
    },
    {
      id: "ar-booking",
      title: "تأكيد حجز",
      body: "تم تأكيد موعدك في {{date}}. يرجى إبلاغنا إذا احتجت أي تعديل.",
    },
    {
      id: "ar-escalation",
      title: "تصعيد",
      body: "تم تصعيد طلبك إلى فريق الدعم المتخصص للمتابعة.",
    },
  ],
  en: [
    {
      id: "en-billing",
      title: "Billing inquiry",
      body: "Thanks for reaching out. I'll review invoice {{invoice}} and get back to you.",
    },
    {
      id: "en-booking",
      title: "Booking confirmation",
      body: "Your appointment on {{date}} is confirmed. Let us know if you need changes.",
    },
    {
      id: "en-escalation",
      title: "Escalation",
      body: "Your request has been escalated to our specialist support team.",
    },
  ],
};

const REWRITE_OPTIONS: Record<ResolvedConversationLanguage, RewriteOption[]> = {
  ar: [
    { id: "professional", label: "رسمي" },
    { id: "friendly", label: "ودي" },
    { id: "shorter", label: "اختصار" },
    { id: "longer", label: "توسيع" },
    { id: "grammar", label: "تصحيح الأخطاء" },
    { id: "translate_en", label: "ترجمة" },
  ],
  en: [
    { id: "professional", label: "Professional" },
    { id: "friendly", label: "Friendly" },
    { id: "shorter", label: "Shorter" },
    { id: "longer", label: "Longer" },
    { id: "grammar", label: "Fix Grammar" },
    { id: "translate_ar", label: "Translate" },
  ],
};

export function getSlashCommands(language: ResolvedConversationLanguage): SlashCommand[] {
  return SLASH_COMMANDS[language];
}

export function filterSlashCommands(
  language: ResolvedConversationLanguage,
  query: string,
): SlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized === "/") return getSlashCommands(language);
  return getSlashCommands(language).filter(
    (entry) =>
      entry.command.toLowerCase().startsWith(normalized)
      || entry.label.toLowerCase().includes(normalized.replace(/^\//, "")),
  );
}

export function matchSlashCommand(
  language: ResolvedConversationLanguage,
  draft: string,
): SlashCommand | null {
  const trimmed = draft.trim();
  return getSlashCommands(language).find((entry) => entry.command === trimmed) ?? null;
}

export function getSavedReplies(language: ResolvedConversationLanguage): SavedReply[] {
  return SAVED_REPLIES[language];
}

export function getReplyTemplates(language: ResolvedConversationLanguage): ReplyTemplate[] {
  return REPLY_TEMPLATES[language];
}

export function getRewriteOptions(language: ResolvedConversationLanguage): RewriteOption[] {
  return REWRITE_OPTIONS[language];
}

export function getKeyboardHint(language: ResolvedConversationLanguage): string {
  if (language === "ar") {
    return "Enter إرسال · Shift+Enter سطر جديد · Ctrl+Enter إرسال";
  }
  return "Enter send · Shift+Enter newline · Ctrl+Enter send";
}

export type SnippetCommand = SlashCommand;

const SNIPPET_COMMANDS: Record<ResolvedConversationLanguage, SnippetCommand[]> = {
  ar: [
    { command: "::تحية", label: "تحية سريعة", body: "أهلاً بحضرتك!" },
    { command: "::متابعة", label: "متابعة", body: "سأتابع معك بأي تحديث." },
    { command: "::اعتذار", label: "اعتذار", body: "نعتذر عن الإزعاج ونقدّر صبرك." },
  ],
  en: [
    { command: "::greet", label: "Quick greeting", body: "Hi there!" },
    { command: "::followup", label: "Follow up", body: "I'll follow up with any updates." },
    { command: "::sorry", label: "Apology", body: "Sorry for the inconvenience and thank you for your patience." },
  ],
};

export function getSnippetCommands(language: ResolvedConversationLanguage): SnippetCommand[] {
  return SNIPPET_COMMANDS[language];
}

export function filterSnippetCommands(
  language: ResolvedConversationLanguage,
  query: string,
): SnippetCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized === "::") return getSnippetCommands(language);
  return getSnippetCommands(language).filter(
    (entry) =>
      entry.command.toLowerCase().startsWith(normalized)
      || entry.label.toLowerCase().includes(normalized.replace(/^::/, "")),
  );
}

export function matchSnippetCommand(
  language: ResolvedConversationLanguage,
  draft: string,
): SnippetCommand | null {
  const trimmed = draft.trim();
  return getSnippetCommands(language).find((entry) => entry.command === trimmed) ?? null;
}

export function getComposerPlaceholder(language: ResolvedConversationLanguage): string {
  if (language === "ar") {
    return "اكتب ردًا أو / للأوامر أو :: للمقتطفات…";
  }
  return "Write a reply, / for commands, or :: for snippets…";
}

const TONE_LABELS: Record<
  ResolvedConversationLanguage,
  Record<CustomerTone, string>
> = {
  ar: {
    neutral: "محايد",
    happy: "سعيد",
    angry: "غاضب",
    urgent: "عاجل",
    confused: "محتار",
  },
  en: {
    neutral: "Neutral",
    happy: "Happy",
    angry: "Angry",
    urgent: "Urgent",
    confused: "Confused",
  },
};

export function getToneLabel(tone: CustomerTone, language: ResolvedConversationLanguage): string {
  return TONE_LABELS[language][tone];
}

export function getTranslationToggleLabels(language: ResolvedConversationLanguage): {
  original: string;
  translated: string;
} {
  if (language === "ar") {
    return { original: "الأصل", translated: "مترجم" };
  }
  return { original: "Original", translated: "Translated" };
}
