import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadCompanyWhatsAppCredentialsDecrypted,
  resolveWhatsAppRuntimeConfiguration,
} from "./whatsapp-canonical-credentials.js";

describe("loadCompanyWhatsAppCredentialsDecrypted", () => {
  it("reads canonical plaintext settings when decrypted RPC is unavailable", async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: "Could not find the function", code: "PGRST202" },
      }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                access_token: "settings-token",
                phone_number_id: "1214681355059951",
                business_account_id: "1584022663181525",
                webhook_verify_token: "verify-token",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const credentials = await loadCompanyWhatsAppCredentialsDecrypted(
      client as never,
      "company-1",
      {
        onDiagnostic: (detail) => diagnostics.push(detail),
      },
    );

    assert.equal(credentials?.accessToken, "settings-token");
    assert.equal(credentials?.phoneNumberId, "1214681355059951");
    assert.ok(diagnostics.some((entry) => entry.stage === "canonical.load.table.mapped"));
  });
});

describe("resolveWhatsAppRuntimeConfiguration", () => {
  it("loads runtime configuration from canonical settings", async () => {
    const config = await resolveWhatsAppRuntimeConfiguration(
      "company-1",
      { phoneNumberId: "1214681355059951", credentialsSource: "company_whatsapp_settings" },
      {
        loadByCompanyId: async () => ({
          accessToken: "settings-token",
          phoneNumberId: "1214681355059951",
          verifyToken: "verify-token",
          apiVersion: "v21.0",
          businessAccountId: "1584022663181525",
          appSecret: "app-secret",
        }),
      },
    );

    assert.equal(config.accessToken, "settings-token");
    assert.equal(config.phoneNumberId, "1214681355059951");
    assert.equal(config.verifyToken, "verify-token");
    assert.equal(config.businessAccountId, "1584022663181525");
    assert.equal(config.appSecret, "app-secret");
  });

  it("falls back to channel phone number reference when settings phone is empty", async () => {
    const config = await resolveWhatsAppRuntimeConfiguration(
      "company-1",
      { phoneNumberId: "1214681355059951" },
      {
        loadByCompanyId: async () => ({
          accessToken: "settings-token",
          phoneNumberId: "",
          verifyToken: "verify-token",
          apiVersion: "v21.0",
        }),
      },
    );

    assert.equal(config.phoneNumberId, "1214681355059951");
  });

  it("prefers channel phone number when settings phone number is stale", async () => {
    const config = await resolveWhatsAppRuntimeConfiguration(
      "company-1",
      { phoneNumberId: "1214681355059951" },
      {
        loadByCompanyId: async () => ({
          accessToken: "settings-token",
          phoneNumberId: "1168042419733416",
          verifyToken: "verify-token",
          apiVersion: "v21.0",
        }),
      },
    );

    assert.equal(config.phoneNumberId, "1214681355059951");
  });

  it("throws when canonical credentials are missing", async () => {
    await assert.rejects(
      () =>
        resolveWhatsAppRuntimeConfiguration(
          "company-1",
          { phoneNumberId: "1214681355059951" },
          { loadByCompanyId: async () => null },
        ),
      /not configured/i,
    );
  });
});
