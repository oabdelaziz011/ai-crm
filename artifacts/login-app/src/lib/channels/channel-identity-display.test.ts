import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyChannelRecord } from "@workspace/channel-registry";
import {
  channelDuplicateKey,
  isChannelWorking,
  maskSecret,
  partitionPrimaryChannels,
  resolveBoundAiEmployeeForChannel,
} from "./channel-identity-display.ts";

function channel(
  overrides: Partial<CompanyChannelRecord> & {
    key?: string;
    phoneNumberId?: string;
    fromEmail?: string;
  },
): CompanyChannelRecord {
  const key = overrides.key ?? "whatsapp";
  const phoneNumberId = overrides.phoneNumberId;
  const fromEmail = overrides.fromEmail;
  return {
    id: overrides.id ?? "channel-1",
    company_id: "company-1",
    channel_id: "type-1",
    display_name: overrides.display_name ?? "WhatsApp Main",
    status: overrides.status ?? "active",
    provider: overrides.provider ?? "meta",
    configuration: {
      ...(phoneNumberId ? { phoneNumberId } : {}),
      ...(fromEmail ? { fromEmail } : {}),
      ...(overrides.configuration ?? {}),
    },
    webhook_url: overrides.webhook_url ?? null,
    webhook_secret: null,
    external_account_id: overrides.external_account_id ?? null,
    is_default: overrides.is_default ?? false,
    is_enabled: overrides.is_enabled ?? true,
    health_status: overrides.health_status ?? "connected",
    last_health_check: null,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-02T00:00:00.000Z",
    deleted_at: null,
    deleted_by: null,
    communication_channel: {
      id: "type-1",
      key: key as never,
      display_name: key,
      description: "",
      icon: null,
      supports_media: true,
      supports_templates: true,
      supports_reactions: false,
      supports_typing: false,
      supports_read_receipts: false,
      supports_delivery_receipts: false,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("channel identity display", () => {
  it("masks secrets without dropping them", () => {
    assert.equal(maskSecret("abcdefghijklmnop"), "abcd…mnop");
  });

  it("does not treat same display name alone as a duplicate", () => {
    const left = channel({
      id: "email-1",
      key: "email",
      display_name: "ValueOR Support",
      fromEmail: "a@example.com",
    });
    const right = channel({
      id: "email-2",
      key: "email",
      display_name: "ValueOR Support",
      fromEmail: "b@example.com",
    });
    assert.notEqual(channelDuplicateKey(left), channelDuplicateKey(right));
    const partitioned = partitionPrimaryChannels([left, right]);
    assert.equal(partitioned.visible.length, 2);
    assert.equal(partitioned.duplicates.length, 0);
  });

  it("treats same WhatsApp phone number as duplicates and keeps the working channel", () => {
    const live = channel({
      id: "live",
      phoneNumberId: "123",
      is_enabled: true,
      health_status: "connected",
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const stale = channel({
      id: "stale",
      phoneNumberId: "123",
      is_enabled: false,
      health_status: "disconnected",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(channelDuplicateKey(live), channelDuplicateKey(stale));
    const partitioned = partitionPrimaryChannels([stale, live]);
    assert.deepEqual(
      partitioned.visible.map((item) => item.id),
      ["live"],
    );
    assert.deepEqual(
      partitioned.duplicates.map((item) => item.id),
      ["stale"],
    );
    assert.equal(isChannelWorking(live), true);
    assert.equal(isChannelWorking(stale), false);
  });

  it("keeps different platforms separate even with the same display name", () => {
    const whatsapp = channel({ id: "wa", key: "whatsapp", display_name: "Main", phoneNumberId: "1" });
    const web = channel({ id: "web", key: "web_chat", display_name: "Main" });
    const partitioned = partitionPrimaryChannels([whatsapp, web]);
    assert.equal(partitioned.visible.length, 2);
    assert.equal(partitioned.duplicates.length, 0);
  });

  it("collapses duplicate web_chat rows that share provider and surface", () => {
    const live = channel({
      id: "web-live",
      key: "web_chat",
      provider: "valueor.web_widget",
      is_enabled: true,
      health_status: "connected",
      configuration: { surface: "public_web_widget" },
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const stale = channel({
      id: "web-stale",
      key: "web_chat",
      provider: "valueor.web_widget",
      is_enabled: false,
      health_status: "unknown",
      configuration: { surface: "public_web_widget" },
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const partitioned = partitionPrimaryChannels([stale, live]);
    assert.deepEqual(
      partitioned.visible.map((item) => item.id),
      ["web-live"],
    );
    assert.deepEqual(
      partitioned.duplicates.map((item) => item.id),
      ["web-stale"],
    );
  });

  it("treats WhatsApp with settings credentials as working even when health is unknown", () => {
    const wa = channel({
      id: "wa-live",
      key: "whatsapp",
      health_status: "unknown",
      configuration: { credentialsSource: "company_whatsapp_settings", phoneNumberId: "999" },
    });
    assert.equal(isChannelWorking(wa), true);
    assert.equal(isChannelWorking(wa, { whatsappSettingsReady: true }), true);
    assert.equal(
      isChannelWorking(
        channel({ id: "wa-off", key: "whatsapp", is_enabled: false, health_status: "unknown" }),
        { whatsappSettingsReady: true },
      ),
      false,
    );
  });

  it("resolves the highest-scoring AI employee for a channel", () => {
    const bound = resolveBoundAiEmployeeForChannel(
      [
        {
          id: "generic",
          displayName: "Generic",
          name: "generic",
          tags: ["channel:whatsapp"],
        },
        {
          id: "exact",
          displayName: "Clinic Bot",
          name: "clinic",
          tags: ["channel:channel-uuid"],
        },
      ],
      "whatsapp",
      "channel-uuid",
    );
    assert.deepEqual(bound, { id: "exact", displayName: "Clinic Bot" });
  });
});
