import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  META_FACEBOOK_APP_ID_APP1,
  META_FACEBOOK_APP_ID_APP1_IG,
  classifyKnownMetaAppId,
  inspectInstagramWebhookAppOwnership,
  matchesInstagramWebhookCallback,
  sanitizeMetaErrorMessage,
} from "./instagram-webhook-app-ownership.js";

describe("Instagram webhook app ownership diagnostics", () => {
  it("classifies known Meta App IDs without treating env App ID as HMAC proof", () => {
    assert.equal(classifyKnownMetaAppId(META_FACEBOOK_APP_ID_APP1), "app1");
    assert.equal(classifyKnownMetaAppId(META_FACEBOOK_APP_ID_APP1_IG), "app1_ig");
    assert.equal(classifyKnownMetaAppId("990602627938098"), "other");
    assert.equal(classifyKnownMetaAppId(null), null);
  });

  it("matches Instagram webhook callbacks by host and path only", () => {
    assert.equal(
      matchesInstagramWebhookCallback({
        callbackHost: "webhook.valueor.org",
        callbackPath: "/api/webhooks/instagram",
        expectedHost: "webhook.valueor.org",
        expectedPath: "/api/webhooks/instagram",
      }),
      true,
    );
    assert.equal(
      matchesInstagramWebhookCallback({
        callbackHost: "example.test",
        callbackPath: "/api/webhooks/instagram",
        expectedHost: "webhook.valueor.org",
        expectedPath: "/api/webhooks/instagram",
      }),
      false,
    );
  });

  it("redacts tokens and URLs from Meta error messages", () => {
    const sanitized = sanitizeMetaErrorMessage(
      "Invalid at https://graph.facebook.com/v21.0/me?access_token=EAABSECRET123 and IGQWTOKEN",
    );
    assert.equal(sanitized?.includes("EAABSECRET123"), false);
    assert.equal(sanitized?.includes("https://"), false);
    assert.match(sanitized ?? "", /\[url\]/);
  });

  it("reports App1 dashboard ownership vs leftover App1-IG without leaking secrets", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);

      if (url.includes("/1093065463072724/subscriptions")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                object: "instagram",
                callback_url: "https://webhook.valueor.org/api/webhooks/instagram",
                fields: [{ name: "messages" }],
                active: true,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/1093065463072724?")) {
        return new Response(JSON.stringify({ id: "1093065463072724", name: "App1" }), { status: 200 });
      }
      if (url.includes("debug_token")) {
        return new Response(
          JSON.stringify({ data: { app_id: "1093065463072724", is_valid: true, type: "USER" } }),
          { status: 200 },
        );
      }
      if (url.includes("/subscribed_apps")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "1384216956603038", app_id: "1384216956603038", subscribed_fields: ["messages"] }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: "unexpected", code: 1 } }), { status: 400 });
    };

    const report = await inspectInstagramWebhookAppOwnership({
      companyId: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8",
      companyChannelId: "fa7d9846-60ac-4f36-b89f-728f9e8aaf57",
      instagramBusinessAccountId: "17841435877386136",
      accessToken: "ig-user-token",
      apiVersion: "v21.0",
      env: {
        INSTAGRAM_WEBHOOK_APP_ID: "1093065463072724",
        INSTAGRAM_WEBHOOK_APP_SECRET: "super-secret-app-secret",
        VITE_WEBHOOK_BASE_URL: "https://webhook.valueor.org",
      },
      fetchFn,
    });

    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /super-secret/);
    assert.doesNotMatch(serialized, /ig-user-token/);
    assert.doesNotMatch(serialized, /x-hub-signature/i);
    assert.equal(report.envAppIdIsDiagnosticOnly, true);
    assert.equal(report.hmacDoesNotUseAppId, true);
    assert.equal(report.facebookAppSecretCheck.ok, true);
    assert.equal(report.facebookAppSecretCheck.appName, "App1");
    assert.equal(report.conclusions.envSecretBelongsToConfiguredFacebookApp, true);
    assert.equal(report.conclusions.configuredAppAppearsToOwnDashboardWebhook, true);
    assert.equal(report.conclusions.accountSubscribedToLegacyApp1Ig, true);
    assert.equal(report.instagramSubscribedApps.appIds.includes("1384216956603038"), true);
  });

  it("detects when the env secret does not belong to the configured Facebook App ID", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Error validating application.", code: 190 } }), {
        status: 400,
      });

    const report = await inspectInstagramWebhookAppOwnership({
      companyId: "company-1",
      env: {
        INSTAGRAM_WEBHOOK_APP_ID: "1093065463072724",
        INSTAGRAM_WEBHOOK_APP_SECRET: "wrong-kind-of-secret",
      },
      fetchFn,
    });

    assert.equal(report.facebookAppSecretCheck.ok, false);
    assert.equal(report.conclusions.envSecretBelongsToConfiguredFacebookApp, false);
    assert.equal(report.envAppIdIsDiagnosticOnly, true);
  });
});
