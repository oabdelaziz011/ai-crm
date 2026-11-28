import {
  isWhatsAppMessagePurpose,
  type CompanyWhatsAppTemplateBinding,
  type CompanyWhatsAppTemplateBindings,
  type WhatsAppTemplateApprovalStatus,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";

function parseApprovalStatus(value: unknown): WhatsAppTemplateApprovalStatus {
  const status = String(value ?? "pending").toLowerCase();
  if (status === "approved" || status === "rejected" || status === "pending") return status;
  return "pending";
}

function parseBinding(value: unknown): CompanyWhatsAppTemplateBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const metaName = String(row.metaName ?? row.meta_name ?? "").trim();
  const language = String(row.language ?? "").trim();
  if (!metaName || !language) return null;
  return {
    metaName,
    language,
    approvalStatus: parseApprovalStatus(row.approvalStatus ?? row.approval_status),
  };
}

export function parseCompanyWhatsAppTemplateBindings(
  value: unknown,
): CompanyWhatsAppTemplateBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: CompanyWhatsAppTemplateBindings = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isWhatsAppMessagePurpose(key)) continue;
    const binding = parseBinding(raw);
    if (binding) out[key] = binding;
  }
  return out;
}
