import { validateEgyptMobilePhone } from "../../../../ai-tool-router/src/utils/customer-phone-normalization.js";

/**
 * Instagram booking intake collects national numbers like 010… with no ISO region.
 * WhatsApp already supplies E.164, so this only rewrites Instagram Egyptian mobiles.
 */
export function resolveInstagramAutomationPhone(input: {
  channel: string | null | undefined;
  phone: string | null | undefined;
  configuredRegion?: string | null;
}): { phone: string | null; region: string | null } {
  const phone = typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : null;
  const region =
    typeof input.configuredRegion === "string" && input.configuredRegion.trim()
      ? input.configuredRegion.trim().toUpperCase()
      : null;

  if (!phone) return { phone: null, region };

  if (input.channel !== "instagram") {
    return { phone, region };
  }

  const egypt = validateEgyptMobilePhone(phone);
  if (!egypt.valid) {
    return { phone, region };
  }

  return {
    phone: `+${egypt.normalized}`,
    region: region ?? "EG",
  };
}
