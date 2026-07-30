export const WHATSAPP_INTERACTIVE_LIST_MAX_ROWS = 10;
export const WHATSAPP_INTERACTIVE_LIST_MAX_SECTIONS = 10;

export type WhatsAppInteractiveListPayload = {
  type?: string;
  interactive?: {
    type?: string;
    action?: {
      sections?: Array<{ rows?: Array<unknown> }>;
    };
  };
};

export function countWhatsAppInteractiveListRows(payload: WhatsAppInteractiveListPayload): number {
  const sections = payload.interactive?.action?.sections;
  if (!Array.isArray(sections)) return 0;
  return sections.reduce((total, section) => total + (section.rows?.length ?? 0), 0);
}

export function validateWhatsAppInteractiveListPayload(payload: WhatsAppInteractiveListPayload): void {
  if (payload.type !== "interactive" || payload.interactive?.type !== "list") return;

  const sections = payload.interactive.action?.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("WhatsApp interactive list requires at least one section.");
  }

  if (sections.length > WHATSAPP_INTERACTIVE_LIST_MAX_SECTIONS) {
    throw new Error(
      `WhatsApp interactive list exceeds ${WHATSAPP_INTERACTIVE_LIST_MAX_SECTIONS} sections (got ${sections.length}).`,
    );
  }

  const rowCount = countWhatsAppInteractiveListRows(payload);
  if (rowCount > WHATSAPP_INTERACTIVE_LIST_MAX_ROWS) {
    throw new Error(
      `WhatsApp interactive list exceeds ${WHATSAPP_INTERACTIVE_LIST_MAX_ROWS} rows (got ${rowCount}).`,
    );
  }
}

export function isWhatsAppInteractiveListPayloadValid(payload: WhatsAppInteractiveListPayload): boolean {
  try {
    validateWhatsAppInteractiveListPayload(payload);
    return true;
  } catch {
    return false;
  }
}
