import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { isWebChatOriginAllowed, normalizeWebChatOrigin } from "./public-web-chat-origin.js";
import {
  generateVisitorToken,
  hashVisitorFingerprint,
  hashVisitorToken,
  isWellFormedVisitorToken,
  isWellFormedWidgetKey,
} from "./public-web-chat-token.js";
import { isPublicWebChatApiEnabled, publicWebChatVisitorCopy, resolvePublicWebChatVisitorLocale } from "./public-web-chat-config.js";

describe("Public Web Chat origin validation", () => {
  it("accepts HTTPS and local HTTP origins in canonical form", () => {
    assert.equal(normalizeWebChatOrigin("https://Shop.Example.com"), "https://shop.example.com");
    assert.equal(normalizeWebChatOrigin("https://shop.example.com:8443"), "https://shop.example.com:8443");
    assert.equal(normalizeWebChatOrigin("http://localhost:5173"), "http://localhost:5173");
    assert.equal(normalizeWebChatOrigin("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  });

  it("rejects wildcards, http, null, credentials, paths, queries and odd schemes", () => {
    for (const origin of [
      "*",
      "https://*.example.com",
      "http://shop.example.com",
      "null",
      "",
      "https://user:pw@shop.example.com",
      "https://shop.example.com/path",
      "https://shop.example.com?x=1",
      "https://shop.example.com#x",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://intranet",
      `https://${"a".repeat(260)}.com`,
    ]) {
      assert.equal(normalizeWebChatOrigin(origin), null, origin);
    }
  });

  it("exact match only; empty allow-list rejects", () => {
    const allowed = ["https://shop.example.com"];
    assert.equal(isWebChatOriginAllowed("https://shop.example.com", allowed), true);
    assert.equal(isWebChatOriginAllowed("https://www.shop.example.com", allowed), false);
    assert.equal(isWebChatOriginAllowed("https://shop.example.com.evil.io", allowed), false);
    assert.equal(isWebChatOriginAllowed("https://shop.example.com:444", allowed), false);
    assert.equal(isWebChatOriginAllowed("https://shop.example.com", []), false);
    assert.equal(isWebChatOriginAllowed(null, allowed), false);
  });
});

describe("8. Visitor token", () => {
  it("is opaque, high-entropy, and hashed with SHA-256 (matches internal.web_chat_visitor_token_hash)", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateVisitorToken()));
    assert.equal(tokens.size, 200);
    const token = [...tokens][0]!;
    assert.equal(isWellFormedVisitorToken(token), true);
    assert.equal(hashVisitorToken(token), createHash("sha256").update(token, "utf8").digest("hex"));
    assert.match(hashVisitorToken(token), /^[0-9a-f]{64}$/);
  });

  it("rejects malformed tokens and widget keys", () => {
    for (const value of ["", "wct_short", `wct_${"a".repeat(42)}!`, 123, null, `Bearer wct_${"a".repeat(43)}`]) {
      assert.equal(isWellFormedVisitorToken(value), false, String(value));
    }
    assert.equal(isWellFormedWidgetKey(`wcw_${"0".repeat(48)}`), true);
    assert.equal(isWellFormedWidgetKey(`wcw_${"G".repeat(48)}`), false);
    assert.equal(isWellFormedWidgetKey("d4fdae9a-bb72-4bae-903c-cb4b971d18a8"), false);
  });

  it("IP / UA fingerprints are keyed HMACs, never raw", () => {
    const hashed = hashVisitorFingerprint("203.0.113.7", "secret");
    assert.match(hashed!, /^[0-9a-f]{64}$/);
    assert.notEqual(hashed, hashVisitorFingerprint("203.0.113.7", "other-secret"));
    assert.equal(hashVisitorFingerprint(null, "secret"), null);
  });
});

describe("Kill switch", () => {
  it("defaults off in production, on elsewhere, explicit env wins", () => {
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production" }), false);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "development" }), true);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production", PUBLIC_WEB_CHAT_API_ENABLED: "true" }), true);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "development", PUBLIC_WEB_CHAT_API_ENABLED: "false" }), false);
  });

  it("missing PUBLIC_WEB_CHAT_API_ENABLED cannot enable production", () => {
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production", PUBLIC_WEB_CHAT_API_ENABLED: "" }), false);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production", PUBLIC_WEB_CHAT_API_ENABLED: "1" }), false);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production", PUBLIC_WEB_CHAT_API_ENABLED: "yes" }), false);
    assert.equal(isPublicWebChatApiEnabled({ NODE_ENV: "production", PUBLIC_WEB_CHAT_API_ENABLED: "false" }), false);
  });
});

describe("Visitor copy locale", () => {
  it("keeps English as the default public contract", () => {
    assert.equal(resolvePublicWebChatVisitorLocale(undefined), "en");
    assert.equal(resolvePublicWebChatVisitorLocale("en-US"), "en");
    assert.equal(publicWebChatVisitorCopy().unavailable, "Chat is unavailable right now.");
  });

  it("selects Arabic counterparts without changing response keys", () => {
    assert.equal(resolvePublicWebChatVisitorLocale("ar"), "ar");
    assert.equal(resolvePublicWebChatVisitorLocale("ar-SA,en;q=0.8"), "ar");
    const ar = publicWebChatVisitorCopy("ar");
    const en = publicWebChatVisitorCopy("en");
    assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
    assert.equal(ar.unavailable, "الدردشة غير متاحة حالياً.");
    assert.equal(ar.handoff, "سيتواصل معك أحد أعضاء الفريق قريباً.");
    assert.equal(ar.aiFallback, "أواجه صعوبة في الرد الآن. يمكن لأحد أعضاء الفريق مساعدتك قريباً.");
    assert.equal(ar.received, "شكراً، تم استلام رسالتك. سيرد عليك أحد أعضاء الفريق هنا.");
    assert.equal(ar.invalidRequest, "تعذر معالجة الطلب.");
    assert.equal(ar.messageTooLong, "الرسالة طويلة جداً.");
    assert.equal(ar.payloadTooLarge, "الطلب أكبر من الحد المسموح.");
    assert.equal(ar.rateLimited, "طلبات كثيرة جداً. يرجى الانتظار ثم المحاولة مرة أخرى.");
  });
});
