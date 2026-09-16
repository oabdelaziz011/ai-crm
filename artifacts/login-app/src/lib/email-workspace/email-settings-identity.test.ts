import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_SETTINGS_IDENTITY_HREF,
  EMAIL_SETTINGS_TAB_IDS,
  emailSettingsTabFromHash,
  emailSettingsTabHref,
  parseEmailSettingsTab,
  resolveEmailSettingsTab,
} from "./email-settings-tabs.ts";
import { computeBrandHealth } from "../company-workspace/brand-center/brand-health.ts";
import { createDefaultBrandDocument } from "../company-workspace/brand-center/defaults.ts";
import { resolveEmailLogoUrl } from "../company-workspace/brand-center/normalize.ts";
import type { CompanyBrandLogos } from "../company-workspace/brand-center/types.ts";
import { resolveOutboundFromDisplayName } from "./email-sender-identity.ts";
import {
  buildComposerOutboundHtml,
  buildEmailLogoHtml,
  sanitizeEmailLogoUrl,
} from "./email-signature-text.ts";

function logos(partial: Pick<CompanyBrandLogos, "email" | "main">): CompanyBrandLogos {
  return {
    main: partial.main,
    dark: null,
    light: null,
    square: null,
    invoice: null,
    email: partial.email,
    favicon: null,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

describe("email settings two-tab navigation", () => {
  it("exposes exactly connection and identity", () => {
    assert.deepEqual([...EMAIL_SETTINGS_TAB_IDS], ["connection", "identity"]);
  });

  it("parses identity and connection; maps legacy sending/general to connection", () => {
    assert.equal(parseEmailSettingsTab("identity"), "identity");
    assert.equal(parseEmailSettingsTab("connection"), "connection");
    assert.equal(parseEmailSettingsTab("sending"), "connection");
    assert.equal(parseEmailSettingsTab("general"), "connection");
    assert.equal(parseEmailSettingsTab("unknown"), "connection");
    assert.equal(emailSettingsTabFromHash("#email-identity"), "identity");
    assert.equal(emailSettingsTabFromHash("#email-connection"), "connection");
    assert.equal(emailSettingsTabFromHash("#email-sending"), "connection");
    assert.equal(
      resolveEmailSettingsTab({ search: "?tab=identity", hash: "" }),
      "identity",
    );
    assert.equal(
      resolveEmailSettingsTab({ search: "?tab=sending", hash: "" }),
      "connection",
    );
    assert.equal(resolveEmailSettingsTab({ search: "", hash: "" }), "connection");
  });

  it("builds Email Identity href for Brand Center redirect", () => {
    assert.equal(emailSettingsTabHref("identity"), "~/dashboard/settings/email?tab=identity");
    assert.equal(EMAIL_SETTINGS_IDENTITY_HREF, "~/dashboard/settings/email?tab=identity");
    assert.equal(emailSettingsTabHref("routing"), "~/dashboard/email/ai-routing");
  });
});

describe("email settings identity panel wiring", () => {
  it("exposes personal and company sections with logo, switch, sender, signature, and footer", () => {
    const panel = readFileSync(
      join(loginAppSrc, "components/email/email-settings-identity-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /data-testid="email-settings-identity"/);
    assert.match(panel, /data-testid="email-identity-personal"/);
    assert.match(panel, /data-testid="email-identity-company"/);
    assert.match(panel, /data-testid="email-identity-logo"/);
    assert.match(panel, /data-testid="email-identity-switch"/);
    assert.match(panel, /data-testid="email-identity-sender"/);
    assert.match(panel, /testId="email-identity-signature"/);
    assert.match(panel, /data-testid="email-identity-footer"/);
    assert.match(panel, /data-testid="email-identity-sender-name"/);
    assert.match(panel, /data-testid="email-identity-personal-sender-name"/);
    assert.match(panel, /showLegalFooter/);
    assert.match(panel, /legalText/);
    assert.match(panel, /BrandAssetUploadCard/);
    assert.match(panel, /slot="email"/);
    assert.match(panel, /resolveEmailLogoUrl/);
    assert.match(panel, /resolveOutboundFromDisplayName/);
    assert.match(panel, /canManagePersonalEmailIdentity/);
    assert.match(panel, /canManageCompanyEmailIdentity/);
    assert.match(panel, /canManagePersonal \? \(/);
    assert.match(panel, /canEditCompany \? \(/);
    assert.doesNotMatch(panel, /disabled=\{!canEditCompany\}/);
  });

  it("identity panel reuses Brand Center persistence hooks and structured signature fields", () => {
    const panel = readFileSync(
      join(loginAppSrc, "components/email/email-settings-identity-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /useCompanyBrandCenter/);
    assert.match(panel, /useSaveCompanyEmailIdentity/);
    assert.match(panel, /useMyEmailIdentity/);
    assert.match(panel, /useSaveMyEmailIdentity/);
    assert.doesNotMatch(panel, /useSaveCompanyBrandCenter/);
    assert.match(panel, /fieldTestIdPrefix="email-identity-signature"/);
    assert.match(panel, /fieldTestIdPrefix="email-identity-personal-signature"/);
    assert.match(panel, /email-identity-signature-preview|\$\{testId\}-preview/);
    assert.match(panel, /renderEmailSignatureHtml/);
    assert.match(panel, /listCompanyEmailSenderOptions/);
    assert.doesNotMatch(panel, /EmailSignatureEditor/);
    assert.doesNotMatch(panel, /create table|from\("email_signatures"\)/i);
  });

  it("Email Settings page has only two hub tabs and sectioned connection panel", () => {
    const page = readFileSync(
      join(loginAppSrc, "pages/dashboard/settings/email-settings-page.tsx"),
      "utf8",
    );
    const hub = readFileSync(
      join(loginAppSrc, "components/email/email-settings-control-hub.tsx"),
      "utf8",
    );
    const connection = readFileSync(
      join(loginAppSrc, "components/email/email-settings-connection-panel.tsx"),
      "utf8",
    );
    assert.match(page, /EmailSettingsIdentityPanel/);
    assert.match(page, /EmailSettingsConnectionPanel/);
    assert.match(page, /activeTab === "identity"/);
    assert.match(page, /activeTab === "connection"/);
    assert.doesNotMatch(page, /activeTab === "sending"/);
    assert.doesNotMatch(page, /notifications\.email\.settings\.fromName/);
    assert.match(hub, /id: "connection"/);
    assert.match(hub, /id: "identity"/);
    assert.doesNotMatch(hub, /id: "sending"/);
    assert.equal((hub.match(/id: "/g) ?? []).length, 2);
    assert.match(connection, /email-connection-section-provider/);
    assert.match(connection, /email-connection-section-smtp/);
    assert.match(connection, /email-connection-section-inbound/);
    assert.match(connection, /email-connection-section-health/);
  });

  it("Brand Center redirects sender/signature/footer to Email Identity", () => {
    const studio = readFileSync(
      join(loginAppSrc, "components/company-workspace/brand-center/email-identity-studio.tsx"),
      "utf8",
    );
    assert.match(studio, /brand-center-email-identity-redirect/);
    assert.match(studio, /EMAIL_SETTINGS_IDENTITY_HREF/);
    assert.match(studio, /emailIdentityMoved/);
    assert.match(studio, /emailFooterMoved/);
    assert.match(studio, /brand-center-email-footer-redirect/);
    assert.match(studio, /brand-center-email-logo-readonly/);
    assert.match(studio, /brand-center-go-email-logo/);
    assert.match(studio, /EMAIL_SETTINGS_IDENTITY_HREF/);
    assert.doesNotMatch(studio, /onChangeLogo/);
    assert.doesNotMatch(studio, /EmailSignatureEditor/);
    assert.doesNotMatch(studio, /showLegalFooter/);
    assert.doesNotMatch(studio, /focusId="email-sender"/);
  });
});

describe("outbound from display name sync", () => {
  it("prefers Sender Name then Sender Display Name", () => {
    assert.equal(
      resolveOutboundFromDisplayName({
        senderName: "Customer Success",
        senderDisplayName: "ValueOR",
      }),
      "Customer Success",
    );
    assert.equal(
      resolveOutboundFromDisplayName({
        senderName: "",
        senderDisplayName: "ValueOR",
      }),
      "ValueOR",
    );
  });
});

describe("email logo outbound wiring", () => {
  it("rejects unsafe or empty logo URLs", () => {
    assert.equal(sanitizeEmailLogoUrl(""), null);
    assert.equal(sanitizeEmailLogoUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeEmailLogoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
    assert.equal(buildEmailLogoHtml(""), "");
  });

  it("inserts logo once between body and signature (not as a header)", () => {
    const body = "<p>Hello</p>";
    const signature = "<p>Best regards,<br/>Omar</p>";
    const logo = "https://cdn.example/email-logo.png";
    const once = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: signature,
      logoUrl: logo,
      legalFooterEnabled: true,
      legalFooterText: "Confidential message.",
    });
    assert.match(once, /data-email-identity-logo="1"/);
    assert.match(once, /data-email-legal-footer="1"/);
    assert.match(once, /Confidential message/);
    assert.equal((once.match(/Best regards/gi) ?? []).length, 1);
    assert.ok(once.indexOf("Hello") < once.indexOf('data-email-identity-logo="1"'));
    assert.ok(once.indexOf('data-email-identity-logo="1"') < once.indexOf("Best regards"));

    const none = buildComposerOutboundHtml({
      bodyHtml: body,
      signatureHtml: signature,
      logoUrl: null,
      legalFooterEnabled: false,
    });
    assert.doesNotMatch(none, /data-email-identity-logo/);
    assert.doesNotMatch(none, /data-email-legal-footer/);
  });

  it("composer preview accepts logo without inserting into body value", () => {
    const editor = readFileSync(
      join(loginAppSrc, "components/email/email-composer-body-editor.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(loginAppSrc, "components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(editor, /email-composer-logo-preview/);
    assert.match(editor, /logoUrl/);
    assert.match(panel, /logoUrl:\s*companyEmailLogoUrl/);
    assert.match(panel, /legalFooterEnabled/);
    assert.doesNotMatch(editor, /BrandAssetUploadCard|onUploaded|onDeleted/);
    assert.doesNotMatch(panel, /BrandAssetUploadCard/);
    assert.doesNotMatch(panel, /slot="email"/);
    assert.doesNotMatch(panel, /useSaveCompanyEmailIdentity/);
    assert.doesNotMatch(panel, /logos:\s*\{\s*\.\.\.previous\.logos,\s*email/);
  });
});

describe("email logo ownership and resolver", () => {
  it("Email Settings is the only logo manager; workspace has no management UI", () => {
    const settings = readFileSync(
      join(loginAppSrc, "components/email/email-settings-identity-panel.tsx"),
      "utf8",
    );
    const workspace = readFileSync(
      join(loginAppSrc, "components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    const assets = readFileSync(
      join(loginAppSrc, "components/company-workspace/brand-center/brand-assets-panel.tsx"),
      "utf8",
    );
    assert.match(settings, /data-testid="email-identity-logo"/);
    assert.match(settings, /BrandAssetUploadCard/);
    assert.match(settings, /slot="email"/);
    assert.match(settings, /onUploaded/);
    assert.match(settings, /onDeleted/);
    assert.match(settings, /logos: \{ \.\.\.previous\.logos, email: url \}/);
    assert.match(settings, /logos: \{ \.\.\.previous\.logos, email: null \}/);
    assert.match(settings, /readOnly=\{!canEditCompany\}/);
    assert.doesNotMatch(workspace, /BrandAssetUploadCard/);
    assert.doesNotMatch(workspace, /email-identity-logo/);
    assert.doesNotMatch(workspace, /slot="email"/);
    assert.doesNotMatch(assets, /slot: "email"/);
    assert.doesNotMatch(assets, /logoEmail/);
  });

  it("resolver returns logos.email, then logos.main, and clears when both empty", () => {
    assert.equal(
      resolveEmailLogoUrl(logos({ email: "https://cdn.example/b.png", main: "https://cdn.example/a.png" })),
      "https://cdn.example/b.png",
    );
    assert.equal(
      resolveEmailLogoUrl(logos({ email: "https://cdn.example/b.png", main: null })),
      "https://cdn.example/b.png",
    );
    assert.equal(
      resolveEmailLogoUrl(logos({ email: null, main: "https://cdn.example/a.png" })),
      "https://cdn.example/a.png",
    );
    assert.equal(resolveEmailLogoUrl(logos({ email: "", main: "" })), null);
    assert.equal(resolveEmailLogoUrl(logos({ email: null, main: null })), null);
  });

  it("replacing then removing email logo updates the resolver without rewriting prior HTML", () => {
    const signature = "<p>Best regards</p>";
    const withA = buildComposerOutboundHtml({
      bodyHtml: "<p>First</p>",
      signatureHtml: signature,
      logoUrl: resolveEmailLogoUrl(logos({ email: "https://cdn.example/logo-a.png", main: "https://cdn.example/main.png" })),
    });
    const withB = buildComposerOutboundHtml({
      bodyHtml: "<p>Second</p>",
      signatureHtml: signature,
      logoUrl: resolveEmailLogoUrl(logos({ email: "https://cdn.example/logo-b.png", main: "https://cdn.example/main.png" })),
    });
    assert.match(withA, /logo-a\.png/);
    assert.doesNotMatch(withA, /logo-b\.png/);
    assert.match(withB, /logo-b\.png/);
    assert.doesNotMatch(withB, /logo-a\.png/);
    assert.match(withA, /Best regards/);
    assert.match(withB, /Best regards/);

    const removed = buildComposerOutboundHtml({
      bodyHtml: "<p>Third</p>",
      signatureHtml: signature,
      logoUrl: resolveEmailLogoUrl(logos({ email: null, main: "https://cdn.example/main.png" })),
    });
    assert.match(removed, /main\.png/);
    assert.doesNotMatch(removed, /logo-a\.png/);
    assert.doesNotMatch(removed, /logo-b\.png/);
    assert.match(withA, /logo-a\.png/);
  });

  it("workspace outbound still uses resolveEmailLogoUrl and does not write branding.email.signature", () => {
    const workspace = readFileSync(
      join(loginAppSrc, "components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(workspace, /resolveEmailLogoUrl/);
    assert.match(workspace, /buildComposerOutboundHtml/);
    assert.match(workspace, /buildComposerOutboundText/);
    assert.doesNotMatch(workspace, /branding\.email\.signature\s*=/);
    assert.doesNotMatch(workspace, /p_email_logo/);
    assert.match(workspace, /\["compose", "reply", "reply_all", "forward"\]/);
    assert.equal((workspace.match(/logoUrl:\s*companyEmailLogoUrl/g) ?? []).length, 2);
    assert.match(workspace, /mode: composer\.mode === "compose" \? "compose" : composer\.mode/);
    assert.doesNotMatch(workspace, /if \(composer\.mode === "compose"\)[\s\S]{0,200}logoUrl/);
  });
});

describe("brand health after email identity move", () => {
  it("no longer tracks senderIdentity as a Brand Center checklist item", () => {
    const report = computeBrandHealth(createDefaultBrandDocument());
    assert.equal(
      report.items.some((item) => item.id === "senderIdentity"),
      false,
    );
    assert.ok(report.items.some((item) => item.id === "emailLogo"));
    const emailLogo = report.items.find((item) => item.id === "emailLogo");
    assert.equal(emailLogo?.target.section, "email");
    assert.equal(emailLogo?.target.focusId, "logo-email");
    assert.ok(report.items.some((item) => item.id === "emailFooter"));
  });
});

function assertNoRawKey(value: unknown, keyPath: string) {
  assert.equal(typeof value, "string", `${keyPath} must be a string`);
  const text = String(value);
  assert.ok(text.trim().length > 0, `${keyPath} must not be empty`);
  assert.doesNotMatch(
    text,
    /^(emailModule|notifications|companyWorkspace|buttons)\./,
    `${keyPath} must not be a raw i18n key (${text})`,
  );
}

describe("email identity localization", () => {
  it("includes required EN and AR copy for two-tab identity UX", () => {
    const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));
    assert.equal(en.emailModule.settingsHub.tabs.connection, "Connection");
    assert.equal(ar.emailModule.settingsHub.tabs.connection, "الاتصال");
    assert.equal(en.emailModule.settingsHub.tabs.identity, "Email Identity");
    assert.equal(ar.emailModule.settingsHub.tabs.identity, "هوية البريد");
    assert.equal(en.emailModule.settingsHub.identity.personal.title, "👤 My Email Identity");
    assert.equal(ar.emailModule.settingsHub.identity.personal.title, "👤 هويتي البريدية");
    assert.equal(
      en.emailModule.settingsHub.identity.personal.description,
      "Your personal details shown when you send messages from your account.",
    );
    assert.equal(
      ar.emailModule.settingsHub.identity.personal.description,
      "بياناتك الشخصية التي تظهر عند إرسال الرسائل من حسابك.",
    );
    assert.equal(en.emailModule.settingsHub.identity.company.title, "🏢 Company Email Identity");
    assert.equal(ar.emailModule.settingsHub.identity.company.title, "🏢 هوية بريد الشركة");
    assert.equal(
      ar.emailModule.settingsHub.identity.company.description,
      "بيانات مشتركة تديرها الشركة وتستخدم كإعدادات افتراضية للبريد.",
    );
    assert.equal(en.emailModule.settingsHub.identity.footer.title, "Email Footer");
    assert.equal(ar.emailModule.settingsHub.identity.footer.title, "تذييل البريد");
    assert.match(en.emailModule.settingsHub.identity.footer.helper, /signature/i);
    assert.match(ar.emailModule.settingsHub.identity.footer.helper, /التوقيع/);
    assert.equal(en.companyWorkspace.brandCenter.emailFooterMoved.cta, "Open Email Identity");
    assert.equal(ar.companyWorkspace.brandCenter.emailFooterMoved.cta, "فتح هوية البريد");
  });

  it("restores connect provider labels in EN and AR without raw keys", () => {
    const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));
    const connectKeys = [
      "title",
      "subtitle",
      "currentProvider",
      "presetApplied",
      "applyFailed",
      "connectMicrosoft",
      "microsoftConnected",
      "microsoftFailed",
      "microsoftNotConfigured",
    ] as const;
    for (const key of connectKeys) {
      assertNoRawKey(en.emailModule.connect[key], `en.connect.${key}`);
      assertNoRawKey(ar.emailModule.connect[key], `ar.connect.${key}`);
    }
    for (const provider of ["gmail", "microsoft_365", "imap_smtp"] as const) {
      assertNoRawKey(en.emailModule.connect.providers[provider], `en.providers.${provider}`);
      assertNoRawKey(ar.emailModule.connect.providers[provider], `ar.providers.${provider}`);
      assertNoRawKey(en.emailModule.connect.providerHints[provider], `en.hints.${provider}`);
      assertNoRawKey(ar.emailModule.connect.providerHints[provider], `ar.hints.${provider}`);
    }
    for (const status of [
      "connected",
      "connecting",
      "needs_reauthorization",
      "connection_error",
      "disabled",
    ] as const) {
      assertNoRawKey(en.emailModule.connect.status[status], `en.status.${status}`);
      assertNoRawKey(ar.emailModule.connect.status[status], `ar.status.${status}`);
    }
    assert.equal(en.emailModule.connect.title, "Connect Email");
    assert.equal(ar.emailModule.connect.title, "ربط البريد الإلكتروني");
    assert.equal(en.emailModule.connect.providers.gmail, "Gmail / Google Workspace");
    assert.equal(ar.emailModule.connect.providers.gmail, "Gmail / Google Workspace");
    assert.equal(en.emailModule.connect.status.connected, "Connected");
    assert.equal(ar.emailModule.connect.status.connected, "متصل");
  });

  it("keeps Email Identity labels translated in EN and AR", () => {
    const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));
    const identity = en.emailModule.settingsHub.identity;
    const identityAr = ar.emailModule.settingsHub.identity;
    assert.equal(identity.logo.title, "Email Logo");
    assert.equal(identityAr.logo.title, "شعار البريد");
    assert.match(identity.logo.description, /logo/i);
    assert.match(identityAr.logo.description, /الشعار/);
    assert.match(identity.logo.helper, /logo/i);
    assert.match(identityAr.logo.helper, /الشعار/);
    assert.equal(
      en.companyWorkspace.brandCenter.emailStudio.logoFromAssets,
      "Managed only in Email Settings → Email Identity. This preview is read-only.",
    );
    assert.equal(
      ar.companyWorkspace.brandCenter.emailStudio.logoFromAssets,
      "يُدار فقط من إعدادات البريد → هوية البريد. هذه معاينة للقراءة فقط.",
    );
    assert.equal(en.companyWorkspace.brandCenter.uploadImage, "Upload");
    assert.equal(ar.companyWorkspace.brandCenter.uploadImage, "رفع");
    assert.equal(en.companyWorkspace.brandCenter.replaceImage, "Replace");
    assert.equal(ar.companyWorkspace.brandCenter.replaceImage, "استبدال");
    assert.equal(en.companyWorkspace.brandCenter.deleteImage, "Delete image");
    assertNoRawKey(ar.companyWorkspace.brandCenter.deleteImage, "ar.deleteImage");
    assert.equal(en.emailModule.workspace.logoLabel, "Email logo");
    assert.equal(ar.emailModule.workspace.logoLabel, "شعار البريد");
    assert.equal(identity.emailSwitch.title, "Email Account");
    assert.equal(identityAr.emailSwitch.title, "تبديل البريد");
    assert.equal(identity.senderIdentity.title, "Sender Identity");
    assert.equal(identityAr.senderIdentity.title, "هوية المرسل");
    assertNoRawKey(en.companyWorkspace.brandCenter.emailStudio.senderName, "en.senderName");
    assert.equal(ar.companyWorkspace.brandCenter.emailStudio.senderName, "اسم المرسل");
    assertNoRawKey(
      en.companyWorkspace.brandCenter.emailStudio.senderDisplayName,
      "en.senderDisplayName",
    );
    assert.equal(ar.companyWorkspace.brandCenter.emailStudio.senderDisplayName, "اسم العرض للمرسل");
    assertNoRawKey(en.companyWorkspace.brandCenter.replyEmail, "en.replyEmail");
    assert.equal(ar.companyWorkspace.brandCenter.replyEmail, "بريد الرد (Reply-To)");
    assert.equal(identity.signature.title, "Email Signature");
    assert.equal(identityAr.signature.title, "توقيع البريد");
    assert.equal(identity.signature.nameLabel, "Signature Name");
    assert.equal(identityAr.signature.nameLabel, "اسم التوقيع");
    assert.equal(identity.signature.titleLabel, "Signature Title");
    assert.equal(identity.signature.emailLabel, "Signature Email");
    assert.equal(identity.signature.websiteLabel, "Signature Website");
    assert.equal(identity.signature.previewLabel, "Preview");
    assert.equal(identity.signature.colorLabel, "Color for {{field}}");
    assert.equal(identityAr.signature.colorLabel, "لون {{field}}");
    assert.equal(identityAr.signature.description, "يتم إضافة هذا التوقيع تلقائيًا إلى الرسائل الصادرة.");
    assert.equal(identity.saveChanges, "Save Changes");
    assert.equal(identityAr.saveChanges, "حفظ التغييرات");
    assert.match(identity.personal.title, /My Email Identity/);
    assert.match(identityAr.personal.title, /هويتي البريدية/);
    assert.match(identity.company.title, /Company Email Identity/);
    assert.match(identityAr.company.title, /هوية بريد الشركة/);
    assertNoRawKey(identity.personal.description, "en.personal.description");
    assertNoRawKey(identityAr.personal.description, "ar.personal.description");
    assertNoRawKey(identity.company.description, "en.company.description");
    assertNoRawKey(identityAr.company.description, "ar.company.description");
    assertNoRawKey(en.emailModule.settingsHub.connection.permissionHint, "en.connection.permissionHint");
    assertNoRawKey(ar.emailModule.settingsHub.connection.permissionHint, "ar.connection.permissionHint");
    for (const sample of [
      identity.logo.helper,
      identity.senderIdentity.senderNameHelper,
      identity.senderIdentity.replyToHelper,
      identity.signature.description,
      identity.footer.helper,
      identityAr.logo.helper,
      identityAr.senderIdentity.senderNameHelper,
      identityAr.footer.helper,
    ]) {
      assertNoRawKey(sample, "helper");
    }
  });

  it("preserves Brand Center and Email Workspace namespace roots", () => {
    const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));
    assert.ok(en.companyWorkspace?.brandCenter?.emailStudio);
    assert.ok(ar.companyWorkspace?.brandCenter?.emailStudio);
    assert.ok(en.emailModule?.workspace);
    assert.ok(ar.emailModule?.workspace);
    assert.equal(Object.keys(en.emailModule.settingsHub.tabs).length, 2);
    assert.equal(Object.keys(ar.emailModule.settingsHub.tabs).length, 2);
  });
});
