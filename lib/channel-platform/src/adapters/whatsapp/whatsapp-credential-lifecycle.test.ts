import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyMetaAuthFailure,
  formatPhoneWabaMismatchError,
  isWhatsAppTokenBlocked,
  maskAccessToken,
  parseMetaExpiryFromMessage,
  performWhatsAppConnectionTest,
} from "./whatsapp-credential-lifecycle.js";

describe("whatsapp-credential-lifecycle", () => {
  it("classifies Meta session expiry as expired", () => {
    const result = classifyMetaAuthFailure({
      message:
        "Error validating access token: Session has expired on Wednesday, 05-Aug-26 06:00:00 PDT. The current time is Wednesday, 05-Aug-26 06:07:09 PDT.",
      code: 190,
      subcode: 463,
    });
    assert.equal(result.isAuthFailure, true);
    assert.equal(result.tokenStatus, "expired");
    assert.ok(result.expiresAt);
  });

  it("parses expiry timestamp from Meta message", () => {
    const iso = parseMetaExpiryFromMessage(
      "Session has expired on Wednesday, 05-Aug-26 06:00:00 PDT.",
    );
    assert.ok(iso);
    assert.match(iso!, /^2026-08-05T/);
  });

  it("blocks outbound when token_status is expired without calling Meta", () => {
    const gate = isWhatsAppTokenBlocked({
      tokenStatus: "expired",
      tokenExpiresAt: "2026-08-05T13:00:00.000Z",
      tokenCheckedAt: "2026-08-05T13:07:00.000Z",
      lastSuccessfulSendAt: null,
      lastAuthError: "Authentication Error",
      lastAuthErrorAt: "2026-08-05T13:07:00.000Z",
      lastAuthErrorCode: 190,
    });
    assert.equal(gate.blocked, true);
    assert.equal(gate.tokenStatus, "expired");
    assert.match(gate.reason ?? "", /expired/i);
  });

  it("blocks when expires_at is in the past even if status is still valid", () => {
    const gate = isWhatsAppTokenBlocked(
      {
        tokenStatus: "valid",
        tokenExpiresAt: "2020-01-01T00:00:00.000Z",
        tokenCheckedAt: null,
        lastSuccessfulSendAt: null,
        lastAuthError: null,
        lastAuthErrorAt: null,
        lastAuthErrorCode: null,
      },
      new Date("2026-08-05T12:00:00.000Z"),
    );
    assert.equal(gate.blocked, true);
    assert.equal(gate.tokenStatus, "expired");
  });

  it("allows unknown tokens so cold start can discover validity", () => {
    const gate = isWhatsAppTokenBlocked({
      tokenStatus: "unknown",
      tokenExpiresAt: null,
      tokenCheckedAt: null,
      lastSuccessfulSendAt: null,
      lastAuthError: null,
      lastAuthErrorAt: null,
      lastAuthErrorCode: null,
    });
    assert.equal(gate.blocked, false);
  });

  it("masks access tokens except first/last characters", () => {
    assert.equal(maskAccessToken(""), "(empty)");
    assert.match(maskAccessToken("EAAYds47ZCVXEBSabcdefghijklmnop"), /^EAAYds…mnop \(len=\d+\)$/);
  });

  it("formats phone/WABA mismatch with exact configured vs Meta values", () => {
    const message = formatPhoneWabaMismatchError({
      configuredPhoneNumberId: "1214681355059951",
      configuredWabaId: "1584022663181525",
      actualWabaIdFromMeta: "999000111222333",
      incorrectValue: "waba_id",
    });
    assert.match(message, /Configured Phone Number ID: 1214681355059951/);
    assert.match(message, /Actual WABA returned by Meta: 999000111222333/);
    assert.match(message, /Configured WABA: 1584022663181525/);
    assert.match(message, /Incorrect value: WABA ID/);
  });

  it("requests phone number with Graph v21-safe fields only", async () => {
    let phoneUrl = "";
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(JSON.stringify({ id: "token-owner", name: "Owner" }), { status: 200 });
      }
      if (url.includes("1214681355059951") && !url.includes("phone_numbers")) {
        phoneUrl = url;
        return new Response(
          JSON.stringify({
            id: "1214681355059951",
            display_phone_number: "201012345989",
            verified_name: "ValueOR",
            status: "CONNECTED",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/1584022663181525?") && url.includes("fields=id,name")) {
        return new Response(JSON.stringify({ id: "1584022663181525", name: "Configured WABA" }), {
          status: 200,
        });
      }
      if (url.includes("/1584022663181525/phone_numbers")) {
        return new Response(
          JSON.stringify({ data: [{ id: "1214681355059951", display_phone_number: "201012345989" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
    };

    const report = await performWhatsAppConnectionTest({
      runtimeConfig: {
        phoneNumberId: "1214681355059951",
        accessToken: "EAAYds47ZCVXEBSabcdefghijklmnop",
        verifyToken: "verify",
        apiVersion: "v21.0",
        businessAccountId: "1584022663181525",
      },
      fetchFn: fetchFn as typeof fetch,
    });

    assert.equal(report.ok, true);
    assert.match(phoneUrl, /fields=id%2Cdisplay_phone_number%2Cverified_name%2Cstatus|fields=id,display_phone_number,verified_name,status/);
    assert.doesNotMatch(phoneUrl, /whatsapp_business_account/);
    assert.doesNotMatch(phoneUrl, /metadata=/);
  });

  it("reports mismatch when phone is not listed under configured WABA", async () => {
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(JSON.stringify({ id: "token-owner", name: "Owner" }), { status: 200 });
      }
      if (url.includes("1214681355059951") && !url.includes("phone_numbers")) {
        return new Response(
          JSON.stringify({
            id: "1214681355059951",
            display_phone_number: "201012345989",
            verified_name: "ValueOR",
            status: "CONNECTED",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/1584022663181525?") && url.includes("fields=id,name")) {
        return new Response(JSON.stringify({ id: "1584022663181525", name: "Configured WABA" }), {
          status: 200,
        });
      }
      if (url.includes("/1584022663181525/phone_numbers")) {
        return new Response(
          JSON.stringify({ data: [{ id: "1168042419733416", display_phone_number: "other" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
    };

    const report = await performWhatsAppConnectionTest({
      runtimeConfig: {
        phoneNumberId: "1214681355059951",
        accessToken: "EAAYds47ZCVXEBSabcdefghijklmnop",
        verifyToken: "verify",
        apiVersion: "v21.0",
        businessAccountId: "1584022663181525",
      },
      fetchFn: fetchFn as typeof fetch,
    });

    assert.equal(report.ok, false);
    assert.equal(report.mismatch?.configuredPhoneNumberId, "1214681355059951");
    assert.equal(report.mismatch?.configuredWabaId, "1584022663181525");
    assert.equal(report.mismatch?.actualWabaIdFromMeta, null);
    assert.equal(report.mismatch?.incorrectValue, "unknown");
    assert.match(report.error ?? "", /Configured Phone Number ID: 1214681355059951/);
    assert.match(report.error ?? "", /Configured WABA: 1584022663181525/);
    assert.doesNotMatch(report.error ?? "", /whatsapp_business_account/);
  });
});
