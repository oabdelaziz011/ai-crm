import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  FawrySaasProvider,
  SandboxSaasProvider,
  StripeSaasProvider,
} from "./providers.js";
import { getSaasPaymentProviderRegistry } from "./provider-registry.js";

describe("SaaS payment providers (Part 2)", () => {
  it("registry lists sandbox/stripe/paymob/fawry", () => {
    const codes = getSaasPaymentProviderRegistry().list().sort();
    assert.deepEqual(codes, ["fawry", "paymob", "sandbox", "stripe"]);
  });

  it("sandbox creates hosted checkout URL with locked session id", async () => {
    process.env.SAAS_ALLOW_SANDBOX_PAYMENTS = "true";
    const provider = new SandboxSaasProvider();
    const result = await provider.createHostedCheckout({
      sessionId: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      amount: 99,
      currency: "EGP",
      returnUrl: "https://app.example/billing/return",
    });
    assert.equal(result.capability, "SUPPORTED");
    if (result.capability === "SUPPORTED") {
      assert.match(result.checkoutUrl, /saas_checkout=11111111-1111-1111-1111-111111111111/);
      assert.match(result.providerSessionId, /^sandbox_cs_/);
    }
  });

  it("sandbox verifies valid HMAC and rejects invalid", async () => {
    process.env.SAAS_SANDBOX_WEBHOOK_SECRET = "test-secret-saas";
    const provider = new SandboxSaasProvider();
    const body = JSON.stringify({
      event_id: "e1",
      status: "succeeded",
      checkout_session_id: "s1",
    });
    const hex = createHmac("sha256", "test-secret-saas").update(body, "utf8").digest("hex");
    assert.equal(await provider.verifyWebhookSignature(body, `sha256=${hex}`), true);
    assert.equal(await provider.verifyWebhookSignature(body, "sha256=deadbeef"), false);
    assert.equal(await provider.verifyWebhookSignature(body, null), false);
  });

  it("stripe verifies Stripe-Signature style HMAC", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const provider = new StripeSaasProvider();
    const body = '{"id":"evt_1","type":"checkout.session.completed"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const expected = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${body}`, "utf8")
      .digest("hex");
    const header = `t=${timestamp},v1=${expected}`;
    assert.equal(await provider.verifyWebhookSignature(body, header), true);
    assert.equal(await provider.verifyWebhookSignature(body, `t=${timestamp},v1=bad`), false);
  });

  it("stripe parseWebhook extracts checkout session metadata", () => {
    const provider = new StripeSaasProvider();
    const parsed = provider.parseWebhook({
      id: "evt_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          payment_status: "paid",
          client_reference_id: "sess-internal",
          metadata: {
            billing_checkout_session_id: "sess-internal",
            company_id: "should-be-ignored-for-auth",
          },
          payment_intent: "pi_1",
        },
      },
    });
    assert.equal(parsed.normalizedStatus, "succeeded");
    assert.equal(parsed.checkoutSessionId, "sess-internal");
    assert.equal(parsed.providerSessionId, "cs_test_1");
    assert.equal(parsed.untrustedCompanyId, "should-be-ignored-for-auth");
  });

  it("fawry reports NOT_IMPLEMENTED and does not fake checkout URL", async () => {
    const provider = new FawrySaasProvider();
    assert.equal(provider.capability(), "NOT_IMPLEMENTED");
    const result = await provider.createHostedCheckout({
      sessionId: "s",
      companyId: "c",
      amount: 10,
      currency: "EGP",
      returnUrl: "https://example.com",
    });
    assert.equal(result.capability, "NOT_IMPLEMENTED");
    assert.equal("checkoutUrl" in result, false);
  });

  it("stripe without secret reports CONFIGURATION_MISSING", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const provider = new StripeSaasProvider();
    assert.equal(provider.capability(), "CONFIGURATION_MISSING");
    const result = await provider.createHostedCheckout({
      sessionId: "s",
      companyId: "c",
      amount: 10,
      currency: "USD",
      returnUrl: "https://example.com",
    });
    assert.equal(result.capability, "CONFIGURATION_MISSING");
    assert.equal(result.code, "STRIPE_SECRET_KEY_MISSING");
  });
});
