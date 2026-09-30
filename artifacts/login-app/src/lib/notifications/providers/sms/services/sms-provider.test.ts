import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildSmsOutboundBody,
  resolveSmsOutboundPhone,
} from "./sms-provider.ts";

describe("SMS outbound body / phone helpers", () => {
  it("prefers campaign detail for the SMS body", () => {
    assert.equal(
      buildSmsOutboundBody({
        campaignTitle: "Promo",
        detail: "Full offer text for the customer",
      }),
      "Full offer text for the customer",
    );
  });

  it("falls back to title + message when detail is empty", () => {
    assert.equal(
      buildSmsOutboundBody({
        campaignTitle: "Hello",
        message: "World",
      }),
      "Hello\nWorld",
    );
  });

  it("resolves E.164 phone before legacy phone fields", () => {
    assert.equal(
      resolveSmsOutboundPhone({
        phoneE164: "+201011404109",
        phone: "01011404109",
        customerPhone: "ignored",
      }),
      "+201011404109",
    );
  });
});

describe("SMS provider wiring source", () => {
  it("registers twilio_sms in default communication providers", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../communication/providers");
    const source = readFileSync(join(root, "channel-providers.ts"), "utf8");
    assert.match(source, /NotificationChannelCommunicationProvider\("sms", "twilio_sms"\)/);
    assert.match(source, /channel === "sms"/);
  });

  it("selects Infobip transport when company SMS provider is infobip", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sms-provider.ts"),
      "utf8",
    );
    assert.match(source, /resolveVendorTransport/);
    assert.match(source, /InfobipSmsTransport/);
    assert.match(source, /provider === "infobip"/);
    assert.match(source, /requireCompanyFeature\(this\.client, item\.companyId, "sms_channel"\)/);
  });
});
