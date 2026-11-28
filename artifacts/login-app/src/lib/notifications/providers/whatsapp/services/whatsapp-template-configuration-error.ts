/** Explicit configuration / policy errors — never silent Email fallback. */
export class WhatsAppTemplateConfigurationError extends Error {
  readonly code:
    | "template_not_configured"
    | "template_not_approved"
    | "template_language_mismatch"
    | "template_params_invalid"
    | "template_not_allowed"
    | "hello_world_not_allowed"
    | "generic_system_blocked"
    | "session_window_closed_no_template"
    | "provider_template_missing"
    | "WHATSAPP_TEMPLATE_SETUP_PENDING";

  readonly purpose?: string;
  readonly metaName?: string;
  readonly language?: string;

  constructor(
    code: WhatsAppTemplateConfigurationError["code"],
    message: string,
    details?: { purpose?: string; metaName?: string; language?: string },
  ) {
    super(message);
    this.name = "WhatsAppTemplateConfigurationError";
    this.code = code;
    this.purpose = details?.purpose;
    this.metaName = details?.metaName;
    this.language = details?.language;
  }
}

export function isWhatsAppTemplateConfigurationError(
  error: unknown,
): error is WhatsAppTemplateConfigurationError {
  return error instanceof WhatsAppTemplateConfigurationError;
}

/** Map Meta Graph errors into explicit configuration failures. */
export function mapMetaWhatsAppTemplateProviderError(
  message: string,
  details?: { purpose?: string; metaName?: string; language?: string },
): WhatsAppTemplateConfigurationError | null {
  const text = message.toLowerCase();
  if (
    text.includes("#132001") ||
    text.includes("template name does not exist") ||
    text.includes("template does not exist")
  ) {
    return new WhatsAppTemplateConfigurationError(
      "provider_template_missing",
      `Meta rejected template send: ${message}`,
      details,
    );
  }
  return null;
}
