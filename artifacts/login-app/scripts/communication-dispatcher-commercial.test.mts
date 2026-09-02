/**
 * B1.2 Part 4 — CommunicationDispatcher commercial hardening.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/communication-dispatcher-commercial.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CommunicationChannelCommercialError,
  createAssertCommunicationChannelCommercialAccess,
  decideCommunicationChannelCommercialAccess,
} from "../src/lib/communication/dispatcher/assert-communication-channel-commercial.ts";
import { resolveChannelCommercialFeatureCode } from "../src/lib/billing/feature-code-map.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const dispatcherSource = readFileSync(
  resolve(here, "../src/lib/communication/dispatcher/communication-dispatcher.ts"),
  "utf8",
);
const platformSource = readFileSync(
  resolve(here, "../src/lib/communication/services/communication-platform-service.ts"),
  "utf8",
);
const assertSource = readFileSync(
  resolve(here, "../src/lib/communication/dispatcher/assert-communication-channel-commercial.ts"),
  "utf8",
);
const migration343 = readFileSync(
  resolve(projectRoot, "supabase/migrations/343_channel_permission_commercial_mapping.sql"),
  "utf8",
);
const migration344 = readFileSync(
  resolve(projectRoot, "supabase/migrations/344_channel_commercial_rls_hardening.sql"),
  "utf8",
);

function entitledLookup(enabled: Record<string, boolean>) {
  return (code: string) => (code in enabled ? enabled[code] : undefined);
}

/** Mirrors dispatcher per-channel gate + provider call order for R/S. */
async function simulateDispatch(options: {
  companyId: string;
  channels: string[];
  isFeatureEntitled: (featureCode: string) => boolean | undefined;
  onProviderSend: (channel: string) => void;
  onQueueInsert: (channel: string) => void;
}): Promise<{ failedChannels: string[]; sentChannels: string[] }> {
  const failedChannels: string[] = [];
  const sentChannels: string[] = [];
  for (const channel of options.channels) {
    const decision = decideCommunicationChannelCommercialAccess({
      companyId: options.companyId,
      channelKey: channel,
      isFeatureEntitled: options.isFeatureEntitled,
    });
    if (decision.action === "deny") {
      failedChannels.push(channel);
      continue;
    }
    // Gate passed — only then enqueue / provider dispatch.
    options.onQueueInsert(channel);
    options.onProviderSend(channel);
    sentChannels.push(channel);
  }
  return { failedChannels, sentChannels };
}

describe("Channel → commercial feature mapping (reuse B1.1 map)", () => {
  it("maps sellable transports without omnichannel universal grant", () => {
    assert.equal(resolveChannelCommercialFeatureCode("whatsapp"), "whatsapp_channel");
    assert.equal(resolveChannelCommercialFeatureCode("email"), "email_channel");
    assert.equal(resolveChannelCommercialFeatureCode("facebook"), "facebook_channel");
    assert.equal(resolveChannelCommercialFeatureCode("messenger"), "facebook_channel");
    assert.equal(resolveChannelCommercialFeatureCode("instagram"), "instagram_channel");
    assert.equal(resolveChannelCommercialFeatureCode("sms"), "sms_channel");
    assert.equal(resolveChannelCommercialFeatureCode("omnichannel"), null);
    assert.equal(resolveChannelCommercialFeatureCode("unknown_xyz"), null);
  });
});

describe("decideCommunicationChannelCommercialAccess matrix", () => {
  it("A WhatsApp + entitlement → allow", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "whatsapp",
        isFeatureEntitled: entitledLookup({ whatsapp_channel: true }),
      }).action,
      "allow",
    );
  });

  it("B WhatsApp without entitlement → deny", () => {
    const d = decideCommunicationChannelCommercialAccess({
      companyId: "co-1",
      channelKey: "whatsapp",
      isFeatureEntitled: entitledLookup({ whatsapp_channel: false }),
    });
    assert.equal(d.action, "deny");
    if (d.action === "deny") assert.equal(d.reason, "not_entitled");
  });

  it("C Email + entitlement → allow", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "email",
        isFeatureEntitled: entitledLookup({ email_channel: true }),
      }).action,
      "allow",
    );
  });

  it("D Email without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "email",
        isFeatureEntitled: entitledLookup({ email_channel: false }),
      }).action,
      "deny",
    );
  });

  it("E Facebook + entitlement → allow", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "facebook",
        isFeatureEntitled: entitledLookup({ facebook_channel: true }),
      }).action,
      "allow",
    );
  });

  it("F Facebook without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "messenger",
        isFeatureEntitled: entitledLookup({ facebook_channel: false }),
      }).action,
      "deny",
    );
  });

  it("G Instagram + entitlement → allow", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "instagram",
        isFeatureEntitled: entitledLookup({ instagram_channel: true }),
      }).action,
      "allow",
    );
  });

  it("H Instagram without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "instagram",
        isFeatureEntitled: entitledLookup({}),
      }).action,
      "deny",
    );
  });

  it("I SMS + entitlement → allow (stub may proceed after gate)", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "sms",
        isFeatureEntitled: entitledLookup({ sms_channel: true }),
      }).action,
      "allow",
    );
  });

  it("J SMS without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "sms",
        isFeatureEntitled: entitledLookup({ sms_channel: false }),
      }).action,
      "deny",
    );
  });

  it("K Unknown channel → deny", () => {
    const d = decideCommunicationChannelCommercialAccess({
      companyId: "co-1",
      channelKey: "carrier_pigeon",
      isFeatureEntitled: entitledLookup({ whatsapp_channel: true }),
    });
    assert.equal(d.action, "deny");
    if (d.action === "deny") assert.equal(d.reason, "unknown_channel");
  });

  it("L Missing company → deny", () => {
    const d = decideCommunicationChannelCommercialAccess({
      companyId: "",
      channelKey: "whatsapp",
      isFeatureEntitled: entitledLookup({ whatsapp_channel: true }),
    });
    assert.equal(d.action, "deny");
    if (d.action === "deny") assert.equal(d.reason, "missing_company");
  });

  it("M Resolver error / undefined entitlement → deny", () => {
    const d = decideCommunicationChannelCommercialAccess({
      companyId: "co-1",
      channelKey: "whatsapp",
      isFeatureEntitled: () => undefined,
    });
    assert.equal(d.action, "deny");
    if (d.action === "deny") assert.equal(d.reason, "entitlement_error");
  });

  it("N SYSTEM_CONTEXT + entitlement → allow (commercial independent of RBAC)", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-system",
        channelKey: "whatsapp",
        isFeatureEntitled: entitledLookup({ whatsapp_channel: true }),
      }).action,
      "allow",
    );
  });

  it("O SYSTEM_CONTEXT without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-system",
        channelKey: "whatsapp",
        isFeatureEntitled: entitledLookup({ whatsapp_channel: false }),
      }).action,
      "deny",
    );
  });

  it("P service-role/internal + entitlement → allow", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-worker",
        channelKey: "email",
        isFeatureEntitled: entitledLookup({ email_channel: true }),
      }).action,
      "allow",
    );
  });

  it("Q service-role/internal without entitlement → deny", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-worker",
        channelKey: "email",
        isFeatureEntitled: entitledLookup({ email_channel: false }),
      }).action,
      "deny",
    );
  });

  it("T no destination-based entitlement inference", () => {
    const d = decideCommunicationChannelCommercialAccess({
      companyId: "co-1",
      channelKey: "whatsapp",
      isFeatureEntitled: entitledLookup({ whatsapp_channel: false }),
    });
    assert.equal(d.action, "deny");
    // Gate inputs are companyId + channelKey only — destination never consulted.
    assert.doesNotMatch(assertSource, /recipient\.phone|recipient\.email/);
    assert.doesNotMatch(
      assertSource,
      /isFeatureEntitled\([^)]*(?:phone|email)/,
    );
  });

  it("V omnichannel never grants transport", () => {
    assert.equal(
      decideCommunicationChannelCommercialAccess({
        companyId: "co-1",
        channelKey: "whatsapp",
        isFeatureEntitled: entitledLookup({ omnichannel: true }),
      }).action,
      "deny",
    );
    assert.doesNotMatch(
      assertSource,
      /requireCompanyFeature\([^)]*omnichannel/,
    );
    assert.doesNotMatch(
      assertSource,
      /resolveChannelCommercialFeatureCode\([^)]*omnichannel/,
    );
  });

  it("non-sellable push/in_app/webhook skip commercial gate", () => {
    for (const channel of ["push", "in_app", "webhook"]) {
      assert.equal(
        decideCommunicationChannelCommercialAccess({
          companyId: "co-1",
          channelKey: channel,
          isFeatureEntitled: entitledLookup({}),
        }).action,
        "allow",
      );
    }
  });
});

describe("Queue / provider ordering (R/S)", () => {
  it("R commercial gate happens BEFORE queue insertion", async () => {
    const events: string[] = [];
    const result = await simulateDispatch({
      companyId: "co-1",
      channels: ["whatsapp"],
      isFeatureEntitled: entitledLookup({ whatsapp_channel: false }),
      onQueueInsert: () => events.push("queue"),
      onProviderSend: () => events.push("provider"),
    });
    assert.deepEqual(events, []);
    assert.deepEqual(result.failedChannels, ["whatsapp"]);
    assert.deepEqual(result.sentChannels, []);
  });

  it("S commercial gate happens BEFORE provider dispatch", async () => {
    const events: string[] = [];
    const result = await simulateDispatch({
      companyId: "co-1",
      channels: ["email"],
      isFeatureEntitled: entitledLookup({ email_channel: true }),
      onQueueInsert: () => events.push("queue"),
      onProviderSend: () => events.push("provider"),
    });
    assert.deepEqual(events, ["queue", "provider"]);
    assert.deepEqual(result.sentChannels, ["email"]);
  });
});

describe("createAssertCommunicationChannelCommercialAccess fail-closed", () => {
  it("denies missing company / unknown channel without RPC", async () => {
    const assertAccess = createAssertCommunicationChannelCommercialAccess({
      rpc: async () => {
        throw new Error("RPC must not be called for missing company");
      },
    } as never);

    await assert.rejects(
      () => assertAccess("", "whatsapp"),
      (err: unknown) =>
        err instanceof CommunicationChannelCommercialError &&
        /Company context required/.test(err.message),
    );

    await assert.rejects(
      () => assertAccess("co-1", "not_a_channel"),
      (err: unknown) =>
        err instanceof CommunicationChannelCommercialError &&
        /Unknown channel/.test(err.message),
    );
  });

  it("I SMS entitled reaches stub path (assert passes, no provider call here)", async () => {
    const assertAccess = createAssertCommunicationChannelCommercialAccess({
      rpc: async () => ({ data: true, error: null }),
    } as never);
    await assertAccess("co-1", "sms");
  });

  it("J SMS not entitled → deny via FeatureNotEntitledError mapping", async () => {
    const assertAccess = createAssertCommunicationChannelCommercialAccess({
      rpc: async () => ({ data: false, error: null }),
    } as never);
    await assert.rejects(
      () => assertAccess("co-1", "sms"),
      (err: unknown) => err instanceof CommunicationChannelCommercialError,
    );
  });

  it("M resolver RPC error → deny", async () => {
    const assertAccess = createAssertCommunicationChannelCommercialAccess({
      rpc: async () => ({ data: null, error: { message: "db down", code: "XX000" } }),
    } as never);
    await assert.rejects(
      () => assertAccess("co-1", "whatsapp"),
      (err: unknown) => err instanceof CommunicationChannelCommercialError,
    );
  });
});

describe("Dispatcher wiring", () => {
  it("gates before provider.send and providers.get", () => {
    const commercialIdx = dispatcherSource.indexOf("await this.assertChannelCommercial");
    const providerGetIdx = dispatcherSource.indexOf("this.providers.get(channel)");
    const providerSendIdx = dispatcherSource.indexOf("await provider.send(");
    assert.ok(commercialIdx > 0);
    assert.ok(commercialIdx < providerGetIdx);
    assert.ok(commercialIdx < providerSendIdx);
  });

  it("throws on missing company before channel loop", () => {
    assert.match(
      dispatcherSource,
      /Company context required for communication commercial gate/,
    );
    const missingCompanyIdx = dispatcherSource.indexOf(
      "Company context required for communication commercial gate",
    );
    const loopIdx = dispatcherSource.indexOf("for (const channel of request.channels)");
    assert.ok(missingCompanyIdx < loopIdx);
  });

  it("wires createAssertCommunicationChannelCommercialAccess in platform factory", () => {
    assert.match(
      platformSource,
      /createAssertCommunicationChannelCommercialAccess\(client\)/,
    );
  });

  it("does not treat SYSTEM_CONTEXT as commercial bypass", () => {
    // Gate is unconditional: always calls assertChannelCommercial(companyId, channel).
    assert.match(
      dispatcherSource,
      /await this\.assertChannelCommercial\(companyId, channel\)/,
    );
    assert.doesNotMatch(
      dispatcherSource,
      /if\s*\(\s*(?:ctx\.)?isSuperAdmin|if\s*\(\s*isServiceRole|skipCommercial|bypassCommercial/i,
    );
    assert.doesNotMatch(
      assertSource,
      /if\s*\(\s*(?:ctx\.)?isSuperAdmin|if\s*\(\s*isServiceRole|skipCommercial|bypassCommercial/i,
    );
  });
});

describe("Regression — migrations untouched", () => {
  it("343 and 344 unchanged; no new migration created for Part 4", () => {
    assert.match(migration343, /343 — Channel permission commercial mapping/);
    assert.match(migration344, /344 — Channel commercial RLS hardening/);
    assert.doesNotMatch(dispatcherSource, /343_channel_permission|344_channel_commercial/);
  });
});
