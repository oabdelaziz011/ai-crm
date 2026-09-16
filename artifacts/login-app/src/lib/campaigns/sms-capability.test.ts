import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SmsCampaignCapabilityChecker } from "./sms-capability.ts";

function createClient(options?: {
  channels?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown> | null;
  entitled?: boolean;
}) {
  const channels = options?.channels ?? [];
  const settings = options?.settings;
  return {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.is = self;
      (chain as { then: typeof Promise.prototype.then }).then = (
        onfulfilled: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) => Promise.resolve({ data: channels, error: null }).then(onfulfilled, onrejected);
      return chain;
    },
    rpc: async (name: string) => {
      if (name === "get_company_sms_settings") {
        return { data: settings ?? null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

describe("SMS capability — disabled / incomplete blocks operation", () => {
  it("blocks when commercial entitlement missing", async () => {
    const checker = new SmsCampaignCapabilityChecker(createClient() as never, {
      isEnabled: async () => false,
    });
    const result = await checker.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "not_entitled");
  });

  it("blocks when company_channels SMS row is explicitly disabled", async () => {
    const checker = new SmsCampaignCapabilityChecker(
      createClient({
        channels: [
          {
            id: "cc-sms-1",
            is_enabled: false,
            deleted_at: null,
            communication_channels: { key: "sms" },
          },
        ],
        settings: {
          enabled: true,
          provider: "twilio",
          account_sid: "ACxxx",
          from_number: "+15551234567",
          has_auth_token: true,
        },
      }) as never,
      { isEnabled: async () => true },
    );
    const result = await checker.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "channel_disabled_or_missing");
  });

  it("blocks when SMS settings are disabled", async () => {
    const checker = new SmsCampaignCapabilityChecker(
      createClient({
        settings: {
          enabled: false,
          provider: "twilio",
          account_sid: "ACxxx",
          from_number: "+15551234567",
          has_auth_token: true,
        },
      }) as never,
      { isEnabled: async () => true },
    );
    const result = await checker.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "settings_disabled");
  });

  it("blocks when provider credentials are incomplete", async () => {
    const checker = new SmsCampaignCapabilityChecker(
      createClient({
        settings: {
          enabled: true,
          provider: "",
          account_sid: "",
          from_number: "",
          has_auth_token: false,
        },
      }) as never,
      { isEnabled: async () => true },
    );
    const result = await checker.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "credentials_incomplete");
  });

  it("allows when entitled, settings enabled, and credentials complete", async () => {
    const checker = new SmsCampaignCapabilityChecker(
      createClient({
        channels: [
          {
            id: "cc-sms-1",
            is_enabled: true,
            deleted_at: null,
            communication_channels: { key: "sms" },
          },
        ],
        settings: {
          enabled: true,
          provider: "twilio",
          account_sid: "ACxxx",
          from_number: "+15551234567",
          has_auth_token: true,
        },
      }) as never,
      { isEnabled: async () => true },
    );
    const result = await checker.check("co-1");
    assert.equal(result.available, true);
    assert.equal(result.reason, "ok");
    assert.equal(result.companyChannelId, "cc-sms-1");
  });
});
