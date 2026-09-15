/**
 * Channel-agnostic sender identity for workflow variables.
 * WhatsApp `from` is a phone; Instagram IGSID is not.
 */

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function buildChannelSenderIdentityVariables(input: {
  channelKey: string;
  externalUserId?: string | null;
}): Record<string, unknown> {
  const channel = readTrimmed(input.channelKey).toLowerCase();
  const sender = readTrimmed(input.externalUserId);
  const variables: Record<string, unknown> = {};
  if (sender) {
    variables.sender_external_id = sender;
  }
  if (channel === "whatsapp" && sender) {
    const digits = readDigits(sender);
    if (digits) {
      variables.whatsapp_sender_phone = digits;
      variables.sender_phone = digits;
    }
  }
  return variables;
}

export function buildWorkflowCustomerIdentityVariables(customer: {
  id: string;
  name?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
}): Record<string, unknown> {
  const id = customer.id.trim();
  if (!id) return {};
  const phone = readTrimmed(customer.phone) || readTrimmed(customer.phoneE164);
  return {
    customer: {
      id,
      name: readTrimmed(customer.name) || null,
      phone: phone || null,
      phone_e164: readTrimmed(customer.phoneE164) || null,
    },
  };
}
