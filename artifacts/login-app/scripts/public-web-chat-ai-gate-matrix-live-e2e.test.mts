/**
 * LOCAL ONLY — Public Web Chat live AI gate matrix (one gate off at a time).
 * Run: npx tsx --test scripts/public-web-chat-ai-gate-matrix-live-e2e.test.mts
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/;
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function loadLocalstackEnv(): Record<string, string> {
  const raw = readFileSync(resolve(projectRoot, ".env.localstack"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  try {
    const rootEnv = readFileSync(resolve(projectRoot, ".env"), "utf8");
    for (const line of rootEnv.split(/\r?\n/)) {
      const match = /^\s*(OPENAI_API_KEY)\s*=\s*(.*)\s*$/.exec(line);
      if (match && match[2] && !env.OPENAI_API_KEY) env.OPENAI_API_KEY = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (!LOCAL_URL.test(env[key] ?? "")) throw new Error(`Refusing to run: ${key} is not local`);
  }
  Object.assign(process.env, env, { NODE_ENV: "development", PUBLIC_WEB_CHAT_API_ENABLED: "true" });
  return env;
}

const env = loadLocalstackEnv();
const CO_B = "d0000010-0001-4001-8001-000000000002";
const ORIGIN = "https://shop.example.com";
const TAG = `wc-gate-${Date.now()}`;

const db = new pg.Client({ connectionString: LOCAL_DB_URL });

const created = {
  widgets: [] as Array<{ channelId: string; widgetId: string; publicKey: string }>,
  employees: [] as string[],
  connections: [] as string[],
  previousDefaults: [] as string[],
  featureOverrides: [] as string[],
  featureRestore: [] as Array<{ id: string; override_state: string; source: string }>,
};

async function enableManualFeature(companyId: string, featureCode: string): Promise<void> {
  const existing = await db.query(
    `select id, override_state, source from public.company_feature_overrides
     where company_id = $1 and feature_code = $2 and is_active = true order by created_at desc limit 1`,
    [companyId, featureCode],
  );
  if (existing.rows[0]) {
    created.featureRestore.push(existing.rows[0]);
    await db.query(
      `update public.company_feature_overrides set override_state = 'enabled', source = 'manual', reason = $2 where id = $1`,
      [existing.rows[0].id, TAG],
    );
    return;
  }
  const row = await db.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     values ($1, $2, 'enabled', 'manual', true, $3) returning id`,
    [companyId, featureCode, TAG],
  );
  created.featureOverrides.push(row.rows[0].id);
}

async function setFeature(companyId: string, featureCode: string, state: "enabled" | "disabled"): Promise<void> {
  await db.query(
    `update public.company_feature_overrides set override_state = $3, source = 'manual'
     where company_id = $1 and feature_code = $2 and is_active = true`,
    [companyId, featureCode, state],
  );
}

async function setPlatformAi(companyId: string, featureKey: string, enabled: boolean): Promise<void> {
  await db.query(
    `insert into public.platform_ai_feature_flags (company_id, feature_key, is_enabled)
     values ($1, $2, $3)
     on conflict (company_id, feature_key) do update set is_enabled = excluded.is_enabled`,
    [companyId, featureKey, enabled],
  );
}

describe("Public Web Chat live AI gate matrix", { concurrency: false }, () => {
  let harness: ChildProcess | null = null;
  let harnessBase = "";
  let baseUrl = "";
  let widget: { channelId: string; widgetId: string; publicKey: string };
  let employeeId = "";
  let convId = "";
  let session = { id: "", token: "" };
  let msgSeq = 0;

  const headers = (token?: string) => ({
    "content-type": "application/json",
    origin: ORIGIN,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  async function visitorSend(text: string) {
    msgSeq += 1;
    const id = `gate-msg-${String(msgSeq).padStart(4, "0")}`;
    const res = await fetch(`${baseUrl}/sessions/${session.id}/messages`, {
      method: "POST",
      headers: headers(session.token),
      body: JSON.stringify({ client_message_id: id, text }),
    });
    const body = (await res.json()) as { status?: string; error?: string };
    return { res, body };
  }

  async function succeededExecs() {
    const row = await db.query(
      `select count(*)::int as n from public.ai_executions
       where conversation_id = $1 and provider_key = 'openai' and status = 'succeeded'`,
      [convId],
    );
    return row.rows[0].n as number;
  }

  async function anyExecs() {
    const row = await db.query(
      `select count(*)::int as n from public.ai_executions where conversation_id = $1`,
      [convId],
    );
    return row.rows[0].n as number;
  }

  async function resetConversation() {
    await db.query(`update public.conversations set state = 'waiting_user' where id = $1`, [convId]);
    await db.query(`delete from public.handoff_conversation_ownership where conversation_id = $1`, [convId]);
    await fetch(`${harnessBase}/__harness/clear-runtime-cache`, { method: "POST" });
  }

  async function expectAiOn() {
    await resetConversation();
    const before = await succeededExecs();
    const send = await visitorSend("I need help with my order.");
    assert.equal(send.res.status, 200, JSON.stringify(send.body));
    const after = await succeededExecs();
    assert.ok(after > before, JSON.stringify({ send: send.body, before, after }));
  }

  async function expectAiOff(kind: "unavailable" | "no_success") {
    await resetConversation();
    const beforeSucc = await succeededExecs();
    const beforeAny = await anyExecs();
    const send = await visitorSend("I need help with my order.");
    if (kind === "unavailable") {
      assert.equal(send.res.status, 404, JSON.stringify(send.body));
      assert.equal(await anyExecs(), beforeAny);
    } else {
      assert.equal(send.res.status, 200, JSON.stringify(send.body));
      assert.ok(["accepted", "fallback", "handoff"].includes(String(send.body.status)), JSON.stringify(send.body));
    }
    assert.equal(await succeededExecs(), beforeSucc);
    const leak = await db.query(
      `select count(*)::int as n from public.ai_executions
       where conversation_id = $1 and company_id <> $2`,
      [convId, CO_B],
    );
    assert.equal(leak.rows[0].n, 0);
  }

  before(async () => {
    await db.connect();
    for (const code of ["web_chat_widget", "omnichannel", "ai_employee", "ai_assistant"]) {
      await enableManualFeature(CO_B, code);
    }
    await setPlatformAi(CO_B, "ai_chat", true);
    await setPlatformAi(CO_B, "tool_calling", true);

    const tools = JSON.stringify(["knowledge_search", "escalate_to_human"]);
    const employee = await db.query(
      `insert into public.ai_employees
        (company_id, name, display_name, status, provider, model, system_prompt, allowed_tool_keys, tags)
       values ($1, $2, 'Gate matrix employee', 'published', 'openai', 'gpt-4o-mini',
         'You are the web chat assistant.', $3::jsonb, '["channel:web_chat"]'::jsonb)
       returning id`,
      [CO_B, `${TAG}-emp`, tools],
    );
    employeeId = employee.rows[0].id;
    const version = await db.query(
      `insert into public.ai_employee_versions (company_id, employee_id, version_number, status, snapshot, publish_notes)
       values ($1, $2, 1, 'published', '{}'::jsonb, 'gate matrix') returning id`,
      [CO_B, employeeId],
    );
    await db.query(`update public.ai_employees set published_version_id = $1, current_version_number = 1 where id = $2`, [
      version.rows[0].id,
      employeeId,
    ]);
    created.employees.push(employeeId);

    const definition = await db.query(`select id from public.ai_provider_definitions where key = 'openai'`);
    const previous = await db.query(
      `select id from public.ai_provider_connections where company_id = $1 and is_default = true and deleted_at is null`,
      [CO_B],
    );
    created.previousDefaults = previous.rows.map((r: { id: string }) => r.id);
    await db.query(`update public.ai_provider_connections set is_default = false where company_id = $1 and deleted_at is null`, [
      CO_B,
    ]);
    const configuration = env.OPENAI_API_KEY?.trim()
      ? { model: "gpt-4o-mini", apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeoutMs: 45_000 }
      : {
          model: "gpt-4o-mini",
          apiKey: "local-openai-compat",
          baseUrl: "",
          maxRetries: 0,
          timeoutMs: 15_000,
        };
    harness = spawn(process.execPath, ["--import", "tsx/esm", "scripts/public-web-chat-local-harness.ts"], {
      cwd: resolve(projectRoot, "artifacts/api-server"),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    harnessBase = await new Promise<string>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error("harness start timeout")), 90_000);
      const chunks: string[] = [];
      const onChunk = (buf: Buffer) => {
        chunks.push(buf.toString());
        const match = /WEB_CHAT_HARNESS_READY (\d+)/.exec(chunks.join(""));
        if (match) {
          clearTimeout(timer);
          resolveReady(`http://127.0.0.1:${match[1]}`);
        }
      };
      harness!.stdout?.on("data", onChunk);
      harness!.stderr?.on("data", onChunk);
      harness!.on("exit", (code) => reject(new Error(`harness exited ${code}`)));
    });
    if (!env.OPENAI_API_KEY?.trim()) {
      configuration.baseUrl = `${harnessBase}/__openai/v1`;
    }
    const conn = await db.query(
      `insert into public.ai_provider_connections
        (company_id, provider_id, display_name, status, configuration, is_default, is_enabled, health_status, uses_platform_key)
       values ($1, $2, $3, 'active', $4::jsonb, true, true, 'connected', false) returning id`,
      [CO_B, definition.rows[0].id, `gate ${TAG}`, JSON.stringify(configuration)],
    );
    created.connections.push(conn.rows[0].id);

    const channel = await db.query(
      `insert into public.company_channels (company_id, channel_id, display_name, provider)
       select $1, id, 'Gate matrix widget', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
       returning id`,
      [CO_B],
    );
    const widgetRow = await db.query(
      `insert into public.web_chat_widgets
        (company_id, company_channel_id, name, enabled, allowed_origins, greeting, ai_employee_id, config)
       values ($1, $2, 'Gate matrix', true, $3, 'Hi', $4, $5::jsonb)
       returning id, public_key`,
      [
        CO_B,
        channel.rows[0].id,
        [ORIGIN],
        employeeId,
        JSON.stringify({ aiEnabled: true, handoffOnAiFailure: false }),
      ],
    );
    widget = { channelId: channel.rows[0].id, widgetId: widgetRow.rows[0].id, publicKey: widgetRow.rows[0].public_key };
    created.widgets.push(widget);
    baseUrl = `${harnessBase}/api/public/web-chat`;

    const createdSession = await fetch(`${baseUrl}/${widget.publicKey}/sessions`, {
      method: "POST",
      headers: headers(),
      body: "{}",
    });
    assert.ok(createdSession.status === 200 || createdSession.status === 201, `session ${createdSession.status}`);
    const body = (await createdSession.json()) as { session: { id: string }; visitorToken: string };
    session = { id: body.session.id, token: body.visitorToken };
    const first = await visitorSend("I need help with my order.");
    assert.equal(first.res.status, 200, JSON.stringify(first.body));
    const conv = await db.query(
      `select id from public.conversations where company_channel_id = $1 order by created_at desc limit 1`,
      [widget.channelId],
    );
    convId = conv.rows[0].id;
    assert.ok((await succeededExecs()) >= 1);
  });

  after(async () => {
    harness?.kill("SIGTERM");
    await db.query("begin");
    await db.query("set local session_replication_role = replica");
    for (const w of created.widgets) {
      await db.query(
        `delete from public.web_chat_message_submissions where session_id in (select id from public.web_chat_visitor_sessions where widget_id = $1)`,
        [w.widgetId],
      );
      await db.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [w.widgetId]);
      await db.query(`delete from public.conversations where company_channel_id = $1`, [w.channelId]);
      await db.query(`delete from public.web_chat_widgets where id = $1`, [w.widgetId]);
      await db.query(`delete from public.company_channels where id = $1`, [w.channelId]);
    }
    if (created.featureOverrides.length) {
      await db.query(`delete from public.company_feature_overrides where id = any($1::uuid[])`, [created.featureOverrides]);
    }
    for (const row of created.featureRestore) {
      await db.query(`update public.company_feature_overrides set override_state = $2, source = $3 where id = $1`, [
        row.id,
        row.override_state,
        row.source,
      ]);
    }
    for (const id of created.employees) {
      await db.query(`delete from public.ai_employee_versions where employee_id = $1`, [id]);
      await db.query(`delete from public.ai_employees where id = $1`, [id]);
    }
    for (const id of created.connections) {
      await db.query(`delete from public.ai_provider_connections where id = $1`, [id]);
    }
    for (const id of created.previousDefaults) {
      await db.query(`update public.ai_provider_connections set is_default = true where id = $1`, [id]);
    }
    await setPlatformAi(CO_B, "ai_chat", true);
    await db.query("commit");
    await db.end();
  });

  it("ALL ON baseline already produced openai succeeded", async () => {
    assert.ok((await succeededExecs()) >= 1);
  });

  it("unpublished AI Employee → no AI; republish → AI", async () => {
    await db.query(`update public.ai_employees set status = 'draft' where id = $1`, [employeeId]);
    await expectAiOff("no_success");
    await db.query(`update public.ai_employees set status = 'published' where id = $1`, [employeeId]);
    await expectAiOn();
  });

  it("web_chat_widget entitlement off → unavailable; on → AI", async () => {
    await setFeature(CO_B, "web_chat_widget", "disabled");
    await expectAiOff("unavailable");
    await setFeature(CO_B, "web_chat_widget", "enabled");
    await expectAiOn();
  });

  it("widget disabled → unavailable; enabled → AI", async () => {
    await db.query(`update public.web_chat_widgets set enabled = false where id = $1`, [widget.widgetId]);
    await expectAiOff("unavailable");
    await db.query(`update public.web_chat_widgets set enabled = true where id = $1`, [widget.widgetId]);
    await expectAiOn();
  });

  it("aiEnabled false → no AI; true → AI", async () => {
    await db.query(`update public.web_chat_widgets set config = jsonb_set(config, '{aiEnabled}', 'false'::jsonb) where id = $1`, [
      widget.widgetId,
    ]);
    await expectAiOff("no_success");
    await db.query(`update public.web_chat_widgets set config = jsonb_set(config, '{aiEnabled}', 'true'::jsonb) where id = $1`, [
      widget.widgetId,
    ]);
    await expectAiOn();
  });

  it("ai_employee_id null → no AI; restored → AI", async () => {
    await db.query(`update public.web_chat_widgets set ai_employee_id = null where id = $1`, [widget.widgetId]);
    await expectAiOff("no_success");
    await db.query(`update public.web_chat_widgets set ai_employee_id = $2 where id = $1`, [widget.widgetId, employeeId]);
    await expectAiOn();
  });

  it("ai_assistant commercial off → no succeeded exec; on → AI", async () => {
    await setFeature(CO_B, "ai_assistant", "disabled");
    await expectAiOff("no_success");
    await setFeature(CO_B, "ai_assistant", "enabled");
    await expectAiOn();
  });

  it("platform ai_chat OFF → no succeeded exec; ON → AI", async () => {
    await setPlatformAi(CO_B, "ai_chat", false);
    await fetch(`${harnessBase}/__harness/clear-runtime-cache`, { method: "POST" });
    await expectAiOff("no_success");
    await setPlatformAi(CO_B, "ai_chat", true);
    await fetch(`${harnessBase}/__harness/clear-runtime-cache`, { method: "POST" });
    await expectAiOn();
  });

  it("WEBHOOK_EXECUTE_AI / executeAi off → no AI; on → AI", async () => {
    await fetch(`${harnessBase}/__harness/execute-ai?enabled=false`, { method: "POST" });
    await expectAiOff("no_success");
    await fetch(`${harnessBase}/__harness/execute-ai?enabled=true`, { method: "POST" });
    await expectAiOn();
  });
});
