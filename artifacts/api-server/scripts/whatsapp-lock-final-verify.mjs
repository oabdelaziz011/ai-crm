/**
 * Final local WhatsApp verification after the shared conversation lease.
 * Two HTTP processes run the real inbound pipeline with the Postgres lease and a fake adapter.
 * Recovery uses a rolled-back fixture set and never calls the unscoped preparing/dispatching scanner.
 * Does not call Meta, does not print secrets, and does not commit or deploy.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createContext, createTestEnvironment } from "../../../lib/channel-platform/src/test-utils.ts";
import { createSupabaseWhatsAppConversationTurnLock } from "../../../lib/channel-platform/src/services/whatsapp-conversation-turn-lock.ts";
import {
  planStuckWhatsAppReplyRecovery,
  toStuckWhatsAppReply,
} from "../../../lib/channel-platform/src/services/reconcile-stuck-whatsapp-replies.ts";
import { recoverGeneratedReply } from "../../../lib/channel-platform/src/services/recover-generated-reply.ts";
import {
  isWhatsAppReplyRecoveryWorkerEnabled,
  startWhatsAppReplyRecoveryWorker,
} from "../../../lib/channel-platform/src/workers/whatsapp-reply-recovery-worker.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const requireDb = createRequire(path.join(repoRoot, "lib/db/package.json"));
const requireApi = createRequire(path.join(repoRoot, "artifacts/api-server/package.json"));
const pg = requireDb("pg");
const { createClient } = requireApi("@supabase/supabase-js");

function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/sb_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 300);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return redact(`${message}${error?.code ? ` code=${error.code}` : ""}`);
}

function readLocalEnv() {
  const text = fs.readFileSync(path.join(repoRoot, ".env.localstack"), "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    values[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  const databaseUrl = new URL(values.DATABASE_URL ?? "");
  const supabaseUrl = new URL(values.SUPABASE_URL ?? "");
  if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.port !== "54322") {
    throw new Error(`Refusing DATABASE_URL host ${databaseUrl.hostname}:${databaseUrl.port}`);
  }
  if (supabaseUrl.hostname !== "127.0.0.1" || supabaseUrl.port !== "54321") {
    throw new Error(`Refusing SUPABASE_URL host ${supabaseUrl.hostname}:${supabaseUrl.port}`);
  }
  if (!values.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service role key");
  return {
    databaseUrl: values.DATABASE_URL,
    supabaseUrl: supabaseUrl.origin,
    serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function blockExternalFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(raw).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error("blocked_external_fetch");
    }
    return original(raw, init);
  };
}

async function withPg(run) {
  const { databaseUrl } = readLocalEnv();
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    query_timeout: 20000,
  });
  await client.connect();
  const identity = await client.query(
    "select inet_server_addr()::text as addr, inet_server_port()::int as port",
  );
  const addr = String(identity.rows[0].addr ?? "");
  const port = Number(identity.rows[0].port);
  const local =
    !addr ||
    addr.startsWith("127.") ||
    addr.startsWith("10.") ||
    addr.startsWith("192.168.") ||
    addr.startsWith("172.");
  if (!local || (port !== 5432 && port !== 54322)) {
    await client.end();
    throw new Error(`Refusing Postgres ${addr}:${port}`);
  }
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function localSupabase() {
  const env = readLocalEnv();
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function overlaps(left, right) {
  if (!left || !right) return false;
  return left.start < right.end && right.start < left.end;
}

async function serverMain() {
  blockExternalFetch();
  const [, , , portRaw, conversationId, companyId, companyChannelId] = process.argv;
  const port = Number(portRaw);
  const supabase = localSupabase();
  const holds = [];
  let activeHold = null;
  const inner = createSupabaseWhatsAppConversationTurnLock(supabase);
  const lock = {
    async acquire(input) {
      const ok = await inner.acquire(input);
      if (ok) activeHold = { start: Date.now(), end: 0 };
      return ok;
    },
    renew: (input) => inner.renew(input),
    async release(input) {
      const ok = await inner.release(input);
      if (activeHold) {
        activeHold.end = Date.now();
        holds.push(activeHold);
        activeHold = null;
      }
      return ok;
    },
  };
  const adapter = {
    channelKey: "whatsapp",
    sendCalls: 0,
    parseWebhook() {
      throw new Error("not used");
    },
    normalizeInbound(_ctx, payload) {
      return {
        externalThreadId: String(payload.externalThreadId ?? "15550000001"),
        externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
        senderExternalId: "15550000001",
        text: String(payload.text ?? ""),
        attachments: [],
        metadata: {},
      };
    },
    formatOutbound(_ctx, message) {
      return { to: message.externalThreadId, text: message.text };
    },
    async sendOutbound() {
      this.sendCalls += 1;
      return { externalMessageId: `wamid.fake.${this.sendCalls}`, providerResponse: { fake: true } };
    },
  };
  let holdMs = 0;
  const env = createTestEnvironment({
    adapters: [adapter],
    companyChannel: {
      id: companyChannelId,
      companyId,
      channelKey: "whatsapp",
      provider: "fake",
    },
    conversationId,
    sharedTurnLock: lock,
    runtimeHold: async () => {
      if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
    },
  });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/shutdown") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        server.close();
        return;
      }
      if (req.method !== "POST" || req.url !== "/webhook") {
        res.writeHead(404);
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const idempotencyKey = String(body.idempotencyKey);
      const inserted = await supabase.from("channel_inbound_events").insert({
        company_id: companyId,
        company_channel_id: companyChannelId,
        channel_key: "whatsapp",
        idempotency_key: idempotencyKey,
        external_thread_id: "15550000001",
        external_message_id: idempotencyKey,
        payload: { verify: "wa-lock-final" },
      }).select("id");
      if (inserted.error) {
        if (inserted.error.code === "23505") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ duplicate: true, sendCalls: 0, runtimeCalls: 0, holds: [] }));
          return;
        }
        throw new Error(safeError(inserted.error.message ?? "inbound_insert_failed"));
      }
      holdMs = Number(body.holdMs ?? 0);
      const beforeSends = adapter.sendCalls;
      const beforeRuntime = env.runtimeCalls;
      const holdCursor = holds.length;
      const result = await env.router.routeInbound(createContext({ companyId, isSuperAdmin: true }), {
        companyId,
        companyChannelId,
        channelKey: "whatsapp",
        source: "webhook",
        idempotencyKey,
        externalThreadId: "15550000001",
        externalMessageId: idempotencyKey,
        payload: {
          text: String(body.text ?? "عايز احجز"),
          externalThreadId: "15550000001",
          externalMessageId: idempotencyKey,
          senderExternalId: "15550000001",
        },
        executeAi: true,
        aiAssistantId: "assistant-1",
        runtimeConfig: { providerConnectionId: "provider-1" },
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        duplicate: result.duplicate === true,
        outboundError: result.outboundError ?? null,
        sendCalls: adapter.sendCalls - beforeSends,
        runtimeCalls: env.runtimeCalls - beforeRuntime,
        holds: holds.slice(holdCursor),
      }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: safeError(error), sendCalls: adapter.sendCalls }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function workerMain() {
  const statePath = process.argv[3];
  if (!isWhatsAppReplyRecoveryWorkerEnabled()) process.exit(2);
  const handle = startWhatsAppReplyRecoveryWorker({
    intervalMs: 40,
    listStuck: async () => {
      const state = readJson(statePath);
      state.listCalls += 1;
      writeJson(statePath, state);
      return state.rows;
    },
    confirm: async () => {
      const state = readJson(statePath);
      state.confirmCalls += 1;
      writeJson(statePath, state);
    },
    save: async (decision) => {
      const state = readJson(statePath);
      const row = state.rows.find((item) => item.messageId === decision.messageId);
      if (row && !row.recoveryDisposition) {
        row.recoveryDisposition = decision.disposition;
        row.recoveryAttempts = decision.attempts;
      }
      writeJson(statePath, state);
    },
  });
  if (!handle) process.exit(3);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  handle.stop();
  process.exit(0);
}

async function claimIdempotency(supabase, companyId, companyChannelId, idempotencyKey) {
  const inserted = await supabase.from("channel_inbound_events").insert({
    company_id: companyId,
    company_channel_id: companyChannelId,
    channel_key: "whatsapp",
    idempotency_key: idempotencyKey,
    external_thread_id: "15550000001",
    external_message_id: idempotencyKey,
    payload: { verify: "wa-lock-final" },
  }).select("id");
  return inserted;
}

function pickDelivery(rows) {
  const accepted = rows.find((row) => ["sent", "delivered", "read"].includes(String(row.delivery_status ?? "").toLowerCase()));
  if (accepted) return accepted;
  return rows.find((row) => String(row.delivery_status ?? "").toLowerCase() === "pending") ?? rows[0] ?? null;
}

async function loadFixtureRows(client, fixtureIds) {
  const rows = await client.query(
    `select id, content, metadata, created_at, conversation_id
     from public.conversation_messages
     where id = any($1::uuid[])
       and message_type = 'outgoing'
       and metadata->>'outboundPhase' in ('preparing', 'dispatching')
     order by created_at asc`,
    [fixtureIds],
  );
  const stuck = [];
  for (const row of rows.rows) {
    const deliveries = await client.query(
      `select delivery_status, external_message_id
       from public.channel_delivery_events
       where outbound_message_id = $1
       order by created_at desc
       limit 5`,
      [row.id],
    );
    const newer = await client.query(
      `select id from public.conversation_messages
       where conversation_id = $1 and message_type = 'incoming' and created_at > $2
       limit 1`,
      [row.conversation_id, row.created_at],
    );
    const chosen = pickDelivery(deliveries.rows);
    stuck.push(toStuckWhatsAppReply({
      id: row.id,
      content: row.content,
      createdAt: row.created_at.toISOString(),
      metadata: row.metadata,
      deliveryStatus: chosen?.delivery_status ?? null,
      externalMessageId: chosen?.external_message_id ?? null,
      hasNewerInbound: newer.rows.length > 0,
      nowMs: Date.now(),
    }));
  }
  return stuck;
}

async function saveDecision(client, decision) {
  const current = await client.query("select metadata from public.conversation_messages where id = $1", [decision.messageId]);
  const metadata = {
    ...(current.rows[0]?.metadata ?? {}),
    whatsappRecoveryDisposition: decision.disposition,
    whatsappRecoveryAttempts: decision.attempts,
  };
  await client.query("update public.conversation_messages set metadata = $2::jsonb where id = $1", [
    decision.messageId,
    JSON.stringify(metadata),
  ]);
}

async function runRecoveryTransaction(client) {
  const report = { rolledBack: false, sendCalls: 0, cases: [], secondTick: [], leaseStillOwned: false };
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    const channel = await client.query("select id from public.communication_channels where key = 'whatsapp' limit 1");
    if (!channel.rows[0]) throw new Error("Local catalog has no whatsapp channel");
    const company = await client.query(
      "insert into public.companies (name) values ($1) returning id",
      [`wa-lock-final-recovery-${randomUUID()}`],
    );
    const companyId = company.rows[0].id;
    const assistant = await client.query("select id from public.ai_assistant_settings where company_id = $1", [companyId]);
    const assistantId = assistant.rows[0].id;
    const companyChannel = await client.query(
      `insert into public.company_channels (company_id, channel_id, display_name, provider, status, is_enabled)
       values ($1, $2, 'lock-final-whatsapp', 'fake', 'active', false)
       returning id`,
      [companyId, channel.rows[0].id],
    );
    const specs = [
      { key: "confirmed", phase: "preparing", content: "verify-reply", delivery: "sent", newer: false },
      { key: "pending", phase: "dispatching", content: "verify-reply", delivery: "pending", newer: false },
      { key: "missing_delivery", phase: "preparing", content: "verify-reply", delivery: null, newer: false },
      { key: "missing_text", phase: "preparing", content: "", delivery: null, newer: false },
      { key: "newer_inbound", phase: "preparing", content: "verify-reply", delivery: null, newer: true },
      { key: "accepted_then_crashed", phase: "preparing", content: "verify-reply", delivery: null, newer: false },
    ];
    const fixtureIds = [];
    const keys = {};
    for (const spec of specs) {
      const conversation = await client.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, state)
         values ($1, $2, 'whatsapp', 'idle') returning id`,
        [companyId, assistantId],
      );
      const message = await client.query(
        `insert into public.conversation_messages
           (conversation_id, message_type, content, status, metadata, created_at)
         values ($1, 'outgoing', $2, 'pending', $3::jsonb, now() - interval '10 minutes')
         returning id`,
        [
          conversation.rows[0].id,
          spec.content,
          JSON.stringify({
            outboundPhase: spec.phase,
            runtimeExecutionId: `verify-${spec.key}`,
            whatsappLockFinal: true,
          }),
        ],
      );
      fixtureIds.push(message.rows[0].id);
      keys[message.rows[0].id] = spec.key;
      if (spec.delivery) {
        await client.query(
          `insert into public.channel_delivery_events
             (company_id, company_channel_id, channel_key, conversation_id, outbound_message_id,
              external_thread_id, external_message_id, delivery_status)
           values ($1, $2, 'whatsapp', $3, $4, $5, $6, $7)`,
          [
            companyId,
            companyChannel.rows[0].id,
            conversation.rows[0].id,
            message.rows[0].id,
            `thread-${spec.key}`,
            `wamid.final.${spec.key}`,
            spec.delivery,
          ],
        );
      }
      if (spec.newer) {
        await client.query(
          `insert into public.conversation_messages (conversation_id, message_type, content, created_at)
           values ($1, 'incoming', 'customer-newer', now() - interval '9 minutes')`,
          [conversation.rows[0].id],
        );
      }
    }
    const leaseConversation = (
      await client.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, state)
         values ($1, $2, 'whatsapp', 'idle') returning id`,
        [companyId, assistantId],
      )
    ).rows[0].id;
    const owned = await client.query(
      "select public.acquire_whatsapp_conversation_turn($1::uuid, $2, $3) as ok",
      [leaseConversation, `owner-${randomUUID()}`, 120000],
    );
    let confirmCalls = 0;
    const decisions = await planStuckWhatsAppReplyRecovery(await loadFixtureRows(client, fixtureIds), async (input) => {
      confirmCalls += 1;
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("select public.confirm_conversation_message_outbound($1::uuid, $2, $3)", [
        input.messageId,
        input.status,
        input.externalMessageId ?? null,
      ]);
    });
    for (const decision of decisions) {
      if (!fixtureIds.includes(decision.messageId)) throw new Error("decision outside fixture set");
      if (decision.persisted) await saveDecision(client, decision);
    }
    const still = await client.query(
      "select owner_token from public.whatsapp_conversation_turn_leases where conversation_id = $1",
      [leaseConversation],
    );
    report.leaseStillOwned = Boolean(still.rows[0]?.owner_token);
    report.confirmCalls = confirmCalls;
    const stored = await client.query(
      "select id, status, metadata from public.conversation_messages where id = any($1::uuid[])",
      [fixtureIds],
    );
    report.cases = stored.rows.map((row) => {
      const decision = decisions.find((item) => item.messageId === row.id);
      return {
        key: keys[row.id],
        status: row.status,
        outboundPhase: row.metadata?.outboundPhase ?? null,
        disposition: row.metadata?.whatsappRecoveryDisposition ?? null,
        action: decision?.outcome.action ?? null,
        reason: decision?.outcome.reason ?? null,
      };
    });
    let secondConfirm = 0;
    const second = await planStuckWhatsAppReplyRecovery(await loadFixtureRows(client, fixtureIds), async () => {
      secondConfirm += 1;
      throw new Error("second tick must not confirm");
    });
    report.secondTick = second.map((decision) => ({
      key: keys[decision.messageId],
      disposition: decision.disposition,
      persisted: decision.persisted,
      reason: decision.outcome.reason ?? null,
    }));
    report.secondConfirmCalls = secondConfirm;
    const crashed = report.cases.find((item) => item.key === "accepted_then_crashed");
    const replay = await recoverGeneratedReply({
      replyText: "verify-reply",
      outboundPhase: crashed?.outboundPhase,
      deliveryStatus: null,
      hasNewerInbound: false,
      messageId: fixtureIds[5],
    });
    report.restartWithoutDelivery = replay;
    await client.query("rollback");
    report.rolledBack = true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    report.rolledBack = true;
    report.error = safeError(error);
  }
  return report;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: redact(text) };
  }
  return { status: response.status, body: parsed };
}

function spawnServer(port, conversationId, companyId, companyChannelId) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      fileURLToPath(import.meta.url),
      "server",
      String(port),
      conversationId,
      companyId,
      companyChannelId,
    ],
    { cwd: path.join(repoRoot, "lib/channel-platform"), env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout.on("data", () => undefined);
  return { child, readError: () => redact(stderr) };
}

async function waitHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Process is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server ${port} did not become healthy`);
}

async function runTwoServers(client) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
  const channel = await client.query("select id from public.communication_channels where key = 'whatsapp' limit 1");
  const company = await client.query(
    "insert into public.companies (name) values ($1) returning id",
    [`wa-lock-final-${randomUUID()}`],
  );
  const companyId = company.rows[0].id;
  const companyChannel = await client.query(
    `insert into public.company_channels (company_id, channel_id, display_name, provider, status, is_enabled)
     values ($1, $2, 'lock-final-live', 'fake', 'active', false) returning id`,
    [companyId, channel.rows[0].id],
  );
  const conversationId = randomUUID();
  const companyChannelId = companyChannel.rows[0].id;
  const servers = [
    spawnServer(18771, conversationId, companyId, companyChannelId),
    spawnServer(18772, conversationId, companyId, companyChannelId),
  ];
  const exits = servers.map(({ child }) => new Promise((resolve) => child.on("exit", resolve)));
  const report = {
    productionApiServerStarted: false,
    reason: "The production API process uses the Meta WhatsApp adapter and an unscoped recovery loader.",
    servers: "two local HTTP processes",
  };
  try {
    await Promise.all([waitHealth(18771), waitHealth(18772)]);
    const sameKey = `wamid.final.same.${randomUUID()}`;
    let maxLeaseRows = 0;
    const pollClient = new pg.Client({
      connectionString: readLocalEnv().databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    await pollClient.connect();
    const poll = setInterval(() => {
      void pollClient
        .query("select count(*)::int as n from public.whatsapp_conversation_turn_leases where conversation_id = $1", [
          conversationId,
        ])
        .then((rows) => {
          maxLeaseRows = Math.max(maxLeaseRows, rows.rows[0].n);
        })
        .catch(() => undefined);
    }, 40);
    const same = await Promise.all([
      postJson("http://127.0.0.1:18771/webhook", { idempotencyKey: sameKey, holdMs: 700 }),
      postJson("http://127.0.0.1:18772/webhook", { idempotencyKey: sameKey, holdMs: 700 }),
    ]);
    clearInterval(poll);
    await pollClient.end().catch(() => undefined);
    const sameSends = same.reduce((sum, item) => sum + Number(item.body?.sendCalls ?? 0), 0);
    const sameDuplicates = same.filter((item) => item.body?.duplicate === true).length;
    report.sameWebhook = {
      statuses: same.map((item) => item.status),
      sendCalls: sameSends,
      duplicates: sameDuplicates,
      runtimeCalls: same.reduce((sum, item) => sum + Number(item.body?.runtimeCalls ?? 0), 0),
      maxLeaseRows,
      errors: same.map((item) => item.body?.error ?? item.body?.outboundError ?? null),
    };
    const left = `wamid.final.left.${randomUUID()}`;
    const right = `wamid.final.right.${randomUUID()}`;
    const both = await Promise.all([
      postJson("http://127.0.0.1:18771/webhook", { idempotencyKey: left, holdMs: 500 }),
      postJson("http://127.0.0.1:18772/webhook", { idempotencyKey: right, holdMs: 500 }),
    ]);
    const holdA = both[0].body?.holds?.[0] ?? null;
    const holdB = both[1].body?.holds?.[0] ?? null;
    report.twoMessages = {
      statuses: both.map((item) => item.status),
      sendCalls: both.reduce((sum, item) => sum + Number(item.body?.sendCalls ?? 0), 0),
      runtimeCalls: both.reduce((sum, item) => sum + Number(item.body?.runtimeCalls ?? 0), 0),
      holdsOverlap: overlaps(holdA, holdB),
      errors: both.map((item) => item.body?.error ?? item.body?.outboundError ?? null),
    };
  } catch (error) {
    report.error = safeError(error);
    report.serverErrors = servers.map((server) => server.readError());
  } finally {
    await Promise.all(
      [18771, 18772].map((port) =>
        fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST", signal: AbortSignal.timeout(2000) }).catch(() => undefined),
      ),
    );
    await Promise.race([
      Promise.all(exits),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    for (const server of servers) {
      if (server.child.exitCode === null) server.child.kill("SIGTERM");
    }
    await client.query("delete from public.channel_inbound_events where company_id = $1", [companyId]).catch(() => undefined);
    await client.query("delete from public.whatsapp_conversation_turn_leases where conversation_id = $1", [conversationId]).catch(() => undefined);
    await client.query("set session_replication_role = replica");
    try {
      await client.query("delete from public.companies where id = $1 and name like 'wa-lock-final-%'", [companyId]);
    } finally {
      await client.query("set session_replication_role = origin");
    }
  }
  return report;
}

async function runFailClosed() {
  const adapter = {
    channelKey: "whatsapp",
    sendCalls: 0,
    parseWebhook() {
      throw new Error("not used");
    },
    normalizeInbound(_ctx, payload) {
      return {
        externalThreadId: "15550000001",
        externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
        senderExternalId: "15550000001",
        text: String(payload.text ?? ""),
        attachments: [],
        metadata: {},
      };
    },
    formatOutbound(_ctx, message) {
      return { to: message.externalThreadId, text: message.text };
    },
    async sendOutbound() {
      this.sendCalls += 1;
      return { externalMessageId: "wamid.fake", providerResponse: { fake: true } };
    },
  };
  async function once(lock, idempotencyKey) {
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
      sharedTurnLock: lock,
    });
    let thrown = null;
    let outboundError = null;
    let duplicate = false;
    try {
      const result = await env.router.routeInbound(createContext(), {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        channelKey: "whatsapp",
        source: "webhook",
        idempotencyKey,
        externalThreadId: "15550000001",
        externalMessageId: idempotencyKey,
        payload: {
          text: "عايز احجز",
          externalThreadId: "15550000001",
          externalMessageId: idempotencyKey,
          senderExternalId: "15550000001",
        },
        executeAi: true,
        aiAssistantId: "assistant-1",
        runtimeConfig: { providerConnectionId: "provider-1" },
      });
      outboundError = result.outboundError ?? null;
      duplicate = result.duplicate === true;
    } catch (error) {
      thrown = error instanceof Error ? error.message : "error";
    }
    return { thrown, outboundError, duplicate, runtimeCalls: env.runtimeCalls, sendCalls: adapter.sendCalls };
  }
  const downClient = createClient("http://127.0.0.1:9", "local-verify-not-a-secret", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (_url, init) => fetch("http://127.0.0.1:9", { ...init, signal: AbortSignal.timeout(1500) }),
    },
  });
  const before = adapter.sendCalls;
  const postgresDown = await once(createSupabaseWhatsAppConversationTurnLock(downClient), `wamid.down.${randomUUID()}`);
  const acquireFailed = await once(
    {
      acquire: async () => {
        throw new Error("conversation_turn_lock_unavailable");
      },
      renew: async () => false,
      release: async () => false,
    },
    `wamid.acquire.${randomUUID()}`,
  );
  const lost = await once(
    {
      acquire: async () => true,
      renew: async () => false,
      release: async () => false,
    },
    `wamid.lost.${randomUUID()}`,
  );
  return {
    sendCalls: adapter.sendCalls - before,
    postgresDown,
    acquireFailed,
    lost,
    providerAcceptedThenPersistFailed: await (async () => {
      const crashAdapter = {
        ...adapter,
        sendCalls: 0,
        async sendOutbound() {
          this.sendCalls += 1;
          return { externalMessageId: "wamid.fake.accepted", providerResponse: { fake: true, accepted: true } };
        },
      };
      const env = createTestEnvironment({
        adapters: [crashAdapter],
        companyChannel: { channelKey: "whatsapp", provider: "fake" },
        sharedTurnLock: {
          acquire: async () => true,
          renew: async () => true,
          release: async () => true,
        },
        failSentDeliveryUpdate: true,
      });
      const key = `wamid.persist.${randomUUID()}`;
      const request = {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        channelKey: "whatsapp",
        source: "webhook",
        idempotencyKey: key,
        externalThreadId: "15550000001",
        externalMessageId: key,
        payload: {
          text: "عايز احجز",
          externalThreadId: "15550000001",
          externalMessageId: key,
          senderExternalId: "15550000001",
        },
        executeAi: true,
        aiAssistantId: "assistant-1",
        runtimeConfig: { providerConnectionId: "provider-1" },
      };
      const first = await env.router.routeInbound(createContext(), request);
      const second = await env.router.routeInbound(createContext(), request);
      const pending = env.deliveryEvents.filter((event) => event.delivery_status === "pending").length;
      const sent = env.deliveryEvents.filter((event) => event.delivery_status === "sent").length;
      const failed = env.deliveryEvents.filter((event) => event.delivery_status === "failed").length;
      const replay = await recoverGeneratedReply({
        replyText: "Echo",
        outboundPhase: "preparing",
        deliveryStatus: "pending",
        hasNewerInbound: false,
        messageId: "msg-pending",
      });
      const missing = await recoverGeneratedReply({
        replyText: "Echo",
        outboundPhase: "preparing",
        deliveryStatus: null,
        hasNewerInbound: false,
        messageId: "msg-missing",
      });
      return {
        firstOutboundError: first.outboundError ?? null,
        secondDuplicate: second.duplicate === true,
        sendCalls: crashAdapter.sendCalls,
        pendingDeliveryRows: pending,
        sentDeliveryRows: sent,
        failedDeliveryRows: failed,
        pendingRecovery: replay,
        missingDeliveryRecovery: missing,
      };
    })(),
  };
}

async function runWorkerRestart() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-lock-final-"));
  const statePath = path.join(dir, "state.json");
  writeJson(statePath, {
    sendCalls: 0,
    confirmCalls: 0,
    listCalls: 0,
    rows: [
      { messageId: "accepted", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: "sent", hasNewerInbound: false, externalMessageId: "wamid.final.accepted", recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "pending", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: "pending", hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "missing", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "blank", replyText: "", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "newer", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: true, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "crashed", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
    ],
  });
  const spawnWorker = () => {
    const child = spawn(process.execPath, ["--import", "tsx/esm", fileURLToPath(import.meta.url), "worker", statePath], {
      cwd: path.join(repoRoot, "lib/channel-platform"),
      env: { ...process.env, WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "true" },
      stdio: "ignore",
    });
    const exit = new Promise((resolve) => child.on("exit", resolve));
    return { child, exit };
  };
  const first = spawnWorker();
  const firstExit = await first.exit;
  const afterFirst = readJson(statePath);
  const second = spawnWorker();
  const secondExit = await second.exit;
  const afterRestart = readJson(statePath);
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    defaultFlagEnabled: isWhatsAppReplyRecoveryWorkerEnabled({}),
    firstExit,
    secondExit,
    sendCalls: afterRestart.sendCalls,
    confirmCalls: afterRestart.confirmCalls,
    confirmCallsAfterFirst: afterFirst.confirmCalls,
    dispositions: afterRestart.rows.map((row) => ({ messageId: row.messageId, disposition: row.recoveryDisposition })),
    listCalls: afterRestart.listCalls,
  };
}

function sourcesDoNotSend() {
  const files = [
    "lib/channel-platform/src/services/reconcile-stuck-whatsapp-replies.ts",
    "lib/channel-platform/src/services/recover-generated-reply.ts",
    "lib/channel-platform/src/workers/whatsapp-reply-recovery-worker.ts",
    "artifacts/api-server/src/services/whatsapp-reply-recovery-worker.ts",
  ];
  return files.map((relative) => {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    return {
      file: relative,
      referencesSendOutbound: source.includes("sendOutbound"),
      callsUnscopedLoader: source.includes("loadStuckWhatsAppReplies("),
    };
  });
}

async function main() {
  blockExternalFetch();
  const report = {
    productionApiNotStarted: true,
    unscopedRecoveryScannerInvoked: false,
    sources: sourcesDoNotSend(),
  };
  try {
    report.failClosed = await runFailClosed();
    report.recovery = await withPg(async (client) => runRecoveryTransaction(client));
    report.worker = await runWorkerRestart();
    report.servers = await withPg(async (client) => runTwoServers(client));
    const leftover = await withPg(async (client) => {
      await client.query("set session_replication_role = replica");
      try {
        await client.query(
          `delete from public.channel_inbound_events
           where company_id in (select id from public.companies where name like 'wa-lock-final-%')`,
        );
        await client.query("delete from public.companies where name like 'wa-lock-final-%'");
      } finally {
        await client.query("set session_replication_role = origin");
      }
      const companies = await client.query(
        "select count(*)::int as n from public.companies where name like 'wa-lock-final-%'",
      );
      return { companies: companies.rows[0].n };
    });
    report.leftoverCompanies = leftover.companies;
    report.checks = evaluate(report);
  } catch (error) {
    report.error = safeError(error);
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.error || report.recovery?.error || report.servers?.error || report.checks?.ok === false) {
    process.exitCode = 1;
  }
}

function evaluate(report) {
  const problems = [];
  const same = report.servers?.sameWebhook;
  const two = report.servers?.twoMessages;
  if (!same || same.sendCalls !== 1 || same.duplicates !== 1 || same.runtimeCalls !== 1 || same.maxLeaseRows > 1) {
    problems.push("same_webhook");
  }
  if (!two || two.sendCalls !== 2 || two.runtimeCalls !== 2 || two.holdsOverlap !== false) {
    problems.push("two_messages_lock");
  }
  const cases = new Map((report.recovery?.cases ?? []).map((item) => [item.key, item]));
  const expectReason = {
    confirmed: null,
    pending: "delivery_pending",
    missing_delivery: "acceptance_unconfirmed",
    missing_text: "no_durable_reply",
    newer_inbound: "newer_turn",
    accepted_then_crashed: "acceptance_unconfirmed",
  };
  for (const [key, reason] of Object.entries(expectReason)) {
    const item = cases.get(key);
    if (!item) {
      problems.push(`missing_${key}`);
      continue;
    }
    if (key === "confirmed") {
      if (item.action !== "confirm_only" || item.disposition !== "confirmed") problems.push("confirmed");
    } else if (item.disposition !== "needs_review" || item.reason !== reason) {
      problems.push(key);
    }
  }
  if (report.recovery?.secondConfirmCalls !== 0 || report.recovery?.sendCalls !== 0) problems.push("recovery_repeat");
  if (report.recovery?.leaseStillOwned !== true) problems.push("recovery_lease");
  if ((report.recovery?.secondTick ?? []).some((item) => item.persisted || item.reason !== "already_settled")) {
    problems.push("second_tick");
  }
  const worker = report.worker;
  if (!worker || worker.sendCalls !== 0 || worker.confirmCalls !== 1 || worker.confirmCallsAfterFirst !== 1) {
    problems.push("worker");
  }
  const fail = report.failClosed;
  if (!fail || fail.sendCalls !== 0) problems.push("fail_closed_sends");
  if (!String(fail?.postgresDown?.thrown ?? "").includes("conversation_turn_lock_unavailable") || fail?.postgresDown?.runtimeCalls !== 0) {
    problems.push("postgres_down");
  }
  if (!String(fail?.acquireFailed?.thrown ?? "").includes("conversation_turn_lock_unavailable") || fail?.acquireFailed?.runtimeCalls !== 0) {
    problems.push("acquire_failed");
  }
  if (fail?.lost?.outboundError !== "conversation_turn_lease_lost" || fail?.lost?.runtimeCalls !== 1) problems.push("lease_lost");
  const window = fail?.providerAcceptedThenPersistFailed;
  if (!window || window.sendCalls !== 1 || window.secondDuplicate !== true || window.sentDeliveryRows !== 0 || window.failedDeliveryRows !== 1) {
    problems.push("provider_window");
  }
  if (window?.pendingRecovery?.action !== "skip" || window?.missingDeliveryRecovery?.reason !== "acceptance_unconfirmed") {
    problems.push("provider_window_recovery");
  }
  if (report.leftoverCompanies !== 0) problems.push("leftover");
  return { ok: problems.length === 0, problems };
}

const mode = process.argv[2] ?? "main";
if (mode === "server") {
  serverMain().catch((error) => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exit(1);
  });
} else if (mode === "worker") {
  workerMain().catch((error) => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exit(1);
  });
} else {
  main();
}
