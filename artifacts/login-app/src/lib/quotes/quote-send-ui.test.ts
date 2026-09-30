import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QuoteSendClientError } from "./quote-send-types";
import {
  classifyQuoteSendError,
  createQuoteSendKeyStore,
  quoteSendUnavailableCode,
  quoteSendUnavailableReasonKey,
} from "./quote-send-ui";

function keyStore() {
  let n = 0;
  return createQuoteSendKeyStore(() => `k${++n}`);
}

describe("quote send idempotency keys", () => {
  it("reuses the same key until the send settles (double-click safe)", () => {
    const keys = keyStore();
    const a = keys.acquire("q1", "email");
    const b = keys.acquire("q1", "email");
    assert.equal(a, b);
    assert.match(a, /^quote-send:[A-Za-z0-9:_-]+$/);
    assert.notEqual(keys.acquire("q1", "whatsapp"), a);
  });

  it("keeps the key after an unknown outcome so a retry replays the same attempt", () => {
    const keys = keyStore();
    const a = keys.acquire("q1", "email");
    keys.settle("q1", "email", "unknown");
    assert.equal(keys.acquire("q1", "email"), a);
  });

  it("issues a new key after a definitive failure or success", () => {
    const keys = keyStore();
    const a = keys.acquire("q1", "email");
    keys.settle("q1", "email", "failed");
    const b = keys.acquire("q1", "email");
    assert.notEqual(a, b);
    keys.settle("q1", "email", "sent");
    assert.notEqual(keys.acquire("q1", "email"), b);
  });
});

describe("quote send error classification", () => {
  it("treats network errors, in-progress and server crashes as unknown", () => {
    assert.equal(classifyQuoteSendError(new TypeError("Failed to fetch")), "unknown");
    assert.equal(classifyQuoteSendError(new QuoteSendClientError(409, "send_in_progress", "x")), "unknown");
    assert.equal(classifyQuoteSendError(new QuoteSendClientError(500, "internal_error", "x")), "unknown");
  });

  it("treats provider rejection and validation errors as definitive failures", () => {
    assert.equal(classifyQuoteSendError(new QuoteSendClientError(502, "provider_rejected", "x")), "failed");
    assert.equal(classifyQuoteSendError(new QuoteSendClientError(403, "forbidden", "x")), "failed");
    assert.equal(classifyQuoteSendError(new QuoteSendClientError(409, "send_attempt_failed", "x")), "failed");
  });

  it("maps unavailable-channel errors to reason keys", () => {
    const error = new QuoteSendClientError(409, "channel_unavailable:whatsapp_window_closed", "x");
    assert.equal(quoteSendUnavailableCode(error), "whatsapp_window_closed");
    assert.equal(quoteSendUnavailableReasonKey("whatsapp_window_closed"), "quotes.send.unavailable.whatsapp_window_closed");
    assert.equal(quoteSendUnavailableReasonKey(null), "quotes.send.unavailable.unknown");
    assert.equal(quoteSendUnavailableCode(new QuoteSendClientError(502, "provider_rejected", "x")), null);
  });
});

describe("quote send UI contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const workspace = readFileSync(join(here, "../../components/quotes/quote360-workspace.tsx"), "utf8");

  it("no longer uses mailto / wa.me or client-side status changes to send", () => {
    assert.doesNotMatch(workspace, /mailto:|wa\.me/);
    assert.doesNotMatch(workspace, /status:\s*"sent"/);
    assert.match(workspace, /useSendQuote\(\)/);
    assert.match(workspace, /useQuoteSendOptions\(/);
  });

  it("disables the send button while a send is pending", () => {
    assert.match(workspace, /disabled=\{sendQuote\.isPending \|\| lines\.length === 0\}/);
  });

  it("has i18n keys for every unavailable reason in both languages", () => {
    const reasons = [
      "not_entitled",
      "no_email_channel",
      "no_recipient_email",
      "no_whatsapp_channel",
      "no_recipient_phone",
      "no_whatsapp_conversation",
      "whatsapp_window_closed",
      "unknown",
    ];
    for (const lang of ["en", "ar"]) {
      const json = JSON.parse(readFileSync(join(here, `../../locales/${lang}/common.json`), "utf8"));
      for (const reason of reasons) {
        assert.equal(typeof json.quotes.send.unavailable[reason], "string", `${lang}:${reason}`);
      }
      for (const key of ["sentTitle", "sentEmail", "sentWhatsapp", "failedTitle", "retry", "sending", "noChannels"]) {
        assert.equal(typeof json.quotes.send[key], "string", `${lang}:${key}`);
      }
    }
  });
});
