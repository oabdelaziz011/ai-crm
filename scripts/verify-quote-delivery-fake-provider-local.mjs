/**
 * Phase 5 — Local Quote Delivery with isolated Fake Provider.
 *
 * Requires API on :3001 with:
 *   VALUEOR_ENV=local
 *   VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1
 *
 * Proves QuoteSendService.send + quote_send_attempts + fake dispatch calls.
 * Does NOT send via SMTP/Meta. Disposable @valueor-test.local only.
 *
 *   node --import ./artifacts/api-server/node_modules/tsx/dist/esm/index.mjs ./scripts/verify-quote-delivery-fake-provider-local.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(resolve(__dirname, "../artifacts/api-server/package.json"));
const requireFromDb = createRequire(resolve(__dirname, "../lib/db/package.json"));
const { createClient } = requireFromApi("@supabase/supabase-js");
const pg = requireFromDb("pg");

const {
  AI_SEND_REQUEST_METADATA_KEY,
  REQUEST_SEND_QUOTE_TOOL_KEY,
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  requestSendQuote,
} = await import("../lib/ai-tool-router/src/index.ts");
const { createQuoteDeliveryCommandDeps } = await import(
  "../artifacts/api-server/src/platform/webhook-quote-agent-ports.ts"
);

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const API_SERVER = "http://127.0.0.1:3001";
const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;
const supabaseUrl = (env.SUPABASE_URL || process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(
  /\/$/,
  "",
);
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  "";
const anonKey =
  env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (isProductionDatabaseUrl(databaseUrl)) throw new Error("Refusing production DATABASE_URL");
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") throw new Error(`Refusing non-local port: ${parsed.port}`);
if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321$/i.test(supabaseUrl)) {
  throw new Error(`Refusing non-local SUPABASE_URL: ${supabaseUrl}`);
}

const stamp = Date.now().toString(36);
const PREFIX = `m427_fake_${stamp}`;
const results = [];
function pass(name, detail) {
  results.push({ name, pass: true, detail: detail ?? null });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, err) {
  const detail = err instanceof Error ? err.message : String(err);
  results.push({ name, pass: false, detail });
  console.error(`FAIL ${name} — ${detail}`);
}

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();
const q = (sql, params) => c.query(sql, params);
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = {
  companyA: null,
  companyB: null,
  userSend: null,
  userNoSend: null,
  userB: null,
  quoteReject: null,
  quoteApprove: null,
  quoteFail: null,
  quoteB: null,
  senderRoleId: null,
  viewerRoleId: null,
};

async function api(path, { token, body }) {
  const res = await fetch(`${API_SERVER}/api/quotes${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function apiGet(path, token) {
  const res = await fetch(`${API_SERVER}/api/quotes${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function insertDraftQuote(companyId, userId, title) {
  const id = randomUUID();
  await q(
    `insert into public.quotes (
       id, company_id, quote_family_id, quote_number, title, status, currency, language, contact_name,
       subtotal, discount_total, tax_total, shipping_total, grand_total,
       is_current, version_number, metadata, created_by, updated_by
     ) values (
       $1, $2, $1, $3, $4, 'draft', 'EGP', 'en', $5,
       100, 0, 0, 0, 100, true, 1, '{}'::jsonb, $6, $6
     )`,
    [id, companyId, `Q-FK-${stamp}-${Math.floor(Math.random() * 9999)}`, title, `${PREFIX} Contact`, userId],
  );
  await q(
    `insert into public.quote_line_items (
       company_id, quote_id, line_kind, product_name_snapshot, quantity, unit_price,
       discount_amount, tax_amount, subtotal, total, sort_order, currency
     ) values ($1, $2, 'manual', $3, 1, 100, 0, 0, 100, 100, 0, 'EGP')`,
    [companyId, id, `${PREFIX} Line`],
  );
  return id;
}

async function setPending(quoteId, companyId, userId, channel = "email") {
  const request = {
    status: "pending_human_approval",
    channel,
    requestedAt: new Date().toISOString(),
    requestedByUserId: userId,
    conversationId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    attemptId: null,
    errorCode: null,
  };
  await admin
    .from("quotes")
    .update({
      metadata: { [AI_SEND_REQUEST_METADATA_KEY]: request },
      updated_by: userId,
    })
    .eq("id", quoteId)
    .eq("company_id", companyId);
}

async function attemptCount(quoteId) {
  const r = await q(`select count(*)::int as n from public.quote_send_attempts where quote_id = $1`, [
    quoteId,
  ]);
  return r.rows[0].n;
}

async function quoteRow(quoteId) {
  const r = await q(`select status, metadata from public.quotes where id = $1`, [quoteId]);
  return r.rows[0];
}

async function cleanup() {
  try {
    const { spawnSync } = await import("node:child_process");
    spawnSync(process.execPath, [resolve(root, "scripts/cleanup-m427-disposable-local.mjs"), "--prefix", "m427_fake_"], {
      cwd: root,
      stdio: "inherit",
    });
  } catch (error) {
    console.warn("cleanup warning:", error?.message ?? error);
  }
}

try {
  const health = await fetch(`${API_SERVER}/api/health`);
  assert.equal(health.status, 200);
  pass("api_local", "3001 /api/health");

  await q(`select set_config('vault.provisioning_bootstrap', 'true', true)`);

  const mkCompany = async (suffix, email) =>
    (
      await q(
        `insert into public.companies (
           name, status, subscription_plan, subscription_status, company_type,
           approval_status, approval_requested_at, tenant_provisioning_status, contact_email
         ) values ($1, 'Active', 'Pro', 'active', 'demo', 'approved', now(), 'completed', $2)
         returning id`,
        [`${PREFIX}_${suffix}`, email],
      )
    ).rows[0].id;

  const emailSend = `${PREFIX}.send@valueor-test.local`;
  const emailNo = `${PREFIX}.nosend@valueor-test.local`;
  const emailB = `${PREFIX}.b@valueor-test.local`;
  const password = `Tmp_${stamp}_Aa1!`;

  created.companyA = await mkCompany("A", emailSend);
  created.companyB = await mkCompany("B", emailB);

  for (const [email, key] of [
    [emailSend, "userSend"],
    [emailNo, "userNoSend"],
    [emailB, "userB"],
  ]) {
    const auth = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    created[key] = auth.data.user.id;
  }

  for (const [userId, companyId, email, role] of [
    [created.userSend, created.companyA, emailSend, "admin"],
    [created.userNoSend, created.companyA, emailNo, "employee"],
    [created.userB, created.companyB, emailB, "admin"],
  ]) {
    await q(
      `insert into public.profiles (
         id, user_id, company_id, full_name, email, role, is_active, preferred_language, is_super_admin
       ) values ($1, $1, $2, $3, $4, $5, true, 'en', false)
       on conflict (id) do update set company_id = $2, role = $5, email = excluded.email, is_active = true`,
      [userId, companyId, "Fake E2E", email, role],
    );
  }

  created.senderRoleId = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'fake e2e', false, 'DEFAULT', 'admin') returning id`,
      [created.companyA, `${PREFIX} Sender`],
    )
  ).rows[0].id;
  created.viewerRoleId = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'fake e2e', false, 'DEFAULT', 'employee') returning id`,
      [created.companyA, `${PREFIX} Viewer`],
    )
  ).rows[0].id;

  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('quotes.view','quotes.create','quotes.edit','quotes.send')`,
    [created.senderRoleId],
  );
  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p where p.code in ('quotes.view')`,
    [created.viewerRoleId],
  );
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    created.userSend,
    created.senderRoleId,
  ]);
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    created.userNoSend,
    created.viewerRoleId,
  ]);
  const roleB = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'fake e2e b', false, 'DEFAULT', 'admin') returning id`,
      [created.companyB, `${PREFIX} B Sender`],
    )
  ).rows[0].id;
  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('quotes.view','quotes.create','quotes.edit','quotes.send')`,
    [roleB],
  );
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [created.userB, roleB]);

  for (const companyId of [created.companyA, created.companyB]) {
    await q(
      `insert into public.company_feature_overrides (
         company_id, feature_code, override_state, reason, source, is_active, starts_at
       ) values ($1, 'opportunities', 'enabled', $2, 'manual', true, now())`,
      [companyId, `${PREFIX} fake`],
    );
  }

  created.quoteReject = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} reject`);
  created.quoteApprove = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} approve`);
  created.quoteFail = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} fail`);
  created.quoteB = await insertDraftQuote(created.companyB, created.userB, `${PREFIX} other`);

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sign = async (email) => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  };
  const tokenSend = await sign(emailSend);
  const tokenNo = await sign(emailNo);
  const tokenB = await sign(emailB);
  pass("fixtures", `A=${created.companyA}`);

  // Fake provider must be enabled on API
  const stats0 = await apiGet("/send-fake-stats", tokenSend);
  if (stats0.status !== 200 || !stats0.json?.enabled) {
    throw new Error(
      `API Fake Provider not enabled (GET /quotes/send-fake-stats → ${stats0.status}). Restart API with VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1`,
    );
  }
  pass("fake_provider_enabled", `mode=${stats0.json.mode}`);

  await api("/send-fake-control", { token: tokenSend, body: { reset: true, mode: "success" } });

  // Tool permissions unchanged
  const tools = await q(
    `select key, required_permissions::text as perms from public.tool_definitions
     where key = any($1::text[])`,
    [[CREATE_DRAFT_QUOTE_TOOL_KEY, REQUEST_SEND_QUOTE_TOOL_KEY]],
  );
  const byKey = Object.fromEntries(tools.rows.map((r) => [r.key, JSON.parse(r.perms)]));
  assert.ok(!byKey[CREATE_DRAFT_QUOTE_TOOL_KEY].includes("quotes.send"));
  assert.ok(!byKey[REQUEST_SEND_QUOTE_TOOL_KEY].includes("quotes.send"));
  pass("tool_permissions_unchanged", JSON.stringify(byKey));

  // 1) AI request → pending, no dispatch
  const deps = createQuoteDeliveryCommandDeps(admin);
  const aiQuote = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} ai`);
  const beforeAiCalls = (await apiGet("/send-fake-stats", tokenSend)).json.callCount;
  const aiResult = await requestSendQuote(deps, {
    companyId: created.companyA,
    userId: created.userSend,
    conversationId: randomUUID(),
    quoteId: aiQuote,
    channel: "email",
  });
  assert.equal(aiResult.ok, true);
  if (aiResult.ok) {
    assert.equal(aiResult.sent, false);
    assert.equal(aiResult.deliveryState, "pending_human_approval");
  }
  assert.equal(await attemptCount(aiQuote), 0);
  const afterAiCalls = (await apiGet("/send-fake-stats", tokenSend)).json.callCount;
  assert.equal(afterAiCalls, beforeAiCalls);
  pass("ai_request_no_dispatch", `calls=${afterAiCalls}`);

  // 2) Reject — no attempts, no provider calls
  await setPending(created.quoteReject, created.companyA, created.userSend);
  const beforeReject = (await apiGet("/send-fake-stats", tokenSend)).json.callCount;
  const rejected = await api("/send-requests/reject", {
    token: tokenSend,
    body: { companyId: created.companyA, quoteId: created.quoteReject },
  });
  assert.equal(rejected.status, 200);
  assert.equal(await attemptCount(created.quoteReject), 0);
  assert.equal((await apiGet("/send-fake-stats", tokenSend)).json.callCount, beforeReject);
  const rejMeta = (await quoteRow(created.quoteReject)).metadata?.aiSendRequest;
  assert.equal(rejMeta?.status, "rejected");
  pass("reject_no_provider", "attempts=0");

  // 3) Approve success via Fake Provider
  await setPending(created.quoteApprove, created.companyA, created.userSend);
  await api("/send-fake-control", { token: tokenSend, body: { reset: true, mode: "success" } });
  const approved = await api("/send-requests/approve", {
    token: tokenSend,
    body: {
      companyId: created.companyA,
      quoteId: created.quoteApprove,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json?.sent, true);
  assert.equal(approved.json?.deliveryState, "sent");
  const approveStats = (await apiGet("/send-fake-stats", tokenSend)).json;
  assert.equal(approveStats.callCount, 1);
  assert.equal(await attemptCount(created.quoteApprove), 1);
  const sentRow = await quoteRow(created.quoteApprove);
  assert.equal(sentRow.status, "sent");
  assert.equal(sentRow.metadata?.aiSendRequest?.status, "approved_sent");
  pass("approve_fake_success", `providerCalls=1 attempts=1 quote=sent`);

  // 5) Duplicate approve blocked — no second dispatch
  const dup = await api("/send-requests/approve", {
    token: tokenSend,
    body: {
      companyId: created.companyA,
      quoteId: created.quoteApprove,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(dup.status, 409);
  assert.equal((await apiGet("/send-fake-stats", tokenSend)).json.callCount, 1);
  assert.equal(await attemptCount(created.quoteApprove), 1);
  pass("duplicate_approve_no_second_send", "providerCalls still 1");

  // 4) Provider failure → approved_failed, quote not sent
  await setPending(created.quoteFail, created.companyA, created.userSend);
  await api("/send-fake-control", { token: tokenSend, body: { mode: "fail", failMessage: "fake_boom" } });
  const failed = await api("/send-requests/approve", {
    token: tokenSend,
    body: {
      companyId: created.companyA,
      quoteId: created.quoteFail,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.ok(failed.status >= 400, JSON.stringify(failed.json));
  const failRow = await quoteRow(created.quoteFail);
  assert.equal(failRow.status, "draft");
  assert.equal(failRow.metadata?.aiSendRequest?.status, "approved_failed");
  assert.ok((await attemptCount(created.quoteFail)) >= 1);
  const failAttempts = await q(
    `select status from public.quote_send_attempts where quote_id = $1 order by created_at desc limit 1`,
    [created.quoteFail],
  );
  assert.equal(failAttempts.rows[0]?.status, "failed");
  pass("approve_fake_failure", "quote=draft request=approved_failed attempt=failed");

  // 8) Provider timeout — attempt failed, request approved_failed (not stuck sending)
  const quoteTimeout = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} timeout`);
  await setPending(quoteTimeout, created.companyA, created.userSend);
  await api("/send-fake-control", { token: tokenSend, body: { mode: "timeout", delayMs: 20 } });
  const timedOut = await api("/send-requests/approve", {
    token: tokenSend,
    body: {
      companyId: created.companyA,
      quoteId: quoteTimeout,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.ok(timedOut.status >= 400, JSON.stringify(timedOut.json));
  const timeoutRow = await quoteRow(quoteTimeout);
  assert.equal(timeoutRow.status, "draft");
  assert.equal(timeoutRow.metadata?.aiSendRequest?.status, "approved_failed");
  assert.notEqual(timeoutRow.metadata?.aiSendRequest?.status, "sending");
  const timeoutAttempt = await q(
    `select status, error_code from public.quote_send_attempts where quote_id = $1 order by created_at desc limit 1`,
    [quoteTimeout],
  );
  assert.equal(timeoutAttempt.rows[0]?.status, "failed");
  pass("approve_fake_timeout_resolved", "quote=draft request=approved_failed attempt=failed");

  // 6) No quotes.send
  await setPending(created.quoteFail, created.companyA, created.userSend);
  await api("/send-fake-control", { token: tokenSend, body: { mode: "success" } });
  const forbidden = await api("/send-requests/approve", {
    token: tokenNo,
    body: {
      companyId: created.companyA,
      quoteId: created.quoteFail,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(forbidden.status, 403);
  pass("forbidden_without_quotes_send", "403");

  // 7) Cross-company
  await setPending(created.quoteB, created.companyB, created.userB);
  const cross = await api("/send-requests/approve", {
    token: tokenSend,
    body: {
      companyId: created.companyA,
      quoteId: created.quoteB,
      channel: "email",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(cross.status, 404);
  const listA = await api("/send-requests", {
    token: tokenSend,
    body: { companyId: created.companyA },
  });
  const items = listA.json?.items ?? [];
  assert.ok(!items.some((i) => i.quoteId === created.quoteB));
  pass("cross_company_isolated", `list=${items.length}; approve=${cross.status}`);

  // Concurrent double approve on a fresh pending quote
  const quoteRace = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} race`);
  await setPending(quoteRace, created.companyA, created.userSend);
  await api("/send-fake-control", { token: tokenSend, body: { reset: true, mode: "success" } });
  const [r1, r2] = await Promise.all([
    api("/send-requests/approve", {
      token: tokenSend,
      body: {
        companyId: created.companyA,
        quoteId: quoteRace,
        channel: "email",
        idempotencyKey: randomUUID(),
      },
    }),
    api("/send-requests/approve", {
      token: tokenSend,
      body: {
        companyId: created.companyA,
        quoteId: quoteRace,
        channel: "email",
        idempotencyKey: randomUUID(),
      },
    }),
  ]);
  const successes = [r1, r2].filter((r) => r.status === 200 && r.json?.sent === true);
  const raceCalls = (await apiGet("/send-fake-stats", tokenSend)).json.callCount;
  assert.ok(successes.length === 1, `expected 1 success got ${successes.length}`);
  assert.equal(raceCalls, 1, `expected 1 provider call got ${raceCalls}`);
  assert.equal(await attemptCount(quoteRace), 1);
  pass("concurrent_approve_single_dispatch", `providerCalls=${raceCalls}`);

  console.log(
    JSON.stringify(
      {
        kind: "local_quote_delivery_fake_provider",
        database: "127.0.0.1:54322",
        apiServer: API_SERVER,
        liveCustomerSend: false,
        deliveryMode: "Fake Provider inside QuoteSendService.dispatch (no SMTP/Meta)",
        passed: results.filter((r) => r.pass).length,
        failed: results.filter((r) => !r.pass).length,
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail("fatal", error);
  console.error(error);
} finally {
  await cleanup();
  await c.end();
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed ? 1 : 0);
}
