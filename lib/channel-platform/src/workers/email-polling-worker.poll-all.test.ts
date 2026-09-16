import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailPollingWorker } from "./email-polling-worker.ts";

describe("email-polling-worker pollAllEnabledChannels isolation", () => {
  it("skips commercial-denied companies and continues after a channel failure", async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    const polled: string[] = [];

    const worker = createEmailPollingWorker({
      client: {} as never,
      services: {} as never,
      ports: {
        registry: {
          listEnabledEmailChannels: async () => [
            { id: "ch-denied", companyId: "co-denied", channelKey: "email" },
            { id: "ch-fail", companyId: "co-fail", channelKey: "email" },
            { id: "ch-ok", companyId: "co-ok", channelKey: "email" },
          ],
        },
      } as never,
      resolveSystemContext: () => ({}) as never,
      threadLookup: {} as never,
      imapClient: {} as never,
      onDiagnostic: (detail) => diagnostics.push(detail),
      assertCommercialAccess: async (companyId) => {
        if (companyId === "co-denied") throw new Error("email_channel_not_entitled");
      },
    });

    // Override pollCompanyChannel via prototype-safe wrap by replacing method on instance.
    const original = worker.pollCompanyChannel.bind(worker);
    worker.pollCompanyChannel = async (input) => {
      polled.push(input.companyChannelId);
      if (input.companyChannelId === "ch-fail") {
        throw new Error("provider_timeout");
      }
      return { processed: 2, lastUid: 9 };
    };

    const results = await worker.pollAllEnabledChannels({ executeAi: false });
    void original;

    assert.deepEqual(
      results.map((r) => ({ id: r.companyChannelId, processed: r.processed })),
      [
        { id: "ch-denied", processed: 0 },
        { id: "ch-fail", processed: 0 },
        { id: "ch-ok", processed: 2 },
      ],
    );
    assert.deepEqual(polled, ["ch-fail", "ch-ok"]);
    assert.ok(diagnostics.some((d) => d.stage === "email.poll.skipped_commercial"));
    assert.ok(diagnostics.some((d) => d.stage === "email.poll.channel_failed"));
  });

  it("forwards executeAi flag to pollCompanyChannel", async () => {
    const flags: Array<boolean | undefined> = [];
    const worker = createEmailPollingWorker({
      client: {} as never,
      services: {} as never,
      ports: {
        registry: {
          listEnabledEmailChannels: async () => [
            { id: "ch-1", companyId: "co-1", channelKey: "email" },
          ],
        },
      } as never,
      resolveSystemContext: () => ({}) as never,
      threadLookup: {} as never,
      imapClient: {} as never,
    });

    worker.pollCompanyChannel = async (input) => {
      flags.push(input.executeAi);
      return { processed: 0, lastUid: 0 };
    };

    await worker.pollAllEnabledChannels({ executeAi: false });
    await worker.pollAllEnabledChannels({ executeAi: true });
    assert.deepEqual(flags, [false, true]);
  });
});
