import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_TEMPLATE_PREVIEW_CONTEXT,
  EMAIL_TEMPLATE_VARIABLES,
  isValidEmailTemplateCode,
  normalizeEmailTemplateCode,
} from "../src/lib/email-templates/types.ts";
import { renderEmailTemplate } from "../src/lib/email-templates/email-template-renderer.ts";

describe("email template variables + renderer (Sprint 1)", () => {
  it("exposes the required canonical variables", () => {
    const keys = EMAIL_TEMPLATE_VARIABLES.map((v) => v.key);
    assert.deepEqual(keys, [
      "company.name",
      "customer.name",
      "customer.email",
      "ticket.number",
      "ticket.subject",
      "booking.reference",
    ]);
  });

  it("renders welcome template with sample context", () => {
    const rendered = renderEmailTemplate(
      {
        subject: "Welcome {{customer.name}}",
        body: "Hello {{customer.name}}, welcome to {{company.name}}.",
      },
      EMAIL_TEMPLATE_PREVIEW_CONTEXT,
    );
    assert.equal(rendered.subject, "Welcome Ahmed");
    assert.equal(rendered.body, "Hello Ahmed, welcome to Example Company.");
    assert.deepEqual(rendered.unresolved, []);
  });

  it("leaves unknown variables unresolved without executing code", () => {
    const rendered = renderEmailTemplate(
      {
        subject: "Hi {{customer.name}} {{evil.script}}",
        body: "{{unknown.var}} and ${process.env.SECRET}",
      },
      { "customer.name": "Ahmed" },
    );
    assert.equal(rendered.subject, "Hi Ahmed {{evil.script}}");
    assert.equal(rendered.body, "{{unknown.var}} and ${process.env.SECRET}");
    assert.ok(rendered.unresolved.includes("evil.script"));
    assert.ok(rendered.unresolved.includes("unknown.var"));
  });

  it("normalizes template codes", () => {
    assert.equal(normalizeEmailTemplateCode("Welcome Customer"), "welcome_customer");
    assert.equal(isValidEmailTemplateCode("welcome_customer"), true);
    assert.equal(isValidEmailTemplateCode("Bad Code!"), false);
  });
});
