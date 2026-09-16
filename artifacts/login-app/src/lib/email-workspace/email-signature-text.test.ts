import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendSignatureOnce,
  applyAiBodyKeepingSignature,
  buildComposerOutboundHtml,
  buildEmailLogoHtml,
  buildEmailSignatureBlockHtml,
  htmlToPlainSignature,
  insertEmailLogoOnce,
  resolveCompanySignatureHtml,
  sanitizeEmailLogoUrl,
  splitHtmlAroundQuotedHistory,
} from "./email-signature-text.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

function assertNoGmailClipHazards(html: string) {
  assert.doesNotMatch(html, /display\s*:\s*none/i);
  assert.doesNotMatch(html, /visibility\s*:\s*hidden/i);
  assert.doesNotMatch(html, /opacity\s*:\s*0/i);
  assert.doesNotMatch(html, /max-height\s*:\s*0/i);
  assert.doesNotMatch(html, /height\s*:\s*0/i);
  assert.doesNotMatch(html, /font-size\s*:\s*0/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(
    html,
    /<div data-valueor-email-signature="1" style="border-top:1px solid #e5e7eb;margin-top:1rem;padding-top:0.75rem;"><\/div>/,
  );
}

describe("email company signature text", () => {
  it("strips HTML without executing it", () => {
    const text = htmlToPlainSignature("<p>ValueOR</p><br/>Support&nbsp;Team");
    assert.match(text, /ValueOR/);
    assert.match(text, /Support Team/);
    assert.doesNotMatch(text, /<p>/);
  });

  it("appends a signature only once", () => {
    const first = appendSignatureOnce("Hello", "Best regards");
    assert.equal(first, "Hello\n\nBest regards");
    assert.equal(appendSignatureOnce(first, "Best regards"), first);
  });

  it("AI rewrite does not multiply an existing signature", () => {
    const rewritten = applyAiBodyKeepingSignature(
      "Formal reply\n\nBest regards",
      "Best regards",
    );
    assert.equal(rewritten, "Formal reply\n\nBest regards");
    const restored = applyAiBodyKeepingSignature("Formal reply", "Best regards");
    assert.equal(restored, "Formal reply\n\nBest regards");
  });
});

describe("email logo outbound composition (body → logo → signature)", () => {
  const logo = "https://cdn.example/email-logo.png";
  const body = "<p>Hello Ahmed,</p><p>Thank you for contacting ValueOR.</p>";
  const signature = "<p>Best regards,<br/>ValueOR Support</p>";

  it("places logo between body and signature for new email", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: signature,
      logoUrl: logo,
    });
    const bodyIdx = html.indexOf("Hello Ahmed");
    const logoIdx = html.indexOf('data-email-identity-logo="1"');
    const sigIdx = html.indexOf("ValueOR Support");
    assert.ok(bodyIdx >= 0 && logoIdx >= 0 && sigIdx >= 0);
    assert.ok(bodyIdx < logoIdx, "body before logo");
    assert.ok(logoIdx < sigIdx, "logo before signature");
    assert.equal((html.match(/data-email-identity-logo="1"/g) ?? []).length, 1);
    assert.equal((html.match(/ValueOR Support/gi) ?? []).length, 1);
    assertNoGmailClipHazards(html);
  });

  it("places logo after body when signature is empty", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: "",
      logoUrl: logo,
    });
    const bodyIdx = html.indexOf("Hello Ahmed");
    const logoIdx = html.indexOf('data-email-identity-logo="1"');
    assert.ok(bodyIdx < logoIdx);
    assert.doesNotMatch(html, /data-valueor-email-signature/);
  });

  it("places signature after body when logo is missing", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: signature,
      logoUrl: null,
    });
    assert.doesNotMatch(html, /data-email-identity-logo/);
    assert.match(html, /ValueOR Support/);
    assert.ok(html.indexOf("Hello Ahmed") < html.indexOf("ValueOR Support"));
    assertNoGmailClipHazards(html);
  });

  it("returns body only when logo and signature are missing", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: "",
      logoUrl: null,
    });
    assert.match(html, /Hello Ahmed/);
    assert.doesNotMatch(html, /data-email-identity-logo/);
    assert.doesNotMatch(html, /data-valueor-email-signature/);
  });

  it("does not duplicate logo when body already contains identity logo", () => {
    const withLogo = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: signature,
      logoUrl: logo,
    });
    const twice = insertEmailLogoOnce(withLogo, buildEmailLogoHtml(logo));
    assert.equal((twice.match(/data-email-identity-logo="1"/g) ?? []).length, 1);
  });

  it("does not insert logo into editable composer body value", () => {
    const editor = readFileSync(
      join(loginAppSrc, "components/email/email-composer-body-editor.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(loginAppSrc, "components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(editor, /email-composer-logo-preview/);
    assert.match(editor, /email-composer-body-editable/);
    const editableIdx = editor.indexOf("email-composer-body-editable");
    const logoPreviewIdx = editor.indexOf("email-composer-logo-preview");
    const sigPreviewIdx = editor.indexOf("email-composer-signature-preview");
    assert.ok(editableIdx < logoPreviewIdx);
    assert.ok(logoPreviewIdx < sigPreviewIdx);
    assert.match(panel, /logoUrl:\s*companyEmailLogoUrl/);
    assert.match(panel, /htmlSanitized:\s*outboundHtml/);
  });

  it("rejects unsafe logo URLs", () => {
    assert.equal(sanitizeEmailLogoUrl(""), null);
    assert.equal(sanitizeEmailLogoUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeEmailLogoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
  });

  it("signature block is contentful HTML (not empty separator)", () => {
    const block = buildEmailSignatureBlockHtml("ValueOR Support");
    assert.match(block, /<div\b/i);
    assert.doesNotMatch(block, /<table\b/i);
    assert.match(block, /data-valueor-email-signature="1"/);
    assert.match(block, /ValueOR Support/);
    assertNoGmailClipHazards(block);
  });

  it("final HTML: signature not inside blockquote; logo once; sig once", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: `${body}<blockquote class="gmail_quote"><p>Older mail</p></blockquote>`,
      signatureHtml: signature,
      logoUrl: logo,
    });
    const bodyIdx = html.indexOf("Hello Ahmed");
    const logoIdx = html.indexOf('data-email-identity-logo="1"');
    const sigIdx = html.indexOf("data-valueor-email-signature");
    const quoteIdx = html.indexOf("blockquote");
    assert.ok(bodyIdx < logoIdx && logoIdx < sigIdx && sigIdx < quoteIdx);
    assert.equal((html.match(/data-email-identity-logo="1"/g) ?? []).length, 1);
    assert.equal((html.match(/data-valueor-email-signature="1"/g) ?? []).length, 1);
    const sigSlice = html.slice(sigIdx, quoteIdx);
    assert.doesNotMatch(sigSlice, /<blockquote\b/i);
    assertNoGmailClipHazards(html);
  });

  it("forwarded history stays after logo and signature", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: `<p>Please see below.</p><p>---------- Forwarded message ----------</p><p>Old</p>`,
      signatureHtml: "<p>ValueOR Support</p>",
      logoUrl: logo,
    });
    const logoIdx = html.indexOf('data-email-identity-logo="1"');
    const sigIdx = html.indexOf("data-valueor-email-signature");
    const fwdIdx = html.indexOf("Forwarded message");
    assert.ok(logoIdx >= 0 && sigIdx >= 0 && fwdIdx >= 0);
    assert.ok(logoIdx < fwdIdx && sigIdx < fwdIdx);
  });

  it("splitHtmlAroundQuotedHistory isolates leading compose content", () => {
    const split = splitHtmlAroundQuotedHistory(
      `<p>New reply</p><blockquote class="gmail_quote"><p>Old</p></blockquote>`,
    );
    assert.match(split.leading, /New reply/);
    assert.match(split.quoted, /blockquote/);
    assert.doesNotMatch(split.leading, /blockquote/);
  });

  it("configured companies.branding.email.signature appears exactly once in outbound HTML", () => {
    const configured = "TEST-CONFIGURED-SIGNATURE";
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Hello body</p>",
      signatureHtml: configured,
      logoUrl: logo,
    });
    assert.match(html, /TEST-CONFIGURED-SIGNATURE/);
    assert.equal((html.match(/TEST-CONFIGURED-SIGNATURE/g) ?? []).length, 1);
    assert.match(html, /data-valueor-email-signature="1"/);
    assert.ok(html.indexOf("Hello body") < html.indexOf("TEST-CONFIGURED-SIGNATURE"));
    assert.ok(html.indexOf('data-email-identity-logo="1"') < html.indexOf("TEST-CONFIGURED-SIGNATURE"));
  });

  it("structured branding signature renders into outbound HTML", () => {
    const signatureHtml = resolveCompanySignatureHtml({
      name: "ValueOR Customer Care",
      title: "Customer Success Team",
      email: "support@valueor.com",
      website: "www.valueor.com",
    });
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Body</p>",
      signatureHtml,
      logoUrl: logo,
    });
    assert.match(html, /ValueOR Customer Care/);
    assert.match(html, /Customer Success Team/);
    assert.match(html, /support@valueor\.com/);
    assert.match(html, /www\.valueor\.com/);
    assert.equal((html.match(/data-valueor-email-signature="1"/g) ?? []).length, 1);
    assert.ok(html.indexOf("Body") < html.indexOf('data-email-identity-logo="1"'));
    assert.ok(html.indexOf('data-email-identity-logo="1"') < html.indexOf("ValueOR Customer Care"));
    assert.match(html, /data-valueor-outbound-main="1"/);
    assert.doesNotMatch(html, /<table[\s\S]*<table/);
  });

  it("outbound HTML preserves per-field signature colors after sanitization", () => {
    const signatureHtml = resolveCompanySignatureHtml({
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
    });
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Body unchanged</p>",
      signatureHtml,
      logoUrl: logo,
    });
    assert.match(html, /color:#123456/);
    assert.match(html, /color:#654321/);
    assert.match(html, /color:#0F9F9A/);
    assert.match(html, /color:#7C3AED/);
    assert.match(html, /<font color="#123456"/);
    assert.match(html, /<font color="#654321"/);
    assert.match(html, /<font color="#0F9F9A"/);
    assert.match(html, /<font color="#7C3AED"/);
    assert.match(html, /mailto:support@valueor\.com/);
    assert.match(html, /https:\/\/www\.valueor\.org/);
    assert.equal((html.match(/data-valueor-email-signature="1"/g) ?? []).length, 1);
    assert.equal((html.match(/<table\b/g) ?? []).length, 1);
    assert.match(html, /data-valueor-outbound-main="1"/);
    assert.doesNotMatch(html, /<table[\s\S]*<table/);
    assert.ok(html.indexOf("Body unchanged") < html.indexOf('data-email-identity-logo="1"'));
    assert.ok(html.indexOf('data-email-identity-logo="1"') < html.indexOf("ValueOR Support"));
    assert.doesNotMatch(html, /<script\b/i);
  });

  it("legacy string signature resolves without invented optional fields", () => {
    const html = resolveCompanySignatureHtml("ValueOR Support");
    assert.match(html, /ValueOR Support/);
    assert.doesNotMatch(html, /Customer Success Team/);
    assert.doesNotMatch(html, /support@valueor\.com/);
    assert.doesNotMatch(html, /www\.valueor\.com/);
  });

  it("empty signature emits body → logo only (no signature marker or fallback)", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Hello body</p>",
      signatureHtml: "",
      logoUrl: logo,
    });
    assert.doesNotMatch(html, /data-valueor-email-signature/);
    assert.doesNotMatch(html, /ValueOR Support/);
    assert.doesNotMatch(html, /Customer Success Team/);
    assert.doesNotMatch(html, /support@valueor\.com/);
    assert.doesNotMatch(html, /www\.valueor\.com/);
    assert.match(html, /Hello body/);
    assert.match(html, /data-email-identity-logo="1"/);
  });

  it("whitespace-only signature is treated as cleared (no fallback block)", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Body only</p>",
      signatureHtml: "   \n\t  ",
      logoUrl: null,
    });
    assert.doesNotMatch(html, /data-valueor-email-signature/);
    assert.equal(html.includes("Body only"), true);
  });

  it("sender name / display name / reply-to are not signature inputs", () => {
    // buildComposerOutboundHtml has no sender fields — signature is branding.email.signature only.
    const htmlA = buildComposerOutboundHtml({
      bodyHtml: "<p>Body</p>",
      signatureHtml: "SIG-A",
    });
    const htmlB = buildComposerOutboundHtml({
      bodyHtml: "<p>Body</p>",
      signatureHtml: "SIG-A",
    });
    assert.equal(htmlA, htmlB);
    assert.match(htmlA, /SIG-A/);
    assert.doesNotMatch(htmlA, /Customer Success Team/);
  });
});

describe("email signature production builders have no hardcoded ValueOR company signature", () => {
  it("email-signature-text.ts does not embed company-specific signature copy", () => {
    const src = readFileSync(join(here, "email-signature-text.ts"), "utf8");
    assert.doesNotMatch(src, /ValueOR Support/);
    assert.doesNotMatch(src, /Customer Success Team/);
    assert.doesNotMatch(src, /support@valueor\.com/);
    assert.doesNotMatch(src, /www\.valueor\.com/);
  });

  it("defaults.ts starts with empty signature (no silent company default)", () => {
    const src = readFileSync(
      join(here, "../company-workspace/brand-center/defaults.ts"),
      "utf8",
    );
    assert.match(src, /export function emptyEmailSignature/);
    assert.match(src, /name:\s*""/);
    assert.match(src, /title:\s*""/);
    assert.match(src, /email:\s*""/);
    assert.match(src, /website:\s*""/);
    assert.doesNotMatch(src, /support@valueor\.com/);
    assert.doesNotMatch(src, /Customer Success Team/);
  });
});
