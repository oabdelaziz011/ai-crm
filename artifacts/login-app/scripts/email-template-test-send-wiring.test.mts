import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  resolve(dir, "../src/pages/dashboard/email/email-templates-page.tsx"),
  "utf8",
);
const route = readFileSync(resolve(dir, "../../api-server/src/routes/email.ts"), "utf8");
const provider = readFileSync(
  resolve(dir, "../src/lib/notifications/providers/email/services/email-provider.ts"),
  "utf8",
);
const client = readFileSync(
  resolve(dir, "../src/lib/notifications/providers/email/services/email-api-client.ts"),
  "utf8",
);

describe("email template test-send wiring (Sprint 2)", () => {
  it("UI exposes Send Test Email dialog states", () => {
    assert.match(page, /useTestSendEmailTemplate/);
    assert.match(page, /testSendOpen/);
    assert.match(page, /emailModule\.templates\.testSend/);
    assert.match(page, /testSendMutation\.isPending/);
  });

  it("API route reuses auth + company scope + settings.edit + existing provider", () => {
    assert.match(route, /\/email\/templates\/test-send/);
    assert.match(route, /requireSupabaseAuth/);
    assert.match(route, /requireCompanyScope/);
    assert.match(route, /settings\.edit/);
    assert.match(route, /sendEmailTemplate/);
    assert.match(route, /provider\.sendDirect/);
    assert.match(route, /email_template_test_sent/);
    assert.match(route, /TEST_SEND_COOLDOWN_MS/);
    assert.doesNotMatch(route, /smtpPassword|SUPABASE_SERVICE_ROLE_KEY.*res\.json/);
  });

  it("EmailProvider exposes sendDirect for reuse (no second SMTP stack)", () => {
    assert.match(provider, /async sendDirect\(/);
    assert.match(provider, /this\.transport\.send/);
    assert.match(provider, /settingsRepository\.getSecure/);
  });

  it("browser client calls API and never embeds SMTP secrets", () => {
    assert.match(client, /testSendEmailTemplate/);
    assert.match(client, /\/email\/templates\/test-send/);
    assert.doesNotMatch(client, /smtpPassword|SmtpEmailTransport/);
  });
});
