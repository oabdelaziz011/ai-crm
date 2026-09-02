/**
 * D5.4 Gap 4 — direct Meta outbound bypass production hard-block.
 * No Meta calls — pure allow/deny + payload validation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWhatsAppDirectOutboundBypassPayload,
  isWhatsAppDirectOutboundBypassAllowed,
  WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
} from "./whatsapp-direct-outbound-bypass.js";

describe("D5.4 Gap 4 WhatsApp direct outbound bypass", () => {
  it("production cannot enable bypass even when flag is true", () => {
    assert.equal(
      isWhatsAppDirectOutboundBypassAllowed({
        WHATSAPP_DIRECT_OUTBOUND_BYPASS: "true",
        NODE_ENV: "production",
      }),
      false,
    );
    assert.equal(
      isWhatsAppDirectOutboundBypassAllowed({
        WHATSAPP_DIRECT_OUTBOUND_BYPASS: "true",
        NODE_ENV: "development",
        VALUEOR_ENV: "production",
      }),
      false,
    );
  });

  it("flag unset disables bypass in any env", () => {
    assert.equal(
      isWhatsAppDirectOutboundBypassAllowed({
        NODE_ENV: "development",
      }),
      false,
    );
  });

  it("non-production + flag allows gate (still requires E.164 payload)", () => {
    assert.equal(
      isWhatsAppDirectOutboundBypassAllowed({
        WHATSAPP_DIRECT_OUTBOUND_BYPASS: "true",
        NODE_ENV: "development",
      }),
      true,
    );
  });

  it("bypass payload requires canonical E.164 to", () => {
    assert.doesNotThrow(() =>
      assertWhatsAppDirectOutboundBypassPayload(WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD),
    );
    assert.match(WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD.to, /^\+/);
    assert.throws(
      () =>
        assertWhatsAppDirectOutboundBypassPayload({
          ...WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
          to: "01023169075",
        }),
      /E\.164/i,
    );
  });
});
