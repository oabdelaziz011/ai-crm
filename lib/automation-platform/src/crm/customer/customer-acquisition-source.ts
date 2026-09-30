/**
 * Pure customer acquisition-source helpers (shared with automation / tools).
 */

export const CUSTOMER_ACQUISITION_SOURCES = [
  "whatsapp",
  "messenger",
  "instagram",
  "email",
  "sms",
  "website",
  "manual",
  "other",
] as const;

export type CustomerAcquisitionSource = (typeof CUSTOMER_ACQUISITION_SOURCES)[number];

const SOURCE_SET = new Set<string>(CUSTOMER_ACQUISITION_SOURCES);

export function customerSourceFromChannelType(
  channelType: string | null | undefined,
): CustomerAcquisitionSource | null {
  const key = String(channelType ?? "")
    .trim()
    .toLowerCase();
  switch (key) {
    case "whatsapp":
      return "whatsapp";
    case "messenger":
      return "messenger";
    case "instagram":
      return "instagram";
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "web_chat":
    case "website":
    case "web":
      return "website";
    case "telegram":
    case "voice":
      return "other";
    default:
      return null;
  }
}

export function normalizeCustomerAcquisitionSource(
  value: string | null | undefined,
): CustomerAcquisitionSource | null {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return SOURCE_SET.has(key) ? (key as CustomerAcquisitionSource) : null;
}
