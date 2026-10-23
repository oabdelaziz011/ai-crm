/**
 * Local-only WhatsApp recovery verification.
 * Opens 127.0.0.1:54322, inserts a synthetic company inside a transaction, runs the
 * scanner queries and confirm RPC, then rolls the transaction back.
 * Does not call a WhatsApp provider.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { planStuckWhatsAppReplyRecovery, toStuckWhatsAppReply } from "../../../lib/channel-platform/src/services/reconcile-stuck-whatsapp-replies.ts";
import {
  isWhatsAppReplyRecoveryWorkerEnabled,
  startWhatsAppReplyRecoveryWorker,
} from "../../../lib/channel-platform/src/workers/whatsapp-reply-recovery-worker.ts";
import { waitForConversationTurn } from "../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const require = createRequire(path.join(repoRoot, "lib/db/package.json"));
const pg = require("pg");
const mode = process.argv[2] ?? "main";

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const details = [
    message,
    error?.code ? `code=${error.code}` : "",
    error?.table ? `table=${error.table}` : "",
    error?.constraint ? `constraint=${error.constraint}` : "",
    error?.routine ? `routine=${error.routine}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return details
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted-jwt]")
    .replace(/service_role[\w-]*/gi, "[redacted]");
}

function readLocalEndpoints() {
  const envPath = path.join(repoRoot, ".env.localstack");
  const text = fs.readFileSync(envPath, "utf8");
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
  return { databaseUrl: values.DATABASE_URL, supabaseOrigin: supabaseUrl.origin };
}

async function probeSupabase(origin) {
  const response = await fetch(`${origin}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
  return { origin: "http://127.0.0.1:54321", status: response.status };
}

function recoverySourcesDoNotSend() {
  const files = [
    "lib/channel-platform/src/services/reconcile-stuck-whatsapp-replies.ts",
    "lib/channel-platform/src/services/recover-generated-reply.ts",
    "lib/channel-platform/src/workers/whatsapp-reply-recovery-worker.ts",
    "artifacts/api-server/src/services/whatsapp-reply-recovery-worker.ts",
  ];
  return files.map((relative) => {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    return { file: relative, referencesSendOutbound: source.includes("sendOutbound") };
  });
}

async function runPostgresScanner() {
  const { databaseUrl, supabaseOrigin } = readLocalEndpoints();
  const supabase = await probeSupabase(supabaseOrigin);
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    query_timeout: 20000,
  });
  await client.connect();
  const server = await client.query(
    "select inet_server_addr()::text as addr, inet_server_port()::int as port, current_database() as db",
  );
  const identity = server.rows[0];
  const serverPort = Number(identity.port);
  const serverAddr = identity.addr ?? null;
  const localServer =
    !serverAddr ||
    serverAddr === "127.0.0.1" ||
    serverAddr === "::1" ||
    serverAddr.startsWith("10.") ||
    serverAddr.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(serverAddr);
  if (!localServer) {
    await client.end();
    throw new Error(`Refusing Postgres server address ${serverAddr}`);
  }

  const existing = await client.query(`
    select count(*)::int as stuck
    from public.conversation_messages
    where message_type = 'outgoing'
      and metadata->>'outboundPhase' in ('preparing', 'dispatching')
  `);

  const report = {
    postgres: {
      clientHost: "127.0.0.1",
      clientPort: 54322,
      serverAddr,
      serverPort,
      database: identity.db,
    },
    supabase,
    existingStuckRowsBefore: existing.rows[0].stuck,
    rolledBack: false,
    leftoverVerifyCompanies: null,
    sendCalls: 0,
    cases: [],
    secondTick: [],
    confirmRpc: null,
  };

  let step = "connect";
  try {
    step = "begin";
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    step = "channel";
    const channel = await client.query(
      "select id from public.communication_channels where key = 'whatsapp' limit 1",
    );
    if (!channel.rows[0]) throw new Error("Local catalog has no whatsapp communication channel");

    step = "company";
    const company = await client.query(
      `insert into public.companies (name)
       values ($1)
       returning id`,
      [`wa-pipeline-verify-${randomUUID()}`],
    );
    const companyId = company.rows[0].id;
    step = "assistant";
    const existingAssistant = await client.query(
      "select id from public.ai_assistant_settings where company_id = $1",
      [companyId],
    );
    const assistantId = existingAssistant.rows[0]
      ? existingAssistant.rows[0].id
      : (
          await client.query(
            `insert into public.ai_assistant_settings (company_id)
             values ($1)
             returning id`,
            [companyId],
          )
        ).rows[0].id;
    step = "company-channel";
    const companyChannel = await client.query(
      `insert into public.company_channels (company_id, channel_id, display_name, provider, status, is_enabled)
       values ($1, $2, 'verify-whatsapp', 'fake', 'active', false)
       returning id`,
      [companyId, channel.rows[0].id],
    );

    const specs = [
      { key: "confirmed", phase: "preparing", content: "verify-reply", delivery: "sent", newer: false },
      { key: "pending", phase: "dispatching", content: "verify-reply", delivery: "pending", newer: false },
      { key: "missing_delivery", phase: "preparing", content: "verify-reply", delivery: null, newer: false },
      { key: "missing_text", phase: "preparing", content: "", delivery: null, newer: false },
      { key: "newer_inbound", phase: "preparing", content: "verify-reply", delivery: null, newer: true },
    ];

    const fixtureIds = [];
    for (const spec of specs) {
      step = `fixture-${spec.key}`;
      const conversation = await client.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, state)
         values ($1, $2, 'whatsapp', 'idle')
         returning id`,
        [companyId, assistantId],
      );
      const conversationId = conversation.rows[0].id;
      const message = await client.query(
        `insert into public.conversation_messages
           (conversation_id, message_type, content, status, metadata, created_at)
         values ($1, 'outgoing', $2, 'pending', $3::jsonb, now() - interval '10 minutes')
         returning id, content, metadata, created_at, conversation_id`,
        [
          conversationId,
          spec.content,
          JSON.stringify({
            outboundPhase: spec.phase,
            runtimeExecutionId: `verify-${spec.key}`,
            whatsappRecoveryVerify: true,
          }),
        ],
      );
      fixtureIds.push(message.rows[0].id);
      if (spec.delivery) {
        await client.query(
          `insert into public.channel_delivery_events
             (company_id, company_channel_id, channel_key, conversation_id, outbound_message_id,
              external_thread_id, external_message_id, delivery_status)
           values ($1, $2, 'whatsapp', $3, $4, $5, $6, $7)`,
          [
            companyId,
            companyChannel.rows[0].id,
            conversationId,
            message.rows[0].id,
            `verify-thread-${spec.key}`,
            `wamid.verify.${spec.key}`,
            spec.delivery,
          ],
        );
      }
      if (spec.newer) {
        await client.query(
          `insert into public.conversation_messages
             (conversation_id, message_type, content, created_at)
           values ($1, 'incoming', 'verify-newer', now() - interval '9 minutes')`,
          [conversationId],
        );
      }
    }

    step = "plan";
    const loaded = await loadFixtureRows(client, fixtureIds);
    const decisions = await planStuckWhatsAppReplyRecovery(loaded, async (input) => {
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query(
        "select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)",
      );
      await client.query(
        "select public.confirm_conversation_message_outbound($1::uuid, $2, $3)",
        [input.messageId, input.status, input.externalMessageId ?? null],
      );
    });
    report.confirmRpc = "called_for_provider_accepted_only";
    for (const decision of decisions) {
      if (!fixtureIds.includes(decision.messageId)) {
        throw new Error("Scanner produced a decision outside the fixture set");
      }
      if (decision.persisted) await saveDecision(client, decision);
    }
    report.cases = await readOutcomes(client, fixtureIds, decisions);

    const second = await planStuckWhatsAppReplyRecovery(await loadFixtureRows(client, fixtureIds), async () => {
      throw new Error("second tick must not confirm or send");
    });
    report.secondTick = second.map((decision) => ({
      disposition: decision.disposition,
      persisted: decision.persisted,
      reason: decision.outcome.reason ?? null,
      action: decision.outcome.action,
    }));

    await client.query("rollback");
    report.rolledBack = true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    report.rolledBack = true;
    report.error = `${step}: ${safeError(error)}`;
  }

  const leftover = await client.query(
    "select count(*)::int as companies from public.companies where name like 'wa-pipeline-verify-%'",
  );
  report.leftoverVerifyCompanies = leftover.rows[0].companies;
  await client.end();
  return report;
}

async function loadFixtureRows(client, fixtureIds) {
  const rows = await client.query(
    `select id, content, metadata, created_at, conversation_id
     from public.conversation_messages
     where message_type = 'outgoing'
       and metadata->>'outboundPhase' in ('preparing', 'dispatching')
       and id = any($1::uuid[])
     order by created_at asc
     limit 25`,
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
    const chosen = pickDelivery(deliveries.rows);
    const newer = await client.query(
      `select id
       from public.conversation_messages
       where conversation_id = $1
         and message_type = 'incoming'
         and created_at > $2
       limit 1`,
      [row.conversation_id, row.created_at],
    );
    stuck.push(
      toStuckWhatsAppReply({
        id: row.id,
        content: row.content,
        createdAt: row.created_at.toISOString(),
        metadata: row.metadata,
        deliveryStatus: chosen?.delivery_status ?? null,
        externalMessageId: chosen?.external_message_id ?? null,
        hasNewerInbound: newer.rows.length > 0,
        nowMs: Date.now(),
      }),
    );
  }
  return stuck;
}

function pickDelivery(rows) {
  const accepted = rows.find((row) =>
    ["sent", "delivered", "read"].includes(String(row.delivery_status ?? "").toLowerCase()),
  );
  if (accepted) return accepted;
  return rows.find((row) => String(row.delivery_status ?? "").toLowerCase() === "pending") ?? rows[0] ?? null;
}

async function saveDecision(client, decision) {
  const current = await client.query(
    "select metadata from public.conversation_messages where id = $1",
    [decision.messageId],
  );
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

async function readOutcomes(client, fixtureIds, decisions) {
  const rows = await client.query(
    `select id, content, status, metadata
     from public.conversation_messages
     where id = any($1::uuid[])`,
    [fixtureIds],
  );
  return rows.rows.map((row) => {
    const decision = decisions.find((item) => item.messageId === row.id);
    return {
      runtimeExecutionId: row.metadata?.runtimeExecutionId ?? null,
      status: row.status,
      outboundPhase: row.metadata?.outboundPhase ?? null,
      disposition: row.metadata?.whatsappRecoveryDisposition ?? null,
      action: decision?.outcome.action ?? null,
      reason: decision?.outcome.reason ?? null,
    };
  });
}

function spawnNode(args, env) {
  return spawn(process.execPath, ["--import", "tsx/esm", fileURLToPath(import.meta.url), ...args], {
    cwd: path.join(repoRoot, "lib/channel-platform"),
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
}

function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

function readJson(file) {
  const started = Date.now();
  let lastError = new Error(`unreadable json ${path.basename(file)}`);
  while (Date.now() - started < 1000) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function waitForFile(file, predicate, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        if (fs.existsSync(file) && predicate(readJson(file))) {
          clearInterval(timer);
          resolve(readJson(file));
          return;
        }
      } catch {
        // The writer may be mid-rename.
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timed out waiting for ${path.basename(file)}`));
      }
    }, 20);
  });
}

async function runWorkerRestart() {
  const disabled = startWhatsAppReplyRecoveryWorker(
    {
      listStuck: async () => [],
      confirm: async () => undefined,
      save: async () => undefined,
    },
    { WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "false" },
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-recovery-"));
  const statePath = path.join(dir, "state.json");
  const initial = {
    sendCalls: 0,
    confirmCalls: 0,
    listCalls: 0,
    rows: [
      { messageId: "accepted", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: "sent", hasNewerInbound: false, externalMessageId: "wamid.verify.accepted", recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "pending", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: "pending", hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "missing", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "blank", replyText: "", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: false, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
      { messageId: "newer", replyText: "verify-reply", outboundPhase: "preparing", deliveryStatus: null, hasNewerInbound: true, recoveryAttempts: 0, recoveryDisposition: null, ageMs: 180000 },
    ],
  };
  writeJson(statePath, initial);
  const first = spawnNode(["worker", statePath], { WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "true" });
  const firstExitPromise = new Promise((resolve) => first.on("exit", resolve));
  const afterFirst = await waitForFile(
    statePath,
    (state) => state.rows.every((row) => row.recoveryDisposition),
    8000,
  );
  first.kill("SIGTERM");
  const firstExit = await firstExitPromise;
  const baselineListCalls = readJson(statePath).listCalls;
  const second = spawnNode(["worker", statePath], { WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "true" });
  const secondExitPromise = new Promise((resolve) => second.on("exit", resolve));
  const afterRestart = await waitForFile(
    statePath,
    (state) => state.listCalls > baselineListCalls,
    8000,
  );
  second.kill("SIGTERM");
  const secondExit = await secondExitPromise;
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    defaultFlagEnabled: isWhatsAppReplyRecoveryWorkerEnabled({}),
    disabledStartReturnedNull: disabled === null,
    firstExit,
    secondExit,
    sendCalls: afterRestart.sendCalls,
    confirmCalls: afterRestart.confirmCalls,
    dispositions: afterRestart.rows.map((row) => ({
      messageId: row.messageId,
      disposition: row.recoveryDisposition,
    })),
    listCalls: afterRestart.listCalls,
    firstTickDispositions: afterFirst.rows.map((row) => row.recoveryDisposition),
    stderr: "",
  };
}

async function runTwoProcessLock() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-lock-"));
  const holdPath = path.join(dir, "hold.json");
  const contendPath = path.join(dir, "contend.json");
  const releasePath = path.join(dir, "release");
  const holder = spawnNode(["lock-hold", holdPath, releasePath], {});
  const holderExitPromise = new Promise((resolve) => holder.on("exit", resolve));
  await waitForFile(holdPath, (state) => state.holding === true, 30000);
  const contender = spawnNode(["lock-contend", contendPath], {});
  const contendExitPromise = new Promise((resolve) => contender.on("exit", resolve));
  const contended = await waitForFile(contendPath, (state) => state.acquired === true, 30000).catch((error) => ({
    acquired: false,
    error: safeError(error),
  }));
  const holderStillHolding = readJson(holdPath).holding === true;
  fs.writeFileSync(releasePath, "release");
  const holderExit = await holderExitPromise;
  const contendExit = await contendExitPromise;
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    contenderAcquiredWhileOtherProcessHeld: contended.acquired === true && holderStillHolding,
    holderExit,
    contendExit,
    waitedMs: contended.waitedMs ?? null,
  };
}

async function workerMode(statePath) {
  if (!isWhatsAppReplyRecoveryWorkerEnabled()) process.exit(2);
  const handle = startWhatsAppReplyRecoveryWorker(
    {
      intervalMs: 30,
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
        if (row) {
          row.recoveryDisposition = decision.disposition;
          row.recoveryAttempts = decision.attempts;
        }
        writeJson(statePath, state);
      },
    },
    process.env,
  );
  const stop = () => {
    handle?.stop();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

async function lockHoldMode(holdPath, releasePath) {
  const lease = await waitForConversationTurn("wa-pipeline-verify-conversation");
  writeJson(holdPath, { holding: true });
  const started = Date.now();
  while (!fs.existsSync(releasePath) && Date.now() - started < 60000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  lease.release();
  writeJson(holdPath, { holding: false });
  process.exit(0);
}

async function lockContendMode(contendPath) {
  const started = Date.now();
  const lease = await waitForConversationTurn("wa-pipeline-verify-conversation");
  writeJson(contendPath, { acquired: true, waitedMs: Date.now() - started });
  lease.release();
  process.exit(0);
}

if (mode === "worker") {
  await workerMode(process.argv[3]);
} else if (mode === "lock-hold") {
  await lockHoldMode(process.argv[3], process.argv[4]);
} else if (mode === "lock-contend") {
  await lockContendMode(process.argv[3]);
} else {
  const keepAlive = setInterval(() => {}, 500);
  const reportPath = path.join(os.tmpdir(), "wa-pipeline-verify-report.json");
  const report = {
    sources: recoverySourcesDoNotSend(),
    flagDefault: isWhatsAppReplyRecoveryWorkerEnabled({}),
  };
  const publish = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  try {
    report.postgres = await runPostgresScanner();
  } catch (error) {
    report.postgres = { executed: false, error: safeError(error) };
  }
  publish();
  try {
    report.workerRestart = await runWorkerRestart();
  } catch (error) {
    report.workerRestart = { executed: false, error: safeError(error) };
  }
  publish();
  try {
    report.twoProcessLock = await runTwoProcessLock();
  } catch (error) {
    report.twoProcessLock = { executed: false, error: safeError(error) };
  }
  publish();
  clearInterval(keepAlive);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
