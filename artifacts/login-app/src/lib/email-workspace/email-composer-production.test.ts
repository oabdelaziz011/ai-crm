import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendHtmlSignatureOnce,
  findUnresolvedTemplateTokens,
  htmlContainsSignature,
  htmlToPlainText,
  insertTemplateIntoRichBody,
  plainTextToSafeHtml,
  sanitizeComposerHtml,
} from "./email-composer-rich-text.ts";
import { renderEmailTemplate } from "../email-templates/email-template-renderer.ts";
import { evaluateNewEmailSend } from "./email-compose-new.ts";
import {
  buildDiscardedEmailComposeMetadata,
  emailDraftHasDiscardableContent,
  planDiscardEmailDraft,
} from "./email-compose-discard.ts";
import { assertTicketLinkScope } from "./email-compose-ticket-link.ts";
import {
  EMAIL_COMPOSER_DRAFT_METADATA_KEY,
  buildEmailComposerDraftPatch,
  readEmailComposerDraft,
} from "./email-thread-outbound.ts";
import { buildEmailComposerOutbound, toEmailOutboundDispatchMetadata } from "@workspace/channel-platform";

describe("email composer rich text", () => {
  it("sanitizes unsafe HTML and preserves basic formatting", () => {
    const dirty = `<p>Hello <b>world</b><script>alert(1)</script></p><img src=x onerror=alert(1)>`;
    const clean = sanitizeComposerHtml(dirty);
    assert.match(clean, /<b>world<\/b>/i);
    assert.doesNotMatch(clean, /script/i);
    assert.doesNotMatch(clean, /onerror/i);
  });

  it("converts plain text to HTML and back", () => {
    const html = plainTextToSafeHtml("Line one\nLine two");
    assert.match(html, /Line one/);
    assert.equal(htmlToPlainText(html).includes("Line one"), true);
  });

  it("appends company signature once with separator", () => {
    const once = appendHtmlSignatureOnce("<p>Body</p>", "<p>Acme Support</p>");
    const twice = appendHtmlSignatureOnce(once, "<p>Acme Support</p>");
    assert.equal(once, twice);
    assert.ok(htmlContainsSignature(once, "<p>Acme Support</p>"));
  });

  it("inserts template into rich body without inventing a signature", () => {
    const html = insertTemplateIntoRichBody({
      currentHtml: "",
      templateBody: "Dear {{customer.name}},\nWelcome.",
      signatureHtml: "",
    });
    assert.match(html, /Dear \{\{customer\.name\}\}/);
  });
});

describe("template variable safety", () => {
  it("resolves customer.name when present", () => {
    const rendered = renderEmailTemplate(
      { subject: "Hi {{customer.name}}", body: "Welcome {{customer.name}}" },
      { "customer.name": "Ahmed" },
    );
    assert.equal(rendered.subject, "Hi Ahmed");
    assert.equal(rendered.body, "Welcome Ahmed");
    assert.deepEqual(rendered.unresolved, []);
  });

  it("keeps unresolved customer.name and blocks send", () => {
    const rendered = renderEmailTemplate(
      { subject: "Hi {{customer.name}}", body: "Welcome {{customer.name}}" },
      {},
    );
    assert.match(rendered.body, /\{\{customer\.name\}\}/);
    assert.deepEqual(rendered.unresolved, ["customer.name"]);
    const unresolved = findUnresolvedTemplateTokens(rendered.subject, rendered.body);
    const gate = evaluateNewEmailSend({
      to: "a@example.com",
      subject: rendered.subject,
      body: rendered.body,
      attachmentCount: 0,
      unresolvedTemplateTokens: unresolved,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "unresolved_template");
  });

  it("resolves company.name without treating it as unresolved", () => {
    const rendered = renderEmailTemplate(
      {
        subject: "Welcome to {{company.name}}",
        body: "Hi {{customer.name}} from {{company.name}}",
      },
      { "company.name": "ABC Travel" },
    );
    assert.equal(rendered.subject, "Welcome to ABC Travel");
    assert.equal(rendered.body, "Hi {{customer.name}} from ABC Travel");
    assert.deepEqual(rendered.unresolved, ["customer.name"]);
    const unresolved = findUnresolvedTemplateTokens(rendered.subject, rendered.body);
    assert.deepEqual(unresolved, ["customer.name"]);
    const gate = evaluateNewEmailSend({
      to: "a@example.com",
      subject: rendered.subject,
      body: "Thanks for contacting ABC Travel",
      attachmentCount: 0,
      unresolvedTemplateTokens: unresolved,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "unresolved_template");
  });

  it("detects multiple unresolved variables", () => {
    const unresolved = findUnresolvedTemplateTokens(
      "Ticket {{ticket.number}}",
      "Hi {{customer.name}} about {{ticket.status}}",
    );
    assert.deepEqual(unresolved, ["customer.name", "ticket.number", "ticket.status"]);
  });

  it("preserves rich HTML through draft restore after template insertion", () => {
    const bodyHtml = insertTemplateIntoRichBody({
      currentHtml: "",
      templateBody: "Hello <b>team</b>",
      signatureHtml: "",
    });
    const metadata = buildEmailComposerDraftPatch({}, {
      mode: "compose",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      subject: "Subj",
      body: htmlToPlainText(bodyHtml),
      bodyHtml,
      updatedAt: new Date().toISOString(),
      attachments: [],
    });
    const restored = readEmailComposerDraft(metadata);
    assert.ok(restored);
    assert.match(String(restored!.bodyHtml), /<b>team<\/b>/i);
  });
});

describe("multi-recipient outbound", () => {
  it("includes all To addresses in outbound metadata", () => {
    const built = buildEmailComposerOutbound({
      mode: "compose",
      snapshot: { subject: "Hello" },
      to: ["a@example.com", "b@example.com"],
      cc: ["c@example.com"],
      bcc: ["secret@example.com"],
      subject: "Hello",
    });
    const metadata = toEmailOutboundDispatchMetadata(built);
    assert.equal(built.recipientEmail, "a@example.com");
    assert.deepEqual(built.to, ["a@example.com", "b@example.com"]);
    assert.deepEqual(metadata.recipientEmails, ["a@example.com", "b@example.com"]);
    assert.deepEqual(metadata.cc, ["c@example.com"]);
    assert.deepEqual(metadata.bcc, ["secret@example.com"]);
  });
});

describe("discard draft", () => {
  it("plans close + attachment cleanup for unused New Email shell", () => {
    const plan = planDiscardEmailDraft({
      metadata: {
        emailComposeOrigin: "new_email",
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: { mode: "compose", body: "x" },
      },
      attachments: [
        {
          id: "1",
          name: "a.pdf",
          storagePath: "co/conv/a.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          kind: "pdf",
        },
      ],
      hasCustomerFacingMessages: false,
    });
    assert.equal(plan.closeConversation, true);
    assert.equal(plan.markDiscarded, true);
    assert.deepEqual(plan.orphanAttachmentPaths, ["co/conv/a.pdf"]);
  });

  it("does not close conversations that already have messages", () => {
    const plan = planDiscardEmailDraft({
      metadata: { emailComposeOrigin: "new_email" },
      attachments: [],
      hasCustomerFacingMessages: true,
    });
    assert.equal(plan.closeConversation, false);
    assert.equal(plan.markDiscarded, false);
  });

  it("marks discarded metadata and clears draft", () => {
    const next = buildDiscardedEmailComposeMetadata({
      emailComposeOrigin: "new_email",
      [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: { mode: "compose", body: "draft" },
    });
    assert.equal(next.emailComposeDiscarded, true);
    assert.equal(next[EMAIL_COMPOSER_DRAFT_METADATA_KEY], undefined);
  });

  it("detects discardable content", () => {
    assert.equal(
      emailDraftHasDiscardableContent({
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        bodyPlain: "",
        attachmentCount: 0,
      }),
      false,
    );
    assert.equal(
      emailDraftHasDiscardableContent({
        to: "a@example.com",
        cc: "",
        bcc: "",
        subject: "",
        bodyPlain: "",
        attachmentCount: 0,
      }),
      true,
    );
  });
});

describe("ticket link scope", () => {
  it("blocks cross-company ticket linking", () => {
    assert.equal(
      assertTicketLinkScope({
        companyId: "co-1",
        customerId: "cu-1",
        ticket: { companyId: "co-2", customerId: "cu-1" },
      }),
      false,
    );
  });

  it("allows same company and customer", () => {
    assert.equal(
      assertTicketLinkScope({
        companyId: "co-1",
        customerId: "cu-1",
        ticket: { companyId: "co-1", customerId: "cu-1" },
      }),
      true,
    );
  });
});
