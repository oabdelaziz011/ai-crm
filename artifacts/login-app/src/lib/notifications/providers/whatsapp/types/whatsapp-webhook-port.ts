/** Future webhook verification port — not implemented in Sprint 6.3. */
export type WhatsAppWebhookVerifyInput = {
  mode: string;
  token: string;
  challenge: string;
};

export type WhatsAppWebhookEvent = {
  provider: string;
  rawPayload: unknown;
  receivedAt: string;
};

export interface WhatsAppWebhookPort {
  verifySubscription(input: WhatsAppWebhookVerifyInput, expectedToken: string): string | null;
  parseInboundEvents(rawPayload: unknown): WhatsAppWebhookEvent[];
}
