import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WhatsAppProvider } from "./whatsapp-provider.ts";
import { WhatsAppQueueConsumer } from "./whatsapp-queue-consumer.ts";
import { WhatsAppRenderer } from "../renderer/whatsapp-renderer.ts";
import { WhatsAppProviderRejectedError } from "../adapter/meta-whatsapp-transport.ts";
import type { CompanyWhatsAppSettings, WhatsAppTransport } from "../types/whatsapp-types.ts";

type QueueRow = {
  id: string;
  company_id: string;
  notification_id: string | null;
  channel: string;
  status: string;
  retry_count: number;
  scheduled_at: string;
  processed_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function queueRow(id: string): QueueRow {
  return {
    id,
    company_id: "company-isolated",
    notification_id: null,
    channel: "whatsapp",
    status: "pending",
    retry_count: 0,
    scheduled_at: "2020-01-01T00:00:00.000Z",
    processed_at: null,
    last_error: null,
    payload: {
      event: "generic_system",
      params: { phoneE164: "+442079460958", companyId: "company-isolated" },
    },
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
  };
}

function fakeClient(rows: QueueRow[], failCompletedWrites = 0) {
  let completedFailures = failCompletedWrites;
  return {
    from(table: string) {
      const state: {
        op: "select" | "update";
        filters: Array<[string, unknown, "eq" | "lte"]>;
        patch?: Record<string, unknown>;
      } = { op: "select", filters: [] };
      const builder = {
        select() {
          state.op = "select";
          return builder;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          state.patch = patch;
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push([column, value, "eq"]);
          if (state.op === "update" && state.filters.length >= 2) {
            return Promise.resolve(applyUpdate());
          }
          return builder;
        },
        lte(column: string, value: unknown) {
          state.filters.push([column, value, "lte"]);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: matching(), error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
      };

      function matching() {
        if (table !== "notification_queue") return [];
        return rows.filter((row) =>
          state.filters.every(([column, value, op]) => {
            if (op === "lte") return String(row[column as keyof QueueRow] ?? "") <= String(value);
            return row[column as keyof QueueRow] === value;
          }),
        );
      }

      function applyUpdate() {
        if (state.patch?.status === "completed" && completedFailures > 0) {
          completedFailures -= 1;
          return { error: { message: "completed_write_failed" } };
        }
        const id = state.filters.find(([column]) => column === "id")?.[1];
        const row = rows.find((item) => item.id === id);
        if (row && state.patch) Object.assign(row, state.patch);
        return { error: null };
      }

      return builder;
    },
  };
}

const settings: CompanyWhatsAppSettings = {
  companyId: "company-isolated",
  enabled: true,
  provider: "meta_cloud",
  accessToken: "fake-token",
  phoneNumberId: "fake-phone",
  businessAccountId: "fake-business",
  webhookVerifyToken: "fake-verify",
  apiVersion: "v21.0",
  appSecret: "",
  webhookCallbackUrl: "",
  defaultLanguage: "en",
  maxRetryCount: 3,
  hasAccessToken: true,
  hasWebhookVerifyToken: true,
  hasAppSecret: false,
  tokenStatus: "valid",
};

class FakeTransport implements WhatsAppTransport {
  readonly provider = "meta_cloud" as const;
  sendCalls = 0;
  constructor(private readonly mode: "accept" | "unknown" | "reject") {}
  async send() {
    this.sendCalls += 1;
    if (this.mode === "reject") throw new WhatsAppProviderRejectedError("graph rejected before accept");
    if (this.mode === "unknown") throw new Error("network timeout");
    return { messageId: "wamid.fake-accepted", provider: this.provider };
  }
  async healthCheck() {
    return { ok: true, provider: this.provider, latencyMs: 0 };
  }
}

function providerFor(mode: "accept" | "unknown" | "reject", row: QueueRow, failCompletedWrites = 0) {
  const transport = new FakeTransport(mode);
  const client = fakeClient([row], failCompletedWrites);
  const service = new WhatsAppProvider(
    client as never,
    transport,
    new WhatsAppRenderer((key) => key),
    new WhatsAppQueueConsumer(client as never),
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
  return { service, transport, row };
}

describe("WhatsApp processQueueItem ambiguity", () => {
  it("does not send again when the provider accepts and the completed write fails", async () => {
    const row = queueRow("queue-accepted");
    const { service, transport } = providerFor("accept", row, 1);
    const first = await service.processPending("company-isolated");
    const second = await service.processPending("company-isolated");
    assert.equal(transport.sendCalls, 1);
    assert.equal(first.results[0]?.messageId, "wamid.fake-accepted");
    assert.equal(first.results[0]?.status, "completed");
    assert.equal(row.status, "completed");
    assert.equal(second.processed, 0);
    assert.equal(transport.sendCalls, 1);
  });

  it("does not send again when the provider result is unknown", async () => {
    const row = queueRow("queue-unknown");
    const { service, transport } = providerFor("unknown", row);
    const first = await service.processPending("company-isolated");
    const second = await service.processPending("company-isolated");
    assert.equal(transport.sendCalls, 1);
    assert.equal(row.status, "processing");
    assert.match(String(row.last_error), /network timeout/);
    assert.equal(first.results[0]?.messageId, null);
    assert.equal(second.processed, 0);
    assert.equal(transport.sendCalls, 1);
  });

  it("retries only a confirmed Graph rejection", async () => {
    const row = queueRow("queue-rejected");
    const { service, transport } = providerFor("reject", row);
    const first = await service.processPending("company-isolated");
    assert.equal(first.processed, 1);
    assert.equal(transport.sendCalls, 1);
    assert.equal(row.status, "pending");
    const blocked = await service.processPending("company-isolated");
    assert.equal(blocked.processed, 0);
    assert.equal(transport.sendCalls, 1);
    row.scheduled_at = "2020-01-01T00:00:00.000Z";
    const retried = await service.processPending("company-isolated");
    assert.equal(retried.processed, 1);
    assert.equal(transport.sendCalls, 2);
  });
});
