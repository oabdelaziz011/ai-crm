import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canAccessEmailSettingsPage,
  canManageCompanyEmailIdentity,
  canManageEmailConnection,
  canManagePersonalEmailIdentity,
  EMAIL_COMPANY_IDENTITY_PERMISSION,
  EMAIL_CONNECTION_PERMISSION,
  EMAIL_PERSONAL_IDENTITY_PERMISSION,
  EMAIL_SETTINGS_LEGACY_PERMISSION,
} from "./email-identity-permissions.ts";
import {
  emptyPersonalEmailIdentity,
  normalizePersonalEmailIdentity,
  resolveEffectiveEmailSignature,
  resolvePersonalSenderName,
} from "./email-personal-identity.ts";
import {
  buildComposerOutboundHtml,
  sanitizeEmailLogoUrl,
} from "./email-signature-text.ts";

describe("email identity permissions", () => {
  it("separates connection, personal, and company codes", () => {
    assert.equal(EMAIL_CONNECTION_PERMISSION, "email.settings.manage");
    assert.equal(EMAIL_PERSONAL_IDENTITY_PERMISSION, "email.identity.manage");
    assert.equal(EMAIL_COMPANY_IDENTITY_PERMISSION, "email.identity.company.manage");
    assert.equal(EMAIL_SETTINGS_LEGACY_PERMISSION, "ai.email.manage");
  });

  it("gates connection only with email.settings.manage; Super Admin bypasses", () => {
    assert.equal(
      canManageEmailConnection((c) => c === EMAIL_CONNECTION_PERMISSION, false),
      true,
    );
    assert.equal(
      canManageEmailConnection((c) => c === EMAIL_SETTINGS_LEGACY_PERMISSION, false),
      false,
    );
    assert.equal(
      canManageEmailConnection((c) => c === EMAIL_PERSONAL_IDENTITY_PERMISSION, false),
      false,
    );
    assert.equal(canManageEmailConnection(() => false, true), true);
  });

  it("gates personal identity only by email.identity.manage", () => {
    assert.equal(
      canManagePersonalEmailIdentity((c) => c === EMAIL_PERSONAL_IDENTITY_PERMISSION, false),
      true,
    );
    assert.equal(
      canManagePersonalEmailIdentity((c) => c === EMAIL_CONNECTION_PERMISSION, false),
      false,
    );
    assert.equal(canManagePersonalEmailIdentity(() => false, true), true);
  });

  it("gates company identity only with email.identity.company.manage", () => {
    assert.equal(
      canManageCompanyEmailIdentity((c) => c === EMAIL_COMPANY_IDENTITY_PERMISSION, false),
      true,
    );
    assert.equal(
      canManageCompanyEmailIdentity((c) => c === EMAIL_SETTINGS_LEGACY_PERMISSION, false),
      false,
    );
    assert.equal(
      canManageCompanyEmailIdentity((c) => c === "company.branding", false),
      false,
    );
    assert.equal(
      canManageCompanyEmailIdentity((c) => c === EMAIL_PERSONAL_IDENTITY_PERMISSION, false),
      false,
    );
    assert.equal(canManageCompanyEmailIdentity(() => false, true), true);
  });

  it("Email Settings logo card stays gated by company identity permission", () => {
    const panel = readFileSync(
      new URL("../../components/email/email-settings-identity-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /canManageCompanyEmailIdentity/);
    assert.match(panel, /const canEditCompany = canManageCompanyEmailIdentity/);
    assert.match(panel, /readOnly=\{!canEditCompany\}/);
    assert.match(panel, /data-testid="email-identity-logo"/);
    assert.match(panel, /useSaveCompanyEmailIdentity\(\s*canEditCompany \? companyId : null/);
  });

  it("settings page access accepts any of the three new codes or legacy", () => {
    assert.equal(
      canAccessEmailSettingsPage((c) => c === EMAIL_PERSONAL_IDENTITY_PERMISSION, false),
      true,
    );
    assert.equal(
      canAccessEmailSettingsPage((c) => c === "email.view", false),
      false,
    );
  });
});

describe("email identity migration 366 retracts broad grants", () => {
  it("does not insert role or template grants for the new codes", () => {
    const sql = readFileSync(
      new URL("../../../../../supabase/migrations/366_email_identity_rbac_no_broad_grants.sql", import.meta.url),
      "utf8",
    );
    assert.match(sql, /email\.settings\.manage/);
    assert.match(sql, /email\.identity\.manage/);
    assert.match(sql, /email\.identity\.company\.manage/);
    assert.match(sql, /delete from public\.role_permissions/);
    assert.match(sql, /delete from public\.platform_role_template_permissions/);
    assert.match(sql, /expected 0 role grants/);
    assert.doesNotMatch(sql, /insert into public\.role_permissions/);
    assert.doesNotMatch(sql, /insert into public\.platform_role_template_permissions/);
    assert.match(sql, /user_has_permission\('email\.settings\.manage'\)/);
    assert.doesNotMatch(sql, /or public\.user_has_permission\('ai\.email\.manage'\)/);
  });
});

describe("resolveEffectiveEmailSignature", () => {
  const company = {
    name: "Company Support",
    title: "Support",
    email: "support@example.com",
    website: "www.example.com",
  };
  const personal = {
    name: "Omar Agent",
    title: "Agent",
    email: "omar@example.com",
    website: "",
  };

  it("prefers personal signature over company", () => {
    const result = resolveEffectiveEmailSignature({
      personalSignature: personal,
      companySignature: company,
    });
    assert.equal(result.source, "personal");
    assert.match(result.html, /Omar Agent/);
    assert.doesNotMatch(result.html, /Company Support/);
  });

  it("falls back to company when personal is empty", () => {
    const result = resolveEffectiveEmailSignature({
      personalSignature: emptyPersonalEmailIdentity().signature,
      companySignature: company,
    });
    assert.equal(result.source, "company");
    assert.match(result.html, /Company Support/);
  });

  it("returns none when both empty", () => {
    const result = resolveEffectiveEmailSignature({
      personalSignature: null,
      companySignature: null,
    });
    assert.equal(result.source, "none");
    assert.equal(result.html, "");
  });
});

describe("personal sender defaults", () => {
  it("uses configured personal sender name else profile full name", () => {
    assert.equal(
      resolvePersonalSenderName({
        personal: { ...emptyPersonalEmailIdentity(), senderName: "Omar" },
        profileFullName: "Profile Name",
      }),
      "Omar",
    );
    assert.equal(
      resolvePersonalSenderName({
        personal: emptyPersonalEmailIdentity(),
        profileFullName: "Profile Name",
      }),
      "Profile Name",
    );
  });

  it("normalizes profiles.email_identity without inventing fields", () => {
    const doc = normalizePersonalEmailIdentity({
      senderName: " A ",
      senderDisplayName: " B ",
      signature: { name: "Sig", title: "", email: "", website: "" },
    });
    assert.equal(doc.senderName, "A");
    assert.equal(doc.senderDisplayName, "B");
    assert.equal(doc.signature.name, "Sig");
  });
});

describe("composer reply paths share the effective signature resolver", () => {
  it("Reply, Reply All, and Forward send through one outbound builder", () => {
    const panel = readFileSync(
      new URL("../../components/email/email-workspace-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /mode === "reply_all"/);
    assert.match(panel, /mode === "forward"/);
    assert.match(panel, /buildComposerOutboundHtml\(/);
    assert.match(panel, /resolveEffectiveEmailSignature/);
    assert.equal((panel.match(/buildComposerOutboundHtml\(/g) ?? []).length, 1);
  });
});

describe("outbound effective signature + logo order", () => {
  it("applies personal signature once after logo", () => {
    const effective = resolveEffectiveEmailSignature({
      personalSignature: {
        name: "Personal",
        title: "Agent",
        email: "",
        website: "",
      },
      companySignature: {
        name: "Company",
        title: "Team",
        email: "",
        website: "",
      },
    });
    const logoUrl = sanitizeEmailLogoUrl("https://cdn.example.com/logo.png");
    const html = buildComposerOutboundHtml({
      bodyHtml: "<p>Hello</p>",
      signatureHtml: effective.html,
      logoUrl,
    });
    assert.match(html, /Hello/);
    assert.match(html, /cdn\.example\.com\/logo\.png/);
    assert.match(html, /Personal/);
    assert.doesNotMatch(html, /Company/);
    const personalCount = (html.match(/Personal/g) ?? []).length;
    assert.equal(personalCount, 1);
    const bodyIdx = html.indexOf("Hello");
    const logoIdx = html.indexOf("logo.png");
    const sigIdx = html.indexOf("Personal");
    assert.ok(bodyIdx < logoIdx && logoIdx < sigIdx);
  });
});
