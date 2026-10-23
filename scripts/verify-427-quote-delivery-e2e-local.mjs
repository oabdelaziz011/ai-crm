/**
 * Phase 4 — Local Quote Delivery E2E verification (disposable fixtures only).
 * Proves: AI request metadata → inbox APIs → reject/approve → QuoteSendService path,
 * tenant isolation, permission denials, outbound gate behavior, status honesty.
 *
 * Does NOT send to real customers: disposable @valueor-test.local + no live channels.
 * Run:
 *   node --import ./artifacts/api-server/node_modules/tsx/dist/esm/index.mjs ./scripts/verify-427-quote-delivery-e2e-local.mjs
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
  GET_QUOTE_DELIVERY_STATUS_TOOL_KEY,
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  requestSendQuote,
  getQuoteDeliveryStatus,
} = await import("../lib/ai-tool-router/src/index.ts");
const { QuoteSendApprovalService } = await import(
  "../artifacts/api-server/src/services/quote-send/quote-send-approval-service.ts"
);
const { createQuoteDeliveryCommandDeps } = await import(
  "../artifacts/api-server/src/platform/webhook-quote-agent-ports.ts"
);
const { createQuoteSendApprovalSupabasePorts } = await import(
  "../artifacts/api-server/src/services/quote-send/quote-send-approval-supabase-ports.ts"
);
const {
  assertLocalExternalOutboundAllowed,
  isLocalExternalOutboundPermitted,
} = await import("../artifacts/api-server/src/lib/local-outbound-guard.ts");
const { QuoteSendError } = await import(
  "../artifacts/api-server/src/services/quote-send/quote-send-service.ts"
);

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_API = "http://127.0.0.1:54321";
const API_SERVER = "http://127.0.0.1:3001";
const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;
const supabaseUrl = (env.SUPABASE_URL || process.env.SUPABASE_URL || LOCAL_API).replace(/\/$/, "");
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";
const anonKey =
  env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing verify against production DATABASE_URL.");
}
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321$/i.test(supabaseUrl)) {
  throw new Error(`Refusing non-local SUPABASE_URL: ${supabaseUrl}`);
}
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!anonKey) throw new Error("SUPABASE_ANON_KEY missing");

const stamp = Date.now().toString(36);
const PREFIX = `m427_e2e_${stamp}`;
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

const pgClient = new pg.Client({ connectionString: databaseUrl });
await pgClient.connect();
const q = (sql, params) => pgClient.query(sql, params);
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = {
  companyA: null,
  companyB: null,
  userSend: null,
  userNoSend: null,
  senderRoleId: null,
  viewerRoleId: null,
  quoteReject: null,
  quoteApprove: null,
  quoteB: null,
  password: `Tmp_${stamp}_Aa1!`,
};

async function createUser(email, companyId, role, isSuperAdmin = false) {
  const auth = await admin.auth.admin.createUser({
    email,
    password: created.password,
    email_confirm: true,
    user_metadata: { full_name: email },
  });
  if (auth.error || !auth.data.user) throw new Error(auth.error?.message || "auth create failed");
  const userId = auth.data.user.id;
  await q(
    `insert into public.profiles (
       id, user_id, company_id, full_name, email, role, is_active, preferred_language, is_super_admin
     ) values ($1, $1, $2, $3, $4, $5, true, 'en', $6)
     on conflict (id) do update set company_id = $2, role = $5, email = excluded.email`,
    [userId, companyId, email, email, role, isSuperAdmin],
  );
  return userId;
}

async function signIn(email) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: created.password,
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "signIn failed");
  }
  return data.session.access_token;
}

async function apiPost(path, token, body) {
  const res = await fetch(`${API_SERVER}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

async function insertDraftQuote(companyId, userId, title) {
  const id = randomUUID();
  const familyId = id;
  const number = `Q-E2E-${stamp}-${Math.floor(Math.random() * 9999)}`;
  await q(
    `insert into public.quotes (
       id, company_id, quote_family_id, quote_number, title, status, currency, language, contact_name,
       subtotal, discount_total, tax_total, shipping_total, grand_total,
       is_current, version_number, metadata, created_by, updated_by
     ) values (
       $1, $2, $3, $4, $5, 'draft', 'EGP', 'en', $6,
       100, 0, 0, 0, 100,
       true, 1, '{}'::jsonb, $7, $7
     )`,
    [id, companyId, familyId, number, title, `${PREFIX} Contact`, userId],
  );
  await q(
    `insert into public.quote_line_items (
       company_id, quote_id, line_kind, product_name_snapshot, quantity, unit_price,
       discount_amount, tax_amount, subtotal, total, sort_order, currency
     ) values ($1, $2, 'manual', $3, 1, 100, 0, 0, 100, 100, 0, 'EGP')`,
    [companyId, id, `${PREFIX} Line`],
  );
  return { id, number };
}

async function setPendingRequest(quoteId, companyId, userId, channel = "email") {
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
  const { data: row } = await admin
    .from("quotes")
    .select("metadata")
    .eq("id", quoteId)
    .eq("company_id", companyId)
    .maybeSingle();
  const metadata = { ...(row?.metadata ?? {}), [AI_SEND_REQUEST_METADATA_KEY]: request };
  const { error } = await admin
    .from("quotes")
    .update({ metadata, updated_by: userId })
    .eq("id", quoteId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return request;
}

async function cleanup() {
  try {
    for (const quoteId of [created.quoteReject, created.quoteApprove, created.quoteB]) {
      if (!quoteId) continue;
      await q(`delete from public.quote_line_items where quote_id = $1`, [quoteId]).catch(() => undefined);
      await q(`delete from public.quote_history where quote_id = $1`, [quoteId]).catch(() => undefined);
      await q(`delete from public.quote_send_attempts where quote_id = $1`, [quoteId]).catch(() => undefined);
      await q(`delete from public.quotes where id = $1`, [quoteId]).catch(() => undefined);
    }
    for (const userId of [created.userSend, created.userNoSend]) {
      if (!userId) continue;
      await q(`delete from public.user_roles where user_id = $1`, [userId]).catch(() => undefined);
      await q(`delete from public.profiles where user_id = $1`, [userId]).catch(() => undefined);
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best-effort
      }
    }
    for (const roleId of [created.senderRoleId, created.viewerRoleId]) {
      if (!roleId) continue;
      await q(`delete from public.role_permissions where role_id = $1`, [roleId]).catch(
        () => undefined,
      );
      await q(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
    }
    for (const companyId of [created.companyA, created.companyB]) {
      if (!companyId) continue;
      await q(`delete from public.company_feature_overrides where company_id = $1`, [
        companyId,
      ]).catch(() => undefined);
      await q(`delete from public.companies where id = $1 and name like $2`, [
        companyId,
        `${PREFIX}%`,
      ]).catch(() => undefined);
    }
  } catch (error) {
    console.warn("cleanup warning:", error?.message ?? error);
  }
}

try {
  // ── Environment ────────────────────────────────────────────────────
  const health = await fetch(`${API_SERVER}/api/health`);
  assert.equal(health.status, 200);
  pass("api_server_local", `${API_SERVER}/api/health → 200`);

  const login = await fetch("http://127.0.0.1:5173/");
  assert.ok(login.status >= 200 && login.status < 500);
  pass("login_app_local", `http://127.0.0.1:5173 → ${login.status}`);

  assert.equal(process.env.VALUEOR_ENV, "local");
  const outboundPermitted = isLocalExternalOutboundPermitted();
  pass(
    "outbound_gate_profile",
    outboundPermitted
      ? "LOCAL + LOCAL_INTEGRATION_ENABLED + ALLOW_LOCAL_EXTERNAL_OUTBOUND=1 → permitted (will NOT use real customer endpoints; disposable only)"
      : "LOCAL outbound blocked unless both integration flags set",
  );

  const tools = await q(
    `select key, required_permissions::text as perms from public.tool_definitions
     where key = any($1::text[]) order by key`,
    [[CREATE_DRAFT_QUOTE_TOOL_KEY, REQUEST_SEND_QUOTE_TOOL_KEY, GET_QUOTE_DELIVERY_STATUS_TOOL_KEY]],
  );
  assert.equal(tools.rowCount, 3);
  const byKey = Object.fromEntries(tools.rows.map((r) => [r.key, JSON.parse(r.perms)]));
  assert.ok(!byKey[CREATE_DRAFT_QUOTE_TOOL_KEY].includes("quotes.send"));
  assert.ok(!byKey[REQUEST_SEND_QUOTE_TOOL_KEY].includes("quotes.send"));
  pass("tool_permissions_no_direct_send", JSON.stringify(byKey));

  // ── Fixtures ───────────────────────────────────────────────────────
  await q(`select set_config('vault.provisioning_bootstrap', 'true', true)`);
  created.companyA = (
    await q(
      `insert into public.companies (
         name, status, subscription_plan, subscription_status, company_type,
         approval_status, approval_requested_at, tenant_provisioning_status, contact_email
       ) values ($1, 'Active', 'Pro', 'active', 'demo',
         'approved', now(), 'completed', $2)
       returning id`,
      [`${PREFIX}_A`, `${PREFIX}.a@valueor-test.local`],
    )
  ).rows[0].id;
  created.companyB = (
    await q(
      `insert into public.companies (
         name, status, subscription_plan, subscription_status, company_type,
         approval_status, approval_requested_at, tenant_provisioning_status, contact_email
       ) values ($1, 'Active', 'Pro', 'active', 'demo',
         'approved', now(), 'completed', $2)
       returning id`,
      [`${PREFIX}_B`, `${PREFIX}.b@valueor-test.local`],
    )
  ).rows[0].id;

  // Company-scoped roles (user_roles + role_permissions) are required for has_company_permission.
  created.userSend = await createUser(
    `${PREFIX}.send@valueor-test.local`,
    created.companyA,
    "admin",
  );
  created.userNoSend = await createUser(
    `${PREFIX}.nosend@valueor-test.local`,
    created.companyA,
    "employee",
  );

  const senderRoleId = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'E2E sender with quotes.send', false, 'DEFAULT', 'admin')
       returning id`,
      [created.companyA, `${PREFIX} Sender`],
    )
  ).rows[0].id;
  const viewerRoleId = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'E2E viewer without quotes.send', false, 'CUSTOM', null)
       returning id`,
      [created.companyA, `${PREFIX} Viewer`],
    )
  ).rows[0].id;

  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('quotes.view','quotes.create','quotes.edit','quotes.send')`,
    [senderRoleId],
  );
  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p where p.code = 'quotes.view'`,
    [viewerRoleId],
  );
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    created.userSend,
    senderRoleId,
  ]);
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    created.userNoSend,
    viewerRoleId,
  ]);
  created.senderRoleId = senderRoleId;
  created.viewerRoleId = viewerRoleId;

  // Commercial gate: quotes.send is mapped to opportunities (feature_definition_permissions).
  await q(
    `insert into public.company_feature_overrides (
       company_id, feature_code, override_state, reason, source, is_active, starts_at
     ) values ($1, 'opportunities', 'enabled', $2, 'manual', true, now())`,
    [created.companyA, `${PREFIX} e2e enable opportunities`],
  );

  // Sanity: JWT actor must see quotes.send
  {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${await signIn(`${PREFIX}.send@valueor-test.local`)}` } },
    });
    const { data: ok } = await userClient.rpc("has_company_permission", {
      p_company_id: created.companyA,
      p_code: "quotes.send",
    });
    assert.equal(ok, true, "sender must have quotes.send after role+feature grant");
  }

  const qReject = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} reject`);
  created.quoteReject = qReject.id;
  await setPendingRequest(qReject.id, created.companyA, created.userSend);

  const qApprove = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} approve`);
  created.quoteApprove = qApprove.id;
  await setPendingRequest(qApprove.id, created.companyA, created.userSend);

  const qB = await insertDraftQuote(created.companyB, created.userSend, `${PREFIX} other co`);
  created.quoteB = qB.id;
  await setPendingRequest(qB.id, created.companyB, created.userSend);

  pass("disposable_fixtures", `A=${created.companyA} B=${created.companyB}`);

  const tokenSend = await signIn(`${PREFIX}.send@valueor-test.local`);
  const tokenNoSend = await signIn(`${PREFIX}.nosend@valueor-test.local`);
  pass("auth_tokens", "send + nosend JWTs issued");

  // ── API: list + permissions + tenant ───────────────────────────────
  const forbidden = await apiPost("/quotes/send-requests", tokenNoSend, {
    companyId: created.companyA,
  });
  assert.ok(forbidden.status === 403 || forbidden.status === 401);
  pass("api_forbidden_without_quotes_send", `status=${forbidden.status}`);

  const listed = await apiPost("/quotes/send-requests", tokenSend, {
    companyId: created.companyA,
  });
  assert.equal(listed.status, 200, JSON.stringify(listed.json));
  const items = listed.json?.items ?? [];
  assert.ok(items.some((i) => i.quoteId === created.quoteReject));
  assert.ok(items.some((i) => i.quoteId === created.quoteApprove));
  assert.ok(!items.some((i) => i.quoteId === created.quoteB), "must not leak company B");
  assert.ok(items.every((i) => i.sent === false && i.deliveryState === "pending_human_approval"));
  pass("api_list_tenant_isolation", `count=${items.length}; no company B`);

  // ── Reject: no send attempts ───────────────────────────────────────
  const beforeAttempts = await q(
    `select count(*)::int as n from public.quote_send_attempts where quote_id = $1`,
    [created.quoteReject],
  );
  const rejected = await apiPost("/quotes/send-requests/reject", tokenSend, {
    companyId: created.companyA,
    quoteId: created.quoteReject,
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.json));
  assert.equal(rejected.json?.sent, false);
  const afterAttempts = await q(
    `select count(*)::int as n from public.quote_send_attempts where quote_id = $1`,
    [created.quoteReject],
  );
  assert.equal(afterAttempts.rows[0].n, beforeAttempts.rows[0].n);
  const rejectMeta = await q(`select metadata from public.quotes where id = $1`, [
    created.quoteReject,
  ]);
  assert.equal(rejectMeta.rows[0].metadata?.aiSendRequest?.status, "rejected");
  pass("api_reject_no_send", "metadata rejected; no new quote_send_attempts");

  // Forbidden reject
  const rejectDenied = await apiPost("/quotes/send-requests/reject", tokenNoSend, {
    companyId: created.companyA,
    quoteId: created.quoteApprove,
  });
  assert.ok(rejectDenied.status === 403 || rejectDenied.status === 401);
  pass("api_reject_forbidden", `status=${rejectDenied.status}`);

  // ── Approve path → QuoteSendService only (expect channel failure, not silent sent) ──
  const approveDenied = await apiPost("/quotes/send-requests/approve", tokenNoSend, {
    companyId: created.companyA,
    quoteId: created.quoteApprove,
    channel: "email",
    idempotencyKey: randomUUID(),
  });
  assert.ok(approveDenied.status === 403 || approveDenied.status === 401);
  pass("api_approve_forbidden", `status=${approveDenied.status}`);

  const approveRes = await apiPost("/quotes/send-requests/approve", tokenSend, {
    companyId: created.companyA,
    quoteId: created.quoteApprove,
    channel: "email",
    idempotencyKey: randomUUID(),
  });
  // Disposable company has no email channel → QuoteSendService error (not a silent success).
  // Or LOCAL_OUTBOUND_BLOCKED if flags off. Either way must NOT claim sent.
  const quoteAfter = await q(`select status, metadata from public.quotes where id = $1`, [
    created.quoteApprove,
  ]);
  assert.notEqual(quoteAfter.rows[0].status, "sent");
  if (approveRes.status >= 400) {
    assert.notEqual(approveRes.json?.status, "sent");
    const metaStatus = quoteAfter.rows[0].metadata?.aiSendRequest?.status;
    assert.ok(
      metaStatus === "approved_failed" || metaStatus === "pending_human_approval",
      `unexpected meta ${metaStatus}`,
    );
    pass(
      "api_approve_via_QuoteSendService_not_sent",
      `http=${approveRes.status} code=${approveRes.json?.error ?? "n/a"} quoteStatus=${quoteAfter.rows[0].status} request=${metaStatus} (channel/outbound failure — NOT a live customer send)`,
    );
  } else {
    // Unexpected success would mean a provider accepted the message — still must be disposable.
    assert.equal(approveRes.json?.sent === true, approveRes.json?.status === "sent");
    pass(
      "api_approve_via_QuoteSendService_not_sent",
      `UNEXPECTED success path status=${approveRes.json?.status} — verify no real recipient (disposable only)`,
    );
  }

  // Duplicate approve after resolution
  const approveAgain = await apiPost("/quotes/send-requests/approve", tokenSend, {
    companyId: created.companyA,
    quoteId: created.quoteApprove,
    channel: "email",
    idempotencyKey: randomUUID(),
  });
  assert.ok(approveAgain.status >= 400);
  pass("api_duplicate_approve_blocked", `status=${approveAgain.status} code=${approveAgain.json?.error}`);

  // Cross-company approve
  const cross = await apiPost("/quotes/send-requests/approve", tokenSend, {
    companyId: created.companyA,
    quoteId: created.quoteB,
    channel: "email",
    idempotencyKey: randomUUID(),
  });
  assert.ok(cross.status === 404 || cross.status === 403 || cross.status >= 400);
  const bStatus = await q(`select status from public.quotes where id = $1`, [created.quoteB]);
  assert.equal(bStatus.rows[0].status, "draft");
  pass("api_cross_company_approve_blocked", `status=${cross.status}`);

  // ── In-process mock success (proves approval wiring without live provider) ──
  let sendCalls = 0;
  const mockPorts = createQuoteSendApprovalSupabasePorts(admin);
  // Fresh pending quote for mock path
  const qMock = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} mock`);
  await setPendingRequest(qMock.id, created.companyA, created.userSend);
  const mockApproval = new QuoteSendApprovalService(mockPorts, {
    async send(input) {
      sendCalls += 1;
      assert.equal(input.quoteId, qMock.id);
      assert.equal(input.companyId, created.companyA);
      return {
        attemptId: randomUUID(),
        channel: "email",
        status: "sent",
        recipient: "sink@valueor-test.local",
        conversationId: null,
        externalMessageId: "mock-ext",
        quoteStatus: "sent",
        sentAt: new Date().toISOString(),
        quoteStatusUpdated: true,
        replayed: false,
      };
    },
  });
  const mockResult = await mockApproval.approveAndSend({
    companyId: created.companyA,
    quoteId: qMock.id,
    actorUserId: created.userSend,
    channel: "email",
  });
  assert.equal(sendCalls, 1);
  assert.equal(mockResult.sent, true);
  assert.equal(mockResult.deliveryState, "sent");
  // Concurrent second approve must fail (no pending)
  await assert.rejects(
    () =>
      mockApproval.approveAndSend({
        companyId: created.companyA,
        quoteId: qMock.id,
        actorUserId: created.userSend,
      }),
    (err) => err instanceof QuoteSendError && err.code === "no_pending_send_request",
  );
  pass("mock_approve_QuoteSendService_once", "sent:true from mock only; duplicate blocked");
  await q(`delete from public.quote_line_items where quote_id = $1`, [qMock.id]).catch(() => undefined);
  await q(`delete from public.quotes where id = $1`, [qMock.id]).catch(() => undefined);

  // ── AI requestSendQuote port (never sends) ─────────────────────────
  const deliveryDeps = createQuoteDeliveryCommandDeps(admin);
  const qAi = await insertDraftQuote(created.companyA, created.userSend, `${PREFIX} ai-req`);
  // Minimal conversation stub not required when quoteId provided
  const reqResult = await requestSendQuote(deliveryDeps, {
    companyId: created.companyA,
    userId: created.userSend,
    conversationId: randomUUID(),
    quoteId: qAi.id,
    channel: "email",
  });
  assert.equal(reqResult.ok, true);
  if (reqResult.ok) {
    assert.equal(reqResult.sent, false);
    assert.equal(reqResult.deliveryState, "pending_human_approval");
  }
  const statusResult = await getQuoteDeliveryStatus(deliveryDeps, {
    companyId: created.companyA,
    conversationId: randomUUID(),
    quoteId: qAi.id,
  });
  assert.equal(statusResult.sent, false);
  assert.equal(statusResult.deliveryState, "pending_human_approval");
  pass("ai_request_send_quote_no_dispatch", "pending_human_approval; sent:false");
  await q(`delete from public.quote_line_items where quote_id = $1`, [qAi.id]).catch(() => undefined);
  await q(`delete from public.quotes where id = $1`, [qAi.id]).catch(() => undefined);

  // Guard still throws when flags cleared (documentation of behavior)
  const snapAllow = process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND;
  const snapInt = process.env.LOCAL_INTEGRATION_ENABLED;
  process.env.VALUEOR_ENV = "local";
  delete process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND;
  delete process.env.LOCAL_INTEGRATION_ENABLED;
  assert.throws(() => assertLocalExternalOutboundAllowed("quotes/send-requests/approve"));
  process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND = snapAllow;
  process.env.LOCAL_INTEGRATION_ENABLED = snapInt;
  pass("outbound_guard_blocks_without_flags", "LOCAL_OUTBOUND_BLOCKED when flags absent");
} catch (error) {
  fail("verify_aborted", error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  await pgClient.end();
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        kind: "local_quote_delivery_e2e",
        database: "127.0.0.1:54322",
        supabase: supabaseUrl,
        apiServer: API_SERVER,
        loginApp: "http://127.0.0.1:5173",
        outboundPermittedAtStart: isLocalExternalOutboundPermitted(),
        liveCustomerSend: false,
        deliveryMode:
          "HTTP approve exercised QuoteSendService against disposable company without channels (expect channel/outbound failure). Success path proven with in-process mock QuoteSendService only — NOT a live provider send.",
        browserE2E: false,
        passed: results.filter((r) => r.pass).length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
}
