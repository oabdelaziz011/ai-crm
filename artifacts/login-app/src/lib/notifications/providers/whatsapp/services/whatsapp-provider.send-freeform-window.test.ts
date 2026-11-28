import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WhatsAppProvider } from "./whatsapp-provider.ts";
import { WhatsAppTemplateConfigurationError } from "./whatsapp-template-configuration-error.ts";
import type { CompanyWhatsAppSettings, WhatsAppTransport } from "../types/whatsapp-types.ts";

const settings: CompanyWhatsAppSettings = {
  companyId: "co-a",
  enabled: true,
  provider: "meta_cloud",
  accessToken: "fake-token",
  phoneNumberId: "fake-phone",
  businessAccountId: "fake-business",
  webhookVerifyToken: "fake-verify",
  apiVersion: "v21.0",
  appSecret: "",
  webhookCallbackUrl: "",
  defaultLanguage: "en_US",
  maxRetryCount: 3,
  templateBindings: {},
  hasAccessToken: true,
  hasWebhookVerifyToken: true,
  hasAppSecret: false,
  tokenStatus: "valid",
};

class RecordingTransport implements WhatsAppTransport {
  readonly provider = "meta_cloud" as const;
  sendCalls = 0;
  async send() {
    this.sendCalls += 1;
    return { messageId: "wamid.freeform", provider: this.provider };
  }
  async healthCheck() {
    return { ok: true, provider: this.provider, latencyMs: 0 };
  }
}

function sessionClient(rows: Array<{ external_thread_id: string; last_inbound_at: string | null }>) {
  return {
    from(table: string) {
      assert.equal(table, "channel_sessions");
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

function buildProvider(rows: Array<{ external_thread_id: string; last_inbound_at: string | null }>) {
  const transport = new RecordingTransport();
  const provider = new WhatsAppProvider(
    sessionClient(rows) as never,
    transport,
    { renderEvent() { throw new Error("not used"); } } as never,
    { async listPendingWhatsApp() { return []; } } as never,
    { async getSecure() { return settings; } } as never,
    { async append() {} } as never,
    {
      async checkAccess() {
        return { allowed: true, reason: "entitled" as const };
      },
      async recordUsage() {
        return { recorded: true, reason: "recorded" as const };
      },
    },
  );
  return { provider, transport };
}

describe("sendFreeformText server-authoritative window", () => {
  it("rejects freeform when client claims window open but persisted window is closed", async () => {
    const { provider, transport } = buildProvider([
      {
        external_thread_id: "+442079460958",
        last_inbound_at: "2020-01-01T00:00:00.000Z",
      },
    ]);
    await assert.rejects(
      () =>
        provider.sendFreeformText("co-a", "+442079460958", "Hello", {
          sessionWindowOpen: true,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "session_window_closed_no_template",
    );
    assert.equal(transport.sendCalls, 0);
  });

  it("allows freeform when persisted window is open even if client claims closed", async () => {
    const { provider, transport } = buildProvider([
      {
        external_thread_id: "+442079460958",
        last_inbound_at: new Date().toISOString(),
      },
    ]);
    const result = await provider.sendFreeformText("co-a", "+442079460958", "Hello", {
      sessionWindowOpen: false,
    });
    assert.equal(result.status, "completed");
    assert.equal(transport.sendCalls, 1);
  });

  it("fails closed when session is missing", async () => {
    const { provider, transport } = buildProvider([]);
    await assert.rejects(
      () => provider.sendFreeformText("co-a", "+442079460958", "Hello", { sessionWindowOpen: true }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "session_window_closed_no_template",
    );
    assert.equal(transport.sendCalls, 0);
  });

  it("fails closed when matching session has null last_inbound_at", async () => {
    const { provider, transport } = buildProvider([
      { external_thread_id: "+442079460958", last_inbound_at: null },
    ]);
    await assert.rejects(
      () => provider.sendFreeformText("co-a", "+442079460958", "Hello", { sessionWindowOpen: true }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "session_window_closed_no_template",
    );
    assert.equal(transport.sendCalls, 0);
  });
});
