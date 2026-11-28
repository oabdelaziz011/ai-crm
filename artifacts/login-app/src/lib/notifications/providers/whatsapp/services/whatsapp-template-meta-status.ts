/** Map Meta Graph template status strings to ValueOR storage enum. */

export const COMPANY_WHATSAPP_TEMPLATE_META_STATUSES = [
  "NOT_CREATED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "DISABLED",
  "IN_APPEAL",
  "DELETED",
  "UNKNOWN",
] as const;

export type CompanyWhatsAppTemplateMetaStatus =
  (typeof COMPANY_WHATSAPP_TEMPLATE_META_STATUSES)[number];

const ALIASES: Record<string, CompanyWhatsAppTemplateMetaStatus> = {
  APPROVED: "APPROVED",
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  PAUSED: "PAUSED",
  DISABLED: "DISABLED",
  IN_APPEAL: "IN_APPEAL",
  DELETED: "DELETED",
  NOT_CREATED: "NOT_CREATED",
  UNKNOWN: "UNKNOWN",
  // Meta occasionally surfaces quality/paused variants
  FLAGSHIP: "APPROVED",
};

export function mapMetaWhatsAppTemplateStatus(
  value: unknown,
): CompanyWhatsAppTemplateMetaStatus {
  if (value == null || value === "") return "UNKNOWN";
  const key = String(value).trim().toUpperCase().replace(/\s+/g, "_");
  return ALIASES[key] ?? "UNKNOWN";
}

export function isMetaApprovedTemplateStatus(
  status: CompanyWhatsAppTemplateMetaStatus | string,
): boolean {
  return String(status).toUpperCase() === "APPROVED";
}

export function normalizeWhatsAppTemplateLanguage(code: string): string {
  const trimmed = code.trim().replace(/-/g, "_");
  if (!trimmed) return "en_US";
  // Meta often returns "en_US"; catalog may use "en"
  if (!trimmed.includes("_") && trimmed.length === 2) {
    if (trimmed.toLowerCase() === "en") return "en_US";
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function whatsappTemplateLanguagesMatch(a: string, b: string): boolean {
  const left = normalizeWhatsAppTemplateLanguage(a).toLowerCase();
  const right = normalizeWhatsAppTemplateLanguage(b).toLowerCase();
  if (left === right) return true;
  return (left.split("_")[0] ?? left) === (right.split("_")[0] ?? right);
}
