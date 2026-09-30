/**
 * Company Email channel selection shared by Email Workspace routes and quote sending.
 * Public metadata only — never credentials.
 */

const EMAIL_CHANNEL_PROVIDERS = new Set(["email", "generic.email", "smtp"]);

export const COMPANY_CHANNEL_SELECT =
  "id, company_id, display_name, is_enabled, provider, configuration, communication_channel:communication_channels(key)";

export type CompanyChannelRow = {
  id: string;
  company_id: string;
  display_name: string | null;
  is_enabled: boolean | null;
  provider: string | null;
  configuration: Record<string, unknown> | null;
  communication_channel?: { key?: string | null } | { key?: string | null }[] | null;
};

export function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function communicationChannelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channel;
  if (Array.isArray(embedded)) return readKey(embedded[0]?.key);
  return readKey(embedded?.key);
}

export function isCompanyEmailChannelRow(companyId: string, row: CompanyChannelRow): boolean {
  if (row.company_id !== companyId) return false;
  if (communicationChannelKey(row) === "email") return true;
  if (readKey(row.configuration?.channelKey) === "email") return true;
  if (EMAIL_CHANNEL_PROVIDERS.has(readKey(row.provider))) return true;
  if (readTrimmedString(row.configuration?.fromEmail)) return true;
  if (readKey(row.configuration?.credentialsSource) === "company_email_settings") return true;
  return readKey(row.configuration?.outboundProvider) === "smtp";
}

export function pickCompanyEmailChannel(companyId: string, rows: CompanyChannelRow[]): CompanyChannelRow | null {
  const matches = rows.filter((row) => isCompanyEmailChannelRow(companyId, row));
  return matches.find((row) => row.is_enabled !== false) ?? matches[0] ?? null;
}

export function toPublicEmailWorkspaceChannel(row: CompanyChannelRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    displayName: readTrimmedString(row.display_name),
    isEnabled: row.is_enabled !== false,
    fromEmail: readTrimmedString(row.configuration?.fromEmail),
    fromName: readTrimmedString(row.configuration?.fromName),
  };
}
