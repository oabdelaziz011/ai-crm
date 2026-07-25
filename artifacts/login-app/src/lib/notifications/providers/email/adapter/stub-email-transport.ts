import type { EmailTransport, EmailTransportHealthResult } from "@/lib/notifications/providers/email/types/email-types";

/** Browser-safe stub — real SMTP runs server-side via API routes. */
export class StubEmailTransport implements EmailTransport {
  readonly provider = "stub";

  async send(): Promise<never> {
    throw new Error("Email send is only available on the server");
  }

  async healthCheck(): Promise<EmailTransportHealthResult> {
    return {
      ok: false,
      provider: this.provider,
      latencyMs: 0,
      error: "SMTP health checks run server-side",
    };
  }
}
