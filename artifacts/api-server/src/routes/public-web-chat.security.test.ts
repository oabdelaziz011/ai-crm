import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = resolve(here, "..");
const projectRoot = resolve(apiSrc, "../../..");
const read = (rel: string) => readFileSync(resolve(apiSrc, rel), "utf8");
const readRoot = (rel: string) => readFileSync(resolve(projectRoot, rel), "utf8");

const serviceDir = resolve(apiSrc, "services/public-web-chat");
const serviceSources = readdirSync(serviceDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, src: readFileSync(join(serviceDir, f), "utf8") }));
const routerSources = [
  { file: "public-web-chat.ts", src: read("routes/public-web-chat.ts") },
  { file: "public-web-chat-router.ts", src: read("routes/public-web-chat-router.ts") },
];
const publicSources = [...serviceSources, ...routerSources];
const m400 = readRoot("supabase/migrations/400_web_chat_public_backend.sql");
const m402 = readRoot("supabase/migrations/402_web_chat_shared_rate_limit.sql");
const m434 = readRoot("supabase/migrations/434_web_widget_enable_restores_channel.sql");

describe("Public Web Chat — mount + auth chain", () => {
  it("mounted at /api/public/web-chat before the session middleware and the authenticated /api router", () => {
    const app = read("app.ts");
    const mount = app.indexOf("app.use(PUBLIC_WEB_CHAT_ROUTE_PREFIX, publicWebChatRouter)");
    assert.ok(mount > 0);
    assert.ok(mount < app.indexOf("session({"));
    assert.ok(mount < app.indexOf('app.use("/api", router)'));
    assert.ok(mount > app.indexOf("app.use(globalRateLimiter)"));
    assert.match(read("services/public-web-chat/public-web-chat-config.ts"), /"\/api\/public\/web-chat"/);
  });

  it("public code never uses dashboard auth, sessions or user JWTs", () => {
    for (const { file, src } of publicSources) {
      assert.doesNotMatch(src, /requireSupabaseAuth|supabase-auth|req\.session|getUser\(/, file);
    }
  });

  it("dashboard CORS excludes the public prefix; public CORS never uses '*' or credentials", () => {
    const cors = read("middleware/cors.ts");
    assert.match(cors, /if \(isPublicWebChatPath\(path\)\) return false;/);
    for (const { file, src } of publicSources) {
      assert.doesNotMatch(src, /Allow-Origin",\s*"\*"|Allow-Credentials/i, file);
    }
  });
});

describe("Public Web Chat — tenant resolution is server-side only", () => {
  it("never reads company/channel/conversation/employee/customer ids from the request", () => {
    for (const { file, src } of publicSources) {
      assert.doesNotMatch(
        src,
        /body\.(company_id|companyId|company_channel_id|conversation_id|conversationId|ai_employee_id|customer_id)|query\.(company|conversation|customer)/,
        file,
      );
    }
  });

  it("messages route through ChannelRouter.routeInbound with SYSTEM_CONTEXT", () => {
    const inbound = read("services/public-web-chat/public-web-chat-inbound-port.ts");
    assert.match(inbound, /router\.routeInbound\(deps\.systemContext/);
    assert.match(inbound, /channelKey: "web_chat"/);
    assert.match(read("routes/public-web-chat.ts"), /systemContext: SYSTEM_CONTEXT/);
  });

  it("shared Postgres rate-limit store is the production default; in-memory remains labelled DEVELOPMENT / LOCAL ONLY", () => {
    assert.match(read("services/public-web-chat/public-web-chat-rate-limit.ts"), /DEVELOPMENT \/ LOCAL ONLY/);
    assert.match(read("routes/public-web-chat.ts"), /createSupabaseWebChatRateLimitStore\(platform\.client\)/);
    assert.doesNotMatch(read("routes/public-web-chat.ts"), /createInMemoryWebChatRateLimitStore\(\)/);
  });

  it("webhook platform wires the public tool guard + employee tool policy", () => {
    const platform = read("platform/create-webhook-platform.ts");
    assert.match(platform, /createPublicWebChatToolGuard\(/);
    assert.match(platform, /withPublicWebChatEmployeeToolPolicy\(/);
  });
});

describe("Public Web Chat — migration 400 contracts", () => {
  it("public RPCs are service_role only (no anon / authenticated execute)", () => {
    assert.match(m400, /revoke all on function %s from public, anon, authenticated/i);
    assert.match(m400, /grant execute on function %s to service_role/i);
    assert.doesNotMatch(m400, /grant [^;]*execute[^;]* to [^;]*\b(anon|authenticated)\b/i);
  });

  it("ensure_conversation is row-locked and never creates leads/customers", () => {
    assert.match(m400, /for update/);
    assert.doesNotMatch(m400, /insert into public\.(leads|customers|customer_contacts)/i);
    assert.match(m400, /'channelIdentityStatus', 'anonymous_visitor'/);
  });

  it("visitor read excludes internal notes, system messages, failed outgoing and non-text content", () => {
    assert.match(m400, /cm\.message_type in \('incoming', 'outgoing'\)/);
    assert.match(m400, /cm\.content_type = 'text'/);
    assert.match(m400, /not \(cm\.message_type = 'outgoing' and cm\.status = 'failed'\)/);
  });

  it("idempotency ledger is unique per session + client_message_id", () => {
    assert.match(m400, /unique \(session_id, client_message_id\)/);
  });

  it("does not touch Meta / Email / SMS tables or the commercial mapping for web_chat", () => {
    assert.doesNotMatch(m400, /company_(whatsapp|email|messenger|instagram|sms)_settings|graph\.facebook/i);
    assert.doesNotMatch(m400, /create or replace function internal\.resolve_channel_commercial_feature_code/);
  });
});

describe("Public Web Chat — migration 434 widget enable restores its channel", () => {
  it("clears deletion only when the widget is enabled, and only on the widget channel", () => {
    assert.match(m434, /provider = 'valueor\.web_widget'/);
    assert.match(m434, /deleted_at = case when new\.enabled then null else cc\.deleted_at end/);
    assert.match(m434, /new\.enabled and cc\.deleted_at is not null/);
    assert.match(m434, /v_channel_deleted is not null and not new\.enabled/);
    assert.doesNotMatch(m434, /grant |anon|authenticated/i);
  });
});

describe("Public Web Chat — migration 402 shared rate limit", () => {
  it("consume RPC is service_role only and never granted to anon", () => {
    assert.match(m402, /web_chat_rate_limit_consume/);
    assert.match(m402, /revoke all on function public\.web_chat_rate_limit_consume/i);
    assert.match(m402, /grant execute on function public\.web_chat_rate_limit_consume\(text, integer, integer\) to service_role/i);
    assert.doesNotMatch(m402, /grant [^;]*execute[^;]*web_chat_rate_limit_consume[^;]* to [^;]*\b(anon|authenticated)\b/i);
  });
});
