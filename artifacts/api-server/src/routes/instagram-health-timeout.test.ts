import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "instagram.ts"), "utf8");

describe("Instagram outbound health timeout and diagnostics", () => {
  it("keeps a route timeout so Cloudflare cannot drop the POST without CORS", () => {
    assert.match(source, /INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS = 20_000/);
    assert.match(source, /instagram_health_timeout/);
    assert.match(source, /withTimeout\(/);
  });

  it("logs request metadata without authorization values or Graph tokens", () => {
    assert.match(source, /instagramHealthDiag: true/);
    assert.match(source, /hasAuthorization: Boolean\(req\.header\("authorization"\)\)/);
    assert.doesNotMatch(source, /req\.header\("authorization"\)\s*,/);
    assert.doesNotMatch(source, /accessToken/);
    assert.doesNotMatch(source, /webhookVerifyToken/);
    assert.doesNotMatch(source, /appSecret/);
  });

  it("still requires supabase auth and company scope before the health handler", () => {
    const authIndex = source.indexOf("router.use(requireSupabaseAuth)");
    const scopeIndex = source.indexOf('router.use(requireCompanyScope("companyId"))');
    const handlerIndex = source.indexOf('router.post("/instagram/channel-outbound-health"');
    assert.ok(authIndex >= 0);
    assert.ok(scopeIndex > authIndex);
    assert.ok(handlerIndex > scopeIndex);
  });
});
