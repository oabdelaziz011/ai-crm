import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCapturePhoneLookupVariants,
  deriveCapturePhone,
  isContactStatusSlogan,
  isOpenLeadLifecycle,
  isPlaceholderContactName,
  normalizeCapturePhoneDigits,
  toChannelInternationalPhone,
} from "./capture-identity.js";

describe("capture identity helpers", () => {
  it("detects placeholder and channel-generated names", () => {
    assert.equal(isPlaceholderContactName("Unknown Contact"), true);
    assert.equal(isPlaceholderContactName("WhatsApp +201000000001"), true);
    assert.equal(isPlaceholderContactName("Messenger 123"), true);
    assert.equal(isPlaceholderContactName("+201000000001"), true);
    assert.equal(isPlaceholderContactName("هنا للمساعدة"), true);
    assert.equal(isContactStatusSlogan("هنا للمساعدة"), true);
    assert.equal(isPlaceholderContactName("أحمد محمد"), false);
  });

  it("builds Egyptian phone lookup variants without last-10-only identity", () => {
    const variants = buildCapturePhoneLookupVariants("01001234567");
    assert.ok(variants.includes("01001234567"));
    assert.ok(variants.includes("201001234567") || variants.includes("+201001234567"));
    assert.equal(normalizeCapturePhoneDigits("٠١٠٠١٢٣٤٥٦٧"), "01001234567");
  });

  it("derives WhatsApp phone from sender external id as +E.164", () => {
    assert.equal(toChannelInternationalPhone("201001234567"), "+201001234567");
    assert.equal(toChannelInternationalPhone("+966551234567"), "+966551234567");
    assert.equal(toChannelInternationalPhone("01001234567"), "+201001234567");
    assert.equal(toChannelInternationalPhone("030123456"), null);
    assert.equal(
      deriveCapturePhone({
        channelType: "whatsapp",
        phone: null,
        externalUserId: "201001234567",
      }),
      "+201001234567",
    );
    assert.equal(
      deriveCapturePhone({
        channelType: "whatsapp",
        phone: null,
        externalUserId: "966551234567",
      }),
      "+966551234567",
    );
    assert.equal(
      deriveCapturePhone({
        channelType: "messenger",
        phone: null,
        externalUserId: "psid-abc",
      }),
      null,
    );
  });

  it("treats converted/closed lifecycles as not open", () => {
    assert.equal(isOpenLeadLifecycle("prospect"), true);
    assert.equal(isOpenLeadLifecycle("qualified"), true);
    assert.equal(isOpenLeadLifecycle("converted"), false);
    assert.equal(isOpenLeadLifecycle("disqualified"), false);
  });
});
