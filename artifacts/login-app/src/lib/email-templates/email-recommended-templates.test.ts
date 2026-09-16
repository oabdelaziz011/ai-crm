import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMAIL_TEMPLATE_VARIABLES } from "./types.ts";
import { renderEmailTemplate as render } from "./email-template-renderer.ts";
import { classifyEmailTemplateCategory } from "./email-template-categories.ts";
import { RECOMMENDED_EMAIL_TEMPLATES } from "./email-recommended-templates.ts";

describe("recommended email templates (not persisted)", () => {
  it("uses only supported renderer variables", () => {
    const allowed = new Set(EMAIL_TEMPLATE_VARIABLES.map((v) => v.key));
    const tokenRe = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;
    for (const row of RECOMMENDED_EMAIL_TEMPLATES) {
      const hay = `${row.subject}\n${row.body}`;
      for (const match of hay.matchAll(tokenRe)) {
        assert.ok(allowed.has(match[1] as never), `unsupported variable ${match[1]}`);
      }
    }
  });

  it("classifies recommended codes into the intended UI category", () => {
    for (const row of RECOMMENDED_EMAIL_TEMPLATES) {
      assert.equal(classifyEmailTemplateCategory(row), row.categoryId, row.code);
    }
  });

  it("renders preview context without leaking objects", () => {
    const sample = RECOMMENDED_EMAIL_TEMPLATES.find((r) => r.code === "ticket_created")!;
    const rendered = render(sample, {
      "company.name": "ValueOR",
      "customer.name": "Ahmed",
      "ticket.number": "TKT-000124",
      "ticket.subject": "Billing",
      "ticket.status": "in_progress",
    });
    assert.match(rendered.subject, /TKT-000124/);
    assert.doesNotMatch(rendered.body, /\[object Object\]/);
    assert.doesNotMatch(rendered.body, /\{"/);
  });
});
