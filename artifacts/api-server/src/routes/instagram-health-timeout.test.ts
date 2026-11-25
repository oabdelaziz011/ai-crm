import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "instagram.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../app.ts"), "utf8");

describe("Instagram outbound health timeout and diagnostics", () => {
  it("keeps a route timeout so Cloudflare cannot drop the POST without CORS", () => {
    assert.match(source, /INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS = 20_000/);
    assert.match(source, /instagram_health_timeout/);
    assert.match(source, /withInstagramHealthTimeout\(/);
    assert.match(source, /AbortController/);
  });

  it("applies pre-Meta stage timeouts on the Instagram health path only", () => {
    const diag = readFileSync(resolve(here, "instagram-health-diag.ts"), "utf8");
    assert.match(diag, /INSTAGRAM_HEALTH_PRE_META_STAGE_TIMEOUT_MS = 10_000/);
    assert.match(diag, /INSTAGRAM_HEALTH_HARD_DEADLINE_MS = 45_000/);
    assert.match(diag, /instagram_health_stage_timeout/);
    assert.match(diag, /instagram_health_deadline/);
    assert.match(diag, /sendInstagramHealthTimeoutResponse/);
    assert.doesNotMatch(diag, /requireSupabaseAuth/);
    assert.match(source, /wrapInstagramHealthHardDeadline\(/);
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
    const authIndex = source.indexOf('wrapInstagramHealthMiddleware("supabase_auth", requireSupabaseAuth)');
    const scopeIndex = source.indexOf(
      'wrapInstagramHealthMiddleware("company_scope", requireCompanyScope("companyId"))',
    );
    const handlerIndex = source.indexOf('router.post("/instagram/channel-outbound-health"');
    assert.ok(authIndex >= 0);
    assert.ok(scopeIndex > authIndex);
    assert.ok(handlerIndex > scopeIndex);
  });

  it("keeps request-context middleware before the /api router mount", () => {
    const contextIndex = appSource.indexOf("app.use(requestContextMiddleware)");
    const apiMountIndex = appSource.indexOf('app.use("/api", router)');
    assert.ok(contextIndex >= 0, "requestContextMiddleware must remain mounted");
    assert.ok(apiMountIndex > contextIndex, "request context must run before /api routes");
  });
});
