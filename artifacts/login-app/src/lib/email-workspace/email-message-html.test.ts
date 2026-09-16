/**
 * Persisted email HTML + display sanitizer — logo survives thread rendering.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeEmailHtml,
  sanitizeEmailMessageHtml,
} from "../company-workspace/brand-center/sanitize-email-html.ts";
import { buildComposerOutboundHtml, sanitizeEmailLogoUrl } from "./email-signature-text.ts";
import {
  conversationEmailHtmlContainsIdentityLogo,
  readConversationEmailHtml,
  renderConversationEmailHtml,
} from "./email-message-html.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOGO = "https://cdn.example/brand/email-logo.png";
const BODY = "<p>Hello Ahmed,</p><p>Thank you for contacting ValueOR.</p>";
const SIGNATURE = "<p>Best regards,<br/>ValueOR Support</p>";

describe("email message HTML persistence + display", () => {
  it("composer sanitizer still strips img from editable body", () => {
    const dirty = `${BODY}<img src="${LOGO}" /><script>alert(1)</script>`;
    const clean = sanitizeEmailHtml(dirty);
    assert.doesNotMatch(clean, /<img/i);
    assert.doesNotMatch(clean, /script/i);
    assert.match(clean, /Hello Ahmed/);
  });

  it("message display sanitizer preserves identity logo img once", () => {
    const outbound = buildComposerOutboundHtml({
      bodyHtml: BODY,
      signatureHtml: SIGNATURE,
      logoUrl: LOGO,
    });
    assert.ok(conversationEmailHtmlContainsIdentityLogo(outbound));
    const rendered = renderConversationEmailHtml(outbound);
    assert.ok(conversationEmailHtmlContainsIdentityLogo(rendered));
    assert.ok(rendered.indexOf("Hello Ahmed") < rendered.indexOf("data-email-identity-logo"));
    assert.ok(rendered.indexOf("data-email-identity-logo") < rendered.indexOf("Best regards"));
    assert.doesNotMatch(rendered, /<script/i);
    assert.doesNotMatch(rendered, /javascript:/i);
  });

  it("message sanitizer drops unsafe img src schemes", () => {
    const dirty =
      '<p>Hi</p><div data-email-identity-logo="1"><img src="javascript:alert(1)" /></div>';
    const clean = sanitizeEmailMessageHtml(dirty);
    assert.doesNotMatch(clean, /<img/i);
    assert.doesNotMatch(clean, /javascript:/i);
  });

  it("readConversationEmailHtml prefers metadata.htmlSanitized", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: BODY,
      signatureHtml: SIGNATURE,
      logoUrl: LOGO,
    });
    const fromMeta = readConversationEmailHtml({
      metadata: { htmlSanitized: html, htmlOriginal: "<p>stale</p>" },
    });
    assert.equal(fromMeta, html);
    assert.equal(readConversationEmailHtml({ metadata: {} }), null);
  });

  it("rejects localhost logo URLs for outbound MIME", () => {
    assert.equal(sanitizeEmailLogoUrl("http://localhost:54321/logo.png"), null);
    assert.equal(sanitizeEmailLogoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
  });

  it("send path persists htmlSanitized and thread renderer uses it", () => {
    const reply = readFileSync(
      join(__dirname, "../../hooks/conversations/use-team-inbox-reply.ts"),
      "utf8",
    );
    assert.match(reply, /htmlSanitized/);
    assert.match(reply, /emailHtmlFromOutbound/);
    const panel = readFileSync(
      join(__dirname, "../../components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /renderConversationEmailHtml/);
    assert.match(panel, /EMAIL_HTML_DOCUMENT_CLASSNAME/);
    assert.doesNotMatch(panel, /email-thread-message-html[\s\S]{0,180}prose /);
  });
});
