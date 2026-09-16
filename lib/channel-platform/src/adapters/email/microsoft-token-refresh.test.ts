import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureFreshMicrosoftAccessToken } from "./microsoft-token-refresh.ts";
import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.ts";
import type { EmailChannelConfiguration } from "./email-config.ts";

function baseConfig(overrides?: Partial<EmailChannelConfiguration>): EmailChannelConfiguration {
  return {
    fromEmail: "user@contoso.com",
    fromName: "User",
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpEncryption: "starttls",
    outboundProvider: "microsoft_graph",
    inboundProvider: "microsoft_graph",
    mailboxProvider: "microsoft_365",
    oauthAccessToken: "access-old",
    oauthRefreshToken: "refresh-1",
    oauthExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

describe("ensureFreshMicrosoftAccessToken", () => {
  it("returns existing config when access token is still valid", async () => {
    const config = baseConfig();
    const next = await ensureFreshMicrosoftAccessToken({
      config,
      companyId: "co-1",
      nowMs: Date.now(),
    });
    assert.equal(next.oauthAccessToken, "access-old");
  });

  it("refreshes expired token and persists via RPC when client provided", async () => {
    const calls: unknown[] = [];
    const config = baseConfig({
      oauthExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const prevId = process.env.MICROSOFT_EMAIL_CLIENT_ID;
    const prevSecret = process.env.MICROSOFT_EMAIL_CLIENT_SECRET;
    const prevTenant = process.env.MICROSOFT_EMAIL_TENANT_ID;
    const prevRedirect = process.env.MICROSOFT_EMAIL_REDIRECT_URI;
    process.env.MICROSOFT_EMAIL_CLIENT_ID = "cid";
    process.env.MICROSOFT_EMAIL_CLIENT_SECRET = "csecret";
    process.env.MICROSOFT_EMAIL_TENANT_ID = "common";
    process.env.MICROSOFT_EMAIL_REDIRECT_URI = "http://localhost/callback";

    try {
      const next = await ensureFreshMicrosoftAccessToken({
        config,
        companyId: "co-1",
        nowMs: Date.now(),
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              access_token: "access-new",
              refresh_token: "refresh-2",
              expires_in: 3600,
            }),
            { status: 200 },
          )) as typeof fetch,
        client: {
          rpc: async (name: string, args: unknown) => {
            calls.push({ name, args });
            return { data: null, error: null };
          },
        } as never,
      });

      assert.equal(next.oauthAccessToken, "access-new");
      assert.equal(next.oauthRefreshToken, "refresh-2");
      assert.equal(calls.length, 1);
      assert.equal((calls[0] as { name: string }).name, "store_company_email_oauth_tokens");
      const args = (calls[0] as { args: Record<string, unknown> }).args;
      assert.equal(args.p_access_token, "access-new");
      assert.equal(args.p_company_id, "co-1");
    } finally {
      process.env.MICROSOFT_EMAIL_CLIENT_ID = prevId;
      process.env.MICROSOFT_EMAIL_CLIENT_SECRET = prevSecret;
      process.env.MICROSOFT_EMAIL_TENANT_ID = prevTenant;
      process.env.MICROSOFT_EMAIL_REDIRECT_URI = prevRedirect;
    }
  });

  it("throws oauth_expired when refresh token missing and access expired", async () => {
    await assert.rejects(
      () =>
        ensureFreshMicrosoftAccessToken({
          config: baseConfig({
            oauthAccessToken: "stale",
            oauthRefreshToken: "",
            oauthExpiresAt: new Date(Date.now() - 1).toISOString(),
          }),
          companyId: "co-1",
          nowMs: Date.now(),
        }),
      (error: unknown) =>
        error instanceof Error && error.message === EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED,
    );
  });
});
