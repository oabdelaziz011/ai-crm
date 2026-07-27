import assert from "node:assert/strict";
import { resolveApiVersion, isDeprecatedVersion } from "../src/lib/integration/api/api-version-resolver.ts";
import { hasScope, validateScopes } from "../src/lib/integration/api/scope-validator.ts";
import { computeWebhookSignature, validateWebhookSignature, hashSecret } from "../src/lib/integration/webhooks/webhook-signature.ts";
import { isReplay, resetReplayCache } from "../src/lib/integration/webhooks/replay-protection.ts";
import { isRegisteredEventType, WEBHOOK_EVENT_TYPES } from "../src/lib/integration/events/event-registry.ts";
import { generateSdkStub } from "../src/lib/integration/sdk/sdk-generator.ts";
import { CONNECTOR_REGISTRY, listAvailableConnectors } from "../src/lib/integration/connectors/connector-registry.ts";
import type { ApiScope } from "../src/lib/integration/types/integration-enums.ts";

{
  assert.equal(resolveApiVersion("/api/v1/customers"), "v1");
  assert.equal(resolveApiVersion("/api/v2/bookings"), "v2");
  assert.equal(resolveApiVersion("/api/customers"), null);
  assert.equal(isDeprecatedVersion("v1"), false);
}

{
  const granted: ApiScope[] = ["customers.read", "bookings.write"];
  assert.equal(hasScope(granted, "customers.read"), true);
  assert.equal(hasScope(granted, "bookings.read"), true);
  assert.equal(hasScope(granted, "invoices.read"), false);
  const result = validateScopes(granted, ["customers.read"]);
  assert.equal(result.valid, true);
  const missing = validateScopes(granted, ["invoices.read"]);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, ["invoices.read"]);
}

{
  const secret = "whsec_test";
  const payload = '{"id":"1"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = await computeWebhookSignature(secret, payload, timestamp);
  assert.ok(sig.length > 0);
  const valid = await validateWebhookSignature({ secret, payload, timestamp, signature: sig });
  assert.equal(valid, true);
  assert.equal(hashSecret("test").length, 64);
}

{
  resetReplayCache();
  assert.equal(isReplay("evt-1", "sub-1"), false);
  assert.equal(isReplay("evt-1", "sub-1"), true);
  resetReplayCache();
}

{
  assert.equal(WEBHOOK_EVENT_TYPES.length, 14);
  assert.equal(isRegisteredEventType("booking.created"), true);
  assert.equal(isRegisteredEventType("unknown.event"), false);
}

{
  const sdk = generateSdkStub({ language: "typescript", baseUrl: "https://api.example.com", apiVersion: "v1", packageName: "ValueOR" });
  assert.ok(sdk.files[0].content.includes("class ValueOR"));
}

{
  assert.ok(CONNECTOR_REGISTRY.length >= 10);
  assert.ok(listAvailableConnectors().some((c) => c.type === "whatsapp"));
}

console.log("integration-hub tests passed");
