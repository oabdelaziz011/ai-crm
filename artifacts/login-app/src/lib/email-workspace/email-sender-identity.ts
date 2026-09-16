/**
 * Canonical Email Identity → outbound From display-name helpers.
 * Branding stores senderName / senderDisplayName; SMTP uses company_email_settings.from_name.
 * Prefer Sender Name (From), then Sender Display Name.
 */

export function resolveOutboundFromDisplayName(input: {
  senderName?: string | null;
  senderDisplayName?: string | null;
}): string {
  const name = String(input.senderName ?? "").trim();
  if (name) return name;
  return String(input.senderDisplayName ?? "").trim();
}
