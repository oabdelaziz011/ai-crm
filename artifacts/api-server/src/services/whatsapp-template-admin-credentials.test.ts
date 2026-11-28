import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyWhatsAppSettings } from "@login-app/lib/notifications/providers/whatsapp/types/whatsapp-types";
import {
  loadWhatsAppTemplateAdminCredentials,
  resolveWhatsAppTemplateAdminCredentials,
  WhatsAppTemplateAdminCredentialsError,
} from "./whatsapp-template-admin-credentials.js";

function baseSettings(
  overrides: Partial<CompanyWhatsAppSettings> = {},
): CompanyWhatsAppSettings {
  return {
    companyId: "company-a",
    enabled: false,
    provider: "meta_cloud",
    accessToken: "tok-a",
    phoneNumberId: "phone-a",
    businessAccountId: "waba-a",
    webhookVerifyToken: "",
    apiVersion: "v21.0",
    appSecret: "",
    webhookCallbackUrl: "",
    defaultLanguage: "en",
    maxRetryCount: 3,
    templateBindings: {},
    hasAccessToken: true,
    hasWebhookVerifyToken: false,
    hasAppSecret: false,
    tokenStatus: "valid",
    tokenExpiresAt: null,
    tokenCheckedAt: null,
    lastSuccessfulSendAt: null,
    lastAuthError: null,
    lastAuthErrorAt: null,
    lastAuthErrorCode: null,
    ...overrides,
  };
}

describe("whatsapp template admin credentials (decoupled from sending)", () => {
  it("allows template admin when outbound messaging is disabled", async () => {
    const credentials = await resolveWhatsAppTemplateAdminCredentials(
      baseSettings({ enabled: false }),
      "company-a",
    );
    assert.equal(credentials.messagingEnabled, false);
    assert.equal(credentials.businessAccountId, "waba-a");
    assert.equal(credentials.accessToken, "tok-a");
    assert.equal(credentials.companyId, "company-a");
  });

  it("allows template admin when outbound messaging is enabled", async () => {
    const credentials = await resolveWhatsAppTemplateAdminCredentials(
      baseSettings({ enabled: true }),
      "company-a",
    );
    assert.equal(credentials.messagingEnabled, true);
    assert.equal(credentials.businessAccountId, "waba-a");
  });

  it("fails when WABA is missing even if sending is enabled", async () => {
    await assert.rejects(
      () =>
        resolveWhatsAppTemplateAdminCredentials(
          baseSettings({ enabled: true, businessAccountId: "  " }),
          "company-a",
        ),
      (err: unknown) =>
        err instanceof WhatsAppTemplateAdminCredentialsError &&
        err.code === "waba_missing" &&
        err.statusCode === 400,
    );
  });

  it("fails when access token is missing", async () => {
    await assert.rejects(
      () =>
        resolveWhatsAppTemplateAdminCredentials(
          baseSettings({
            enabled: false,
            hasAccessToken: false,
            accessToken: "",
          }),
          "company-a",
        ),
      (err: unknown) =>
        err instanceof WhatsAppTemplateAdminCredentialsError && err.code === "token_missing",
    );
  });

  it("fails when settings row is missing", async () => {
    await assert.rejects(
      () => resolveWhatsAppTemplateAdminCredentials(null, "company-a"),
      (err: unknown) =>
        err instanceof WhatsAppTemplateAdminCredentialsError && err.code === "settings_missing",
    );
  });

  it("loads only the requested companyId (tenant isolation)", async () => {
    const seen: string[] = [];
    const fakeClient = {} as never;
    const result = await loadWhatsAppTemplateAdminCredentials(fakeClient, "company-a", {
      settingsLoader: {
        async getSecure(companyId) {
          seen.push(companyId);
          if (companyId !== "company-a") {
            return baseSettings({
              companyId: "company-b",
              businessAccountId: "waba-b",
              accessToken: "tok-b",
            });
          }
          return baseSettings({
            companyId: "company-a",
            enabled: false,
            businessAccountId: "waba-a",
            accessToken: "tok-a",
          });
        },
      },
    });

    assert.deepEqual(seen, ["company-a"]);
    assert.equal(result.credentials.companyId, "company-a");
    assert.equal(result.credentials.businessAccountId, "waba-a");
    assert.equal(result.credentials.accessToken, "tok-a");
    assert.equal(result.credentials.messagingEnabled, false);
  });

  it("does not return another company's WABA when asked for company A", async () => {
    const fakeClient = {} as never;
    const result = await loadWhatsAppTemplateAdminCredentials(fakeClient, "company-a", {
      settingsLoader: {
        async getSecure(companyId) {
          assert.equal(companyId, "company-a");
          return baseSettings({
            companyId: "company-a",
            enabled: false,
            businessAccountId: "waba-a-only",
            accessToken: "tok-a-only",
          });
        },
      },
    });
    assert.equal(result.credentials.businessAccountId, "waba-a-only");
    assert.notEqual(result.credentials.businessAccountId, "waba-b");
  });
});
