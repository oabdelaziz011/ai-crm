import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digitsOnlyPhone,
  loadWhatsAppLastInboundAtForRecipient,
  resolveTrustedWhatsAppSessionWindowOpen,
  whatsappSessionPhonesMatch,
} from "./whatsapp-session-window.ts";

describe("whatsapp session window (server-authoritative)", () => {
  it("matches phone digit forms and treats missing timestamps as closed", () => {
    assert.equal(digitsOnlyPhone("+44 207 946 0958"), "442079460958");
    assert.equal(whatsappSessionPhonesMatch("+442079460958", "442079460958"), true);
    assert.equal(whatsappSessionPhonesMatch("+442079460958", "+966500000001"), false);
    assert.equal(resolveTrustedWhatsAppSessionWindowOpen(null), false);
    assert.equal(resolveTrustedWhatsAppSessionWindowOpen(undefined), false);
    assert.equal(resolveTrustedWhatsAppSessionWindowOpen("not-a-date"), false);
  });

  it("treats a fresh last_inbound_at as open and a stale one as closed", () => {
    const now = Date.parse("2026-11-28T12:00:00.000Z");
    assert.equal(
      resolveTrustedWhatsAppSessionWindowOpen("2026-11-28T11:00:00.000Z", now),
      true,
    );
    assert.equal(
      resolveTrustedWhatsAppSessionWindowOpen("2026-11-27T11:00:00.000Z", now),
      false,
    );
  });

  it("loads last_inbound_at only for matching company WhatsApp sessions", async () => {
    const sessions = [
      {
        external_thread_id: "+442079460958",
        last_inbound_at: "2026-11-28T11:00:00.000Z",
        company_id: "co-a",
      },
      {
        external_thread_id: "+442079460958",
        last_inbound_at: "2026-11-28T10:00:00.000Z",
        company_id: "co-b",
      },
    ];
    const client = {
      from(table: string) {
        assert.equal(table, "channel_sessions");
        const filters: Array<[string, unknown]> = [];
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            const companyId = String(filters.find(([c]) => c === "company_id")?.[1] ?? "");
            const channelKey = String(filters.find(([c]) => c === "channel_key")?.[1] ?? "");
            assert.equal(channelKey, "whatsapp");
            return Promise.resolve({
              data: sessions.filter((s) => s.company_id === companyId),
              error: null,
            });
          },
        };
        return builder;
      },
    };

    const hit = await loadWhatsAppLastInboundAtForRecipient(client as never, {
      companyId: "co-a",
      recipientPhone: "442079460958",
    });
    assert.equal(hit, "2026-11-28T11:00:00.000Z");

    const miss = await loadWhatsAppLastInboundAtForRecipient(client as never, {
      companyId: "co-a",
      recipientPhone: "+966500000001",
    });
    assert.equal(miss, null);
  });

  it("returns null (fail closed) when matching session has no last_inbound_at", async () => {
    const client = {
      from() {
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
            return Promise.resolve({
              data: [{ external_thread_id: "+442079460958", last_inbound_at: null }],
              error: null,
            });
          },
        };
        return builder;
      },
    };
    const value = await loadWhatsAppLastInboundAtForRecipient(client as never, {
      companyId: "co-a",
      recipientPhone: "+442079460958",
    });
    assert.equal(value, null);
    assert.equal(resolveTrustedWhatsAppSessionWindowOpen(value), false);
  });

  it("provider ignores client sessionWindowOpen and send-text does not trust the body flag", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const provider = readFileSync(join(dir, "whatsapp-provider.ts"), "utf8");
    const route = readFileSync(
      join(dir, "../../../../../../../api-server/src/routes/whatsapp.ts"),
      "utf8",
    );
    assert.match(provider, /loadWhatsAppLastInboundAtForRecipient/);
    assert.match(provider, /resolveTrustedWhatsAppSessionWindowOpen/);
    assert.match(provider, /_options\?/);
    assert.doesNotMatch(provider, /sessionWindowOpen:\s*options\?\.sessionWindowOpen\s*===\s*true/);
    const sendTextIdx = route.indexOf('"/whatsapp/send-text"');
    assert.ok(sendTextIdx >= 0);
    const slice = route.slice(sendTextIdx, sendTextIdx + 1200);
    assert.doesNotMatch(slice, /sessionWindowOpen\s*=\s*req\.body/);
    assert.match(slice, /intentionally ignored|channel_sessions\.last_inbound_at/);
  });
});
