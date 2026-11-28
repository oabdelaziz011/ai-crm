/** Structured setup errors — never imply Meta APPROVED. */

export const WHATSAPP_TEMPLATE_SETUP_PENDING = "WHATSAPP_TEMPLATE_SETUP_PENDING" as const;

export class WhatsAppTemplateSetupError extends Error {
  readonly code: typeof WHATSAPP_TEMPLATE_SETUP_PENDING | "WHATSAPP_TEMPLATE_META_PERMISSION";
  readonly statusCode: number;

  constructor(
    message: string,
    code: WhatsAppTemplateSetupError["code"] = WHATSAPP_TEMPLATE_SETUP_PENDING,
    statusCode = 503,
  ) {
    super(message);
    this.name = "WhatsAppTemplateSetupError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isWhatsAppTemplateSetupError(
  error: unknown,
): error is WhatsAppTemplateSetupError {
  return error instanceof WhatsAppTemplateSetupError;
}

/** Detect missing company_whatsapp_templates relation (migration 483 not applied). */
export function isMissingCompanyWhatsAppTemplatesRelation(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return (
    /company_whatsapp_templates/i.test(blob) &&
    /(does not exist|relation|could not find the table|schema cache|undefined_table)/i.test(blob)
  );
}
