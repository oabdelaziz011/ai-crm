import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmailWorkspaceTemplateRenderContext,
  buildTrustedCompanyTemplateContext,
  findUnresolvedTemplateTokensAfterCompanyResolution,
  isResolvableCompanyTemplateToken,
  resolveCompanyTemplateVariablesInComposerContent,
  resolveCompanyTemplateVariablesInText,
  resolveTrustedCompanyNameForEmailTemplates,
} from "./email-template-company-context.ts";
import { renderEmailTemplate } from "./email-template-renderer.ts";
import { renderCompanySignatureHtml, buildComposerOutboundHtml } from "../email-workspace/email-signature-text.ts";
import { formatEmailListTemplateDisplay } from "../email-workspace/email-workspace-list-item.ts";
import { evaluateNewEmailSend } from "../email-workspace/email-compose-new.ts";

const COMPANY_A = {
  profileCompanyId: "company-a-id",
  company: { id: "company-a-id", name: "ABC Travel" },
};

const COMPANY_B = {
  profileCompanyId: "company-b-id",
  company: { id: "company-b-id", name: "XYZ Company" },
};

describe("trusted company template context", () => {
  it("resolves {{company.name}} from authenticated company", () => {
    assert.equal(resolveTrustedCompanyNameForEmailTemplates(COMPANY_A), "ABC Travel");
    const rendered = renderEmailTemplate(
      { subject: "Welcome to {{company.name}}", body: "Team {{company.name}}" },
      buildTrustedCompanyTemplateContext(COMPANY_A),
    );
    assert.equal(rendered.subject, "Welcome to ABC Travel");
    assert.equal(rendered.body, "Team ABC Travel");
    assert.deepEqual(rendered.unresolved, []);
  });

  it("Company A gets Company A and Company B gets Company B", () => {
    assert.equal(resolveTrustedCompanyNameForEmailTemplates(COMPANY_A), "ABC Travel");
    assert.equal(resolveTrustedCompanyNameForEmailTemplates(COMPANY_B), "XYZ Company");
  });

  it("rejects mismatched company record (cross-company impossible)", () => {
    assert.equal(
      resolveTrustedCompanyNameForEmailTemplates({
        profileCompanyId: "company-a-id",
        company: { id: "company-b-id", name: "XYZ Company" },
      }),
      null,
    );
    assert.deepEqual(
      buildTrustedCompanyTemplateContext({
        profileCompanyId: "company-a-id",
        company: { id: "company-b-id", name: "XYZ Company" },
      }),
      {},
    );
    // Even with a brand name present, never take the other tenant's company.name.
    const withBrand = resolveTrustedCompanyNameForEmailTemplates({
      profileCompanyId: "company-a-id",
      company: { id: "company-b-id", name: "XYZ Company" },
      brandCenterCompanyName: "ABC Travel Brand",
    });
    assert.equal(withBrand, "ABC Travel Brand");
    assert.notEqual(withBrand, "XYZ Company");
  });

  it("ignores empty profile company id", () => {
    assert.equal(
      resolveTrustedCompanyNameForEmailTemplates({
        profileCompanyId: null,
        company: { id: "company-a-id", name: "ABC Travel" },
      }),
      null,
    );
  });

  it("resolves customer + company together", () => {
    const context = buildEmailWorkspaceTemplateRenderContext({
      trustedCompany: COMPANY_A,
      customer: { name: "Ahmed", email: "ahmed@example.com" },
    });
    const rendered = renderEmailTemplate(
      {
        subject: "Welcome {{customer.name}} from {{company.name}}",
        body: "Hi {{customer.name}}, thanks for contacting {{company.name}}.",
      },
      context,
    );
    assert.equal(rendered.subject, "Welcome Ahmed from ABC Travel");
    assert.match(rendered.body, /Ahmed/);
    assert.match(rendered.body, /ABC Travel/);
    assert.deepEqual(rendered.unresolved, []);
  });

  it("resolves company even when customer is missing", () => {
    const rendered = resolveCompanyTemplateVariablesInComposerContent({
      subject: "Welcome {{customer.name}} from {{company.name}}",
      body: "Thanks for contacting {{company.name}}.",
      trustedCompany: COMPANY_A,
    });
    assert.equal(rendered.subject, "Welcome {{customer.name}} from ABC Travel");
    assert.equal(rendered.body, "Thanks for contacting ABC Travel.");
  });

  it("keeps unresolved customer protected and does not mark company unresolved", () => {
    const unresolved = findUnresolvedTemplateTokensAfterCompanyResolution(
      ["Welcome {{customer.name}} from {{company.name}}", "Body {{company.name}}"],
      COMPANY_A,
    );
    assert.deepEqual(unresolved, ["customer.name"]);
    assert.equal(isResolvableCompanyTemplateToken("company.name", COMPANY_A), true);
    assert.equal(isResolvableCompanyTemplateToken("customer.name", COMPANY_A), false);

    const gate = evaluateNewEmailSend({
      to: "a@example.com",
      subject: "Welcome {{customer.name}} from ABC Travel",
      body: "Thanks",
      attachmentCount: 0,
      unresolvedTemplateTokens: unresolved,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "unresolved_template");
  });

  it("composer preview resolves company name (EN + AR)", () => {
    assert.equal(
      resolveCompanyTemplateVariablesInText("Welcome to {{company.name}}", COMPANY_A),
      "Welcome to ABC Travel",
    );
    assert.equal(
      resolveCompanyTemplateVariablesInText("مرحبًا بك في {{company.name}}", COMPANY_A),
      "مرحبًا بك في ABC Travel",
    );
  });

  it("signature resolves at render time without mutating source", () => {
    const source = "مع أطيب التحيات،\nفريق {{company.name}}";
    const rendered = renderCompanySignatureHtml({
      signatureHtml: `<p>${source}</p>`,
      trustedCompany: COMPANY_A,
    });
    assert.match(rendered, /ABC Travel/);
    assert.doesNotMatch(rendered, /\{\{company\.name\}\}/);
    assert.match(source, /\{\{company\.name\}\}/);
  });

  it("outbound html contains resolved company name", () => {
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>شكرًا لتواصلك معنا في {{company.name}}</p>",
      signatureHtml: "<p>فريق {{company.name}}</p>",
      trustedCompany: COMPANY_A,
    });
    assert.match(html, /ABC Travel/);
    assert.doesNotMatch(html, /\{\{company\.name\}\}/);
    assert.doesNotMatch(html, /ValueOR/);
  });

  it("email list preview resolves company and strips missing customer", () => {
    const both = formatEmailListTemplateDisplay(
      "Welcome {{customer.name}} from {{company.name}}",
      { "customer.name": "Ahmed", "company.name": "ABC Travel" },
    );
    assert.equal(both, "Welcome Ahmed from ABC Travel");

    const companyOnly = formatEmailListTemplateDisplay(
      "Welcome {{customer.name}} from {{company.name}}",
      { "company.name": "ABC Travel" },
    );
    assert.equal(companyOnly, "Welcome from ABC Travel");
    assert.doesNotMatch(companyOnly, /\{\{/);
  });

  it("reusable template source remains templated after render", () => {
    const source = {
      subject: "Welcome to {{company.name}}",
      body: "Dear {{customer.name}},\n\nWelcome to {{company.name}}.",
    };
    const rendered = renderEmailTemplate(
      source,
      buildEmailWorkspaceTemplateRenderContext({
        trustedCompany: COMPANY_B,
        customer: { name: "Sara" },
      }),
    );
    assert.equal(rendered.subject, "Welcome to XYZ Company");
    assert.match(rendered.body, /Sara/);
    assert.match(rendered.body, /XYZ Company/);
    assert.equal(source.subject, "Welcome to {{company.name}}");
    assert.match(source.body, /\{\{company\.name\}\}/);
  });
});
