/**
 * Per-field Email Signature colors: normalize, persist, render, sanitize, preview.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeEmailSignatureConfig,
  renderEmailSignatureHtml,
  toPersistedEmailSignature,
} from "@workspace/channel-platform";
import { createDefaultBrandDocument } from "../company-workspace/brand-center/defaults.ts";
import { toPersistedBrandingPayload } from "../company-workspace/brand-center/normalize.ts";
import {
  sanitizeEmailHtml,
  sanitizeEmailMessageHtml,
  sanitizeSafeInlineColorStyle,
} from "../company-workspace/brand-center/sanitize-email-html.ts";
import { buildComposerOutboundHtml, resolveCompanySignatureHtml } from "./email-signature-text.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

const COLORED = {
  name: "ValueOR Support",
  title: "Support Team",
  email: "support@valueor.com",
  website: "www.valueor.org",
  colors: {
    name: "#123456",
    title: "#654321",
    email: "#0F9F9A",
    website: "#7C3AED",
  },
} as const;

describe("email signature color normalization", () => {
  it("legacy string signatures keep working without colors", () => {
    const config = normalizeEmailSignatureConfig("ValueOR Support");
    assert.equal(config.name, "ValueOR Support");
    assert.equal(config.title, "");
    assert.equal(config.email, "");
    assert.equal(config.website, "");
    assert.equal(config.colors.name, "#111827");
  });

  it("old structured signatures without colors get defaults", () => {
    const config = normalizeEmailSignatureConfig({
      name: "ValueOR Support",
      title: "Support Team",
      email: "a@b.co",
      website: "www.valueor.org",
    });
    assert.equal(config.colors.title, "#111827");
    assert.equal(config.colors.website, "#111827");
  });

  it("structured signatures with colors keep exact hex values", () => {
    const config = normalizeEmailSignatureConfig(COLORED);
    assert.equal(config.colors.name, "#123456");
    assert.equal(config.colors.title, "#654321");
    assert.equal(config.colors.email, "#0F9F9A");
    assert.equal(config.colors.website, "#7C3AED");
  });
});

describe("email signature color persistence", () => {
  it("persists colors under companies.branding.email.signature.colors", () => {
    const persisted = toPersistedEmailSignature(COLORED);
    assert.deepEqual(persisted.colors, COLORED.colors);

    const doc = createDefaultBrandDocument({
      email: { signature: persisted },
    });
    const payload = toPersistedBrandingPayload(doc);
    const email = payload.email as { signature: { colors: typeof COLORED.colors } };
    assert.equal(email.signature.colors.name, "#123456");
    assert.equal(email.signature.colors.title, "#654321");
    assert.equal(email.signature.colors.email, "#0F9F9A");
    assert.equal(email.signature.colors.website, "#7C3AED");
  });
});

describe("email signature color HTML rendering", () => {
  it("emits inline colors for name, title, email, and website", () => {
    const html = renderEmailSignatureHtml(COLORED);
    assert.match(html, /<font color="#123456"/);
    assert.match(html, /<font color="#654321"/);
    assert.match(html, /<font color="#0F9F9A"/);
    assert.match(html, /<font color="#7C3AED"/);
    assert.match(html, /<div style="[^"]*color:#123456;"/);
    assert.match(html, /<div style="[^"]*color:#654321;"/);
    assert.match(html, /<div style="[^"]*color:#0F9F9A;"/);
    assert.match(html, /<div style="[^"]*color:#7C3AED;"/);
  });
});

describe("email signature color sanitization", () => {
  it("keeps style=color hex and blocks unsafe HTML", () => {
    const rendered = renderEmailSignatureHtml(COLORED);
    const dirty = `${rendered}<script>alert(1)</script><a href="javascript:alert(1)" style="color:#ff0000">x</a>`;
    const clean = sanitizeEmailHtml(dirty);
    assert.match(clean, /color:#123456/);
    assert.match(clean, /color:#654321/);
    assert.match(clean, /color:#0F9F9A/);
    assert.match(clean, /color:#7C3AED/);
    assert.match(clean, /<font color="#123456"/);
    assert.match(clean, /<font color="#7C3AED"/);
    assert.doesNotMatch(clean, /<script\b/i);
    assert.doesNotMatch(clean, /javascript:/i);
    assert.equal(sanitizeSafeInlineColorStyle("color:#123456; text-decoration:none;"), "color:#123456;text-decoration:none");
    assert.equal(sanitizeSafeInlineColorStyle("color:rgb(18, 52, 86);"), "color:#123456");
    assert.equal(sanitizeSafeInlineColorStyle("color:expression(alert(1))"), null);
    const rgbRewritten =
      '<a href="mailto:a@b.co" style="color:rgb(15, 159, 154);text-decoration:none;"><font color="rgb(15, 159, 154)" style="color:rgb(15, 159, 154);">a@b.co</font></a>';
    const rgbClean = sanitizeEmailHtml(rgbRewritten);
    assert.match(rgbClean, /color:#0F9F9A/i);
    assert.match(rgbClean, /<font color="#0F9F9A"/i);
  });

  it("message sanitizer also keeps signature colors", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Hello body</p>",
      signatureHtml: resolveCompanySignatureHtml(COLORED),
      logoUrl: "https://cdn.example/logo.png",
    });
    const clean = sanitizeEmailMessageHtml(html);
    assert.match(clean, /color:#123456/);
    assert.match(clean, /color:#7C3AED/);
    assert.match(clean, /Hello body/);
  });
});

describe("email signature color preview wiring", () => {
  it("identity panel preview uses the canonical renderer and per-field pickers", () => {
    const panel = readFileSync(
      join(loginAppSrc, "components/email/email-settings-identity-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /SignatureFieldColorControl/);
    assert.match(panel, /patchSignatureColor/);
    assert.match(panel, /renderEmailSignatureHtml\(email\.signature\)/);
    assert.doesNotMatch(panel, /\[&_a\]:text-foreground/);
    assert.doesNotMatch(panel, /Signature Color/);
    const composer = readFileSync(
      join(loginAppSrc, "components/email/email-composer-body-editor.tsx"),
      "utf8",
    );
    assert.match(composer, /renderConversationEmailHtml\(signatureHtml\)/);
    assert.match(composer, /email-composer-signature-html/);
    assert.doesNotMatch(composer, /email-composer-signature-preview[\s\S]{0,400}text-muted-foreground[\s\S]{0,80}dangerouslySetInnerHTML/);
  });
});

describe("email signature color outbound HTML", () => {
  it("final outbound HTML preserves the configured hex colors exactly once", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Hello body</p>",
      signatureHtml: resolveCompanySignatureHtml(COLORED),
      logoUrl: "https://cdn.example/logo.png",
    });
    assert.match(html, /color:#123456/);
    assert.match(html, /color:#654321/);
    assert.match(html, /color:#0F9F9A/);
    assert.match(html, /color:#7C3AED/);
    assert.match(html, /<font color="#123456"/);
    assert.match(html, /<font color="#654321"/);
    assert.match(html, /<font color="#0F9F9A"/);
    assert.match(html, /<font color="#7C3AED"/);
    assert.equal((html.match(/ValueOR Support/g) ?? []).length, 1);
    assert.equal((html.match(/<table\b/g) ?? []).length, 1);
    assert.match(html, /data-valueor-outbound-main="1"/);
    assert.doesNotMatch(html, /<table[\s\S]*<table/);
    assert.match(html, /data-valueor-email-signature="1"/);
    assert.ok(html.indexOf("Hello body") < html.indexOf("ValueOR Support"));
  });
});
