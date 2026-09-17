import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLocalDeveloperTunnelSafety,
  buildWebhookCallbackUrls,
  isForbiddenProductionTunnelName,
  isForbiddenProductionWebhookHost,
  isLocalApiServiceTarget,
  isLocalExternalOutboundExplicitlyAllowed,
  isLocalIntegrationEnabled,
  parseCloudflaredConfigSummary,
  resolveLocalPublicWebhookBase,
  resolvePublicWebhookBaseForMode,
  applyLocalIntegrationOverlay,
} from "./local-integration.mjs";

describe("local-integration webhook base isolation", () => {
  it("LOCAL + no tunnel → production webhook URL is NOT used", () => {
    const base = resolveLocalPublicWebhookBase({
      VALUEOR_ENV: "local",
      // nothing set
    });
    assert.equal(base, null);
    assert.equal(
      resolvePublicWebhookBaseForMode({
        VALUEOR_ENV: "local",
        WEBHOOK_BASE_URL: "https://webhook.valueor.org",
      }),
      null,
    );
  });

  it("LOCAL + developer tunnel → configured tunnel URL is used", () => {
    const base = resolveLocalPublicWebhookBase({
      VALUEOR_ENV: "local",
      PUBLIC_WEBHOOK_BASE_URL: "https://webhook-dev-alice.example.test",
    });
    assert.equal(base, "https://webhook-dev-alice.example.test");
    const urls = buildWebhookCallbackUrls(base);
    assert.equal(urls.instagram, "https://webhook-dev-alice.example.test/api/webhooks/instagram");
    assert.equal(urls.whatsapp, "https://webhook-dev-alice.example.test/api/webhooks/whatsapp");
  });

  it("prefers PUBLIC_WEBHOOK_BASE_URL over VITE_WEBHOOK_BASE_URL", () => {
    assert.equal(
      resolveLocalPublicWebhookBase({
        PUBLIC_WEBHOOK_BASE_URL: "https://a.example.test",
        VITE_WEBHOOK_BASE_URL: "https://b.example.test",
      }),
      "https://a.example.test",
    );
  });

  it("production mode may still resolve production webhook base", () => {
    assert.equal(
      resolvePublicWebhookBaseForMode({
        VALUEOR_ENV: "production",
        WEBHOOK_BASE_URL: "https://webhook.valueor.org",
      }),
      "https://webhook.valueor.org",
    );
  });
});

describe("local-integration outbound flags", () => {
  it("LOCAL + outbound disabled → not permitted", () => {
    assert.equal(isLocalExternalOutboundExplicitlyAllowed({ VALUEOR_ENV: "local" }), false);
    assert.equal(
      isLocalExternalOutboundExplicitlyAllowed({
        ALLOW_LOCAL_EXTERNAL_OUTBOUND: "1",
      }),
      false,
    );
  });

  it("LOCAL + outbound enabled only with LOCAL_INTEGRATION_ENABLED", () => {
    assert.equal(isLocalIntegrationEnabled({ LOCAL_INTEGRATION_ENABLED: "true" }), true);
    assert.equal(
      isLocalExternalOutboundExplicitlyAllowed({
        ALLOW_LOCAL_EXTERNAL_OUTBOUND: "1",
        LOCAL_INTEGRATION_ENABLED: "true",
      }),
      true,
    );
  });
});

describe("local-integration tunnel safety", () => {
  it("rejects production hostname and tunnel name", () => {
    assert.equal(isForbiddenProductionWebhookHost("https://webhook.valueor.org"), true);
    assert.equal(isForbiddenProductionTunnelName("vaultos-webhook"), true);
    assert.equal(isLocalApiServiceTarget("http://localhost:3001"), true);
    assert.equal(isLocalApiServiceTarget("http://127.0.0.1:3001"), true);
    assert.equal(isLocalApiServiceTarget("http://localhost:3000"), false);
  });

  it("rejects shared production config.yml and prod ingress", () => {
    const yaml = `
tunnel: vaultos-webhook
ingress:
  - hostname: webhook.valueor.org
    service: http://localhost:3001
  - service: http_status:404
`;
    assert.throws(
      () =>
        assertLocalDeveloperTunnelSafety({
          projectRoot: "/tmp/valueor",
          env: {
            VALUEOR_ENV: "local",
            CLOUDFLARE_TUNNEL_CONFIG: "infra/cloudflare/config.yml",
          },
          configText: yaml,
        }),
      /LOCAL DEVELOPER TUNNEL SAFETY CHECK FAILED/,
    );
  });

  it("accepts per-developer config targeting :3001", () => {
    const yaml = `
tunnel: valueor-local-alice
ingress:
  - hostname: webhook-alice.example.test
    service: http://localhost:3001
  - service: http_status:404
`;
    const result = assertLocalDeveloperTunnelSafety({
      projectRoot: "/tmp/valueor",
      env: {
        VALUEOR_ENV: "local",
        CLOUDFLARE_TUNNEL_CONFIG: "infra/cloudflare/config.alice.yml",
        PUBLIC_WEBHOOK_BASE_URL: "https://webhook-alice.example.test",
      },
      configText: yaml,
    });
    assert.equal(result.publicBase, "https://webhook-alice.example.test");
    assert.match(result.configPath.replace(/\\/g, "/"), /config\.alice\.yml$/);
  });

  it("parses cloudflared config summary", () => {
    const summary = parseCloudflaredConfigSummary(`
tunnel: valueor-local-bob
ingress:
  - hostname: webhook-bob.example.test
    service: http://127.0.0.1:3001
`);
    assert.equal(summary.tunnelName, "valueor-local-bob");
    assert.deepEqual(summary.hostnames, ["webhook-bob.example.test"]);
    assert.deepEqual(summary.services, ["http://127.0.0.1:3001"]);
  });

  it("overlay applies integration keys without touching supabase", () => {
    const merged = applyLocalIntegrationOverlay(
      { SUPABASE_URL: "http://127.0.0.1:54321", VALUEOR_ENV: "local" },
      {
        PUBLIC_WEBHOOK_BASE_URL: "https://webhook-dev.example.test",
        LOCAL_INTEGRATION_ENABLED: "true",
        SUPABASE_URL: "https://evil.supabase.co",
      },
    );
    assert.equal(merged.SUPABASE_URL, "http://127.0.0.1:54321");
    assert.equal(merged.PUBLIC_WEBHOOK_BASE_URL, "https://webhook-dev.example.test");
    assert.equal(merged.LOCAL_INTEGRATION_ENABLED, "true");
  });
});
