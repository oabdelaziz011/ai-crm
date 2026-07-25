import type {
  WhatsAppTransport,
  WhatsAppTransportHealthResult,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

/** Browser-safe stub — WhatsApp send runs server-side via API routes. */
export class StubWhatsAppTransport implements WhatsAppTransport {
  readonly provider = "meta_cloud" as const;

  async send(): Promise<never> {
    throw new Error("WhatsApp send is only available on the server");
  }

  async healthCheck(): Promise<WhatsAppTransportHealthResult> {
    return {
      ok: false,
      provider: this.provider,
      latencyMs: 0,
      error: "WhatsApp health checks run server-side",
    };
  }
}
