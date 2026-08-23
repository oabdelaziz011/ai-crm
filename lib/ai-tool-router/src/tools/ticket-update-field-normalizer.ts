export type TicketUpdateFieldIntent = "subject" | "description" | "ambiguous" | "none";

const SUBJECT_PATTERNS: RegExp[] = [
  /عنوان\s*(?:ال)?(?:تذك(?:رة|ره)?|شكو(?:ى|ا)?)/iu,
  /موضوع\s*(?:ال)?(?:تذك(?:رة|ره)?|شكو(?:ى|ا)?)/iu,
  /(?:حدّ?ث|update|change)\s+(?:ال)?(?:عنوان|موضوع)/iu,
  /\b(?:subject|title)\b/i,
];

const DESCRIPTION_PATTERNS: RegExp[] = [
  /وصف\s*(?:ال)?(?:تذك(?:رة|ره)?|شكو(?:ى|ا)?)/iu,
  /تفاصيل\s*(?:ال)?(?:تذك(?:رة|ره)?|شكو(?:ى|ا)?)/iu,
  /(?:حدّ?ث|update|change)\s+(?:ال)?(?:وصف|تفاصيل)/iu,
  /\b(?:description|details)\b/i,
];

function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = typeof value === "string" ? value.trim() : String(value).trim();
  return normalized || undefined;
}

export function detectUpdateTicketFieldIntent(message: string): TicketUpdateFieldIntent {
  const text = message.trim();
  if (!text) return "none";
  const wantsSubject = SUBJECT_PATTERNS.some((pattern) => pattern.test(text));
  const wantsDescription = DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text));
  if (wantsSubject && wantsDescription) return "ambiguous";
  if (wantsSubject) return "subject";
  if (wantsDescription) return "description";
  return "none";
}

export function extractUpdateTicketValueFromMessage(message: string): string | undefined {
  const match = message.match(/(?:إلى|to)\s+["']?(.+?)["']?\s*$/iu);
  return match?.[1]?.trim() || undefined;
}

/**
 * Rewrites update_ticket tool args so Arabic subject/description intents map to the correct field.
 * When intent is subject-only, description is omitted so the DB description is not touched.
 */
export function normalizeUpdateTicketInput(
  args: Record<string, unknown>,
  userMessage: string,
): Record<string, unknown> {
  const intent = detectUpdateTicketFieldIntent(userMessage);
  if (intent === "none" || intent === "ambiguous") return args;

  const ticketId = args.ticketId;
  const llmSubject = readOptionalString(args.subject);
  const llmDescription = readOptionalString(args.description);
  const extracted = extractUpdateTicketValueFromMessage(userMessage);

  if (intent === "subject") {
    const value = llmSubject ?? llmDescription ?? extracted;
    if (!value) return args;
    const next: Record<string, unknown> = {};
    if (ticketId != null) next.ticketId = ticketId;
    next.subject = value;
    return next;
  }

  const value = llmDescription ?? llmSubject ?? extracted;
  if (!value) return args;
  const next: Record<string, unknown> = {};
  if (ticketId != null) next.ticketId = ticketId;
  next.description = value;
  return next;
}
