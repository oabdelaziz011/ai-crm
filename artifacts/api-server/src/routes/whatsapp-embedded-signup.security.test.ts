import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const routePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "whatsapp-embedded-signup.ts",
);
const indexPath = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

describe("whatsapp-embedded-signup routes (security contracts)", () => {
  const route = readFileSync(routePath, "utf8");
  const index = readFileSync(indexPath, "utf8");

  it("mounts isolated router without modifying webhook routes", () => {
    assert.match(index, /whatsappEmbeddedSignupRouter/);
    assert.match(index, /whatsappRouter/);
    assert.doesNotMatch(index, /webhooks/);
  });

  it("requires auth, company scope, commercial feature, and feature flag", () => {
    assert.match(route, /requireSupabaseAuth/);
    assert.match(route, /requireCompanyScope\("companyId"\)/);
    assert.match(route, /assertRouteCommercialFeature\(companyId, "whatsapp_channel"\)/);
    assert.match(route, /isWhatsAppEmbeddedSignupEnabled/);
    assert.match(route, /ES_DISABLED/);
  });

  it("exposes session/complete/status under /whatsapp/embedded-signup", () => {
    assert.match(route, /\/whatsapp\/embedded-signup\/session/);
    assert.match(route, /\/whatsapp\/embedded-signup\/complete/);
    assert.match(route, /\/whatsapp\/embedded-signup\/status/);
  });

  it("does not call Meta subscribe helpers from the route module", () => {
    assert.doesNotMatch(route, /maybeSubscribeWabaToWebhook|subscribed_apps/);
  });
});
