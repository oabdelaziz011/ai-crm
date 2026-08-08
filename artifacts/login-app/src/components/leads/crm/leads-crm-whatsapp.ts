/**
 * Pure WhatsApp route decision for Lead table actions.
 * Platform Conversation Center when Omavalue WhatsApp is connected; else external wa.me.
 */

export type LeadWhatsAppRoute =
  | { kind: "platform"; customerId: string | null; phone: string }
  | { kind: "external"; phone: string };

export function resolveLeadWhatsAppRoute(input: {
  hasWhatsAppIntegration: boolean;
  phone: string | null | undefined;
  customerId?: string | null;
}): LeadWhatsAppRoute | null {
  const phone = input.phone?.trim();
  if (!phone) return null;

  if (input.hasWhatsAppIntegration) {
    return {
      kind: "platform",
      customerId: input.customerId?.trim() || null,
      phone,
    };
  }

  return { kind: "external", phone };
}

export function externalWhatsAppUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d+]/g, "").replace("+", "")}`;
}
