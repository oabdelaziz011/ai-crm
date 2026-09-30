/**
 * Security tests A–J: Suspended + Expired subscription lock (LOCAL ONLY).
 * Run: node scripts/test-suspended-expired-access-control.mjs
 *
 * Covers:
 * A Active → normal access
 * B Suspended+Expired → business API/PostgREST denied
 * C/D Session + login path (auth still works; data locked)
 * E Billing admin → checkout allowed
 * F Employee → checkout denied
 * G Renewal → Active + access restored
 * H Cross-company billing denied
 * I Direct API bypass denied
 * J Payment webhook reachable
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.localstack"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const API = (env.VITE_API_SERVER_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const PASS = "DemoVault2026!";
const ALPHA = "d0000010-0001-4001-8001-000000000001";
const BETA = "d0000010-0001-4001-8001-000000000002";

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

async function login(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`${email}: ${error.message}`);
  return {
    token: data.session.access_token,
    userId: data.user.id,
    client: createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { persistSession: false },
    }),
  };
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: res.status, json, text: text.slice(0, 240) };
}

const pgClient = new pg.Client({ connectionString: env.DATABASE_URL, ssl: false });
await pgClient.connect();

async function setAlpha(mode) {
  await pgClient.query("begin");
  await pgClient.query("alter table public.company_subscriptions disable trigger user");
  await pgClient.query("alter table public.companies disable trigger user");
  if (mode === "expired") {
    await pgClient.query(
      `update public.company_subscriptions set status='expired',
       current_period_start=now()-interval '40 days', current_period_end=now()-interval '8 days',
       grace_period_ends_at=now()-interval '1 day', next_renewal_at=null, updated_at=now()
       where company_id=$1`,
      [ALPHA],
    );
    await pgClient.query(
      `update public.companies set status='Suspended', subscription_status='expired',
       suspension_reason='Subscription payment not received after the payment window ended.',
       updated_at=now() where id=$1`,
      [ALPHA],
    );
  } else {
    await pgClient.query(
      `update public.company_subscriptions set status='active',
       current_period_start=now()-interval '5 days', current_period_end=now()+interval '25 days',
       grace_period_ends_at=null, next_renewal_at=now()+interval '25 days', updated_at=now()
       where company_id=$1`,
      [ALPHA],
    );
    await pgClient.query(
      `update public.companies set status='Active', subscription_status='active',
       suspension_reason=null, updated_at=now() where id=$1`,
      [ALPHA],
    );
  }
  await pgClient.query("alter table public.company_subscriptions enable trigger user");
  await pgClient.query("alter table public.companies enable trigger user");
  await pgClient.query("commit");
}

try {
  // Ensure customer row exists
  const owner = await pgClient.query(
    `select id from public.profiles where email='demo-alpha-admin@vaultos.local' limit 1`,
  );
  await pgClient.query(
    `insert into public.customers (company_id, user_id, name, email)
     select $1, $2, 'AUDIT Lock Customer', 'audit-lock@vaultos.local'
     where not exists (select 1 from public.customers where company_id=$1 and email='audit-lock@vaultos.local')`,
    [ALPHA, owner.rows[0].id],
  );

  // ── A: Active → normal access ───────────────────────────────────
  await setAlpha("active");
  let admin = await login("demo-alpha-admin@vaultos.local");
  let cust = await admin.client.from("customers").select("id").eq("company_id", ALPHA).limit(3);
  check("A.active_customers_readable", (cust.data || []).length > 0 && !cust.error, {
    n: (cust.data || []).length,
    err: cust.error?.message,
  });
  const featActive = await admin.client.rpc("is_feature_enabled", {
    p_company_id: ALPHA,
    p_feature_code: "customers",
  });
  check("A.active_customers_feature", featActive.data === true, featActive.data);

  // ── B: Suspended+Expired → business denied ──────────────────────
  await setAlpha("expired");
  admin = await login("demo-alpha-admin@vaultos.local");
  const unlocked = await admin.client.rpc("company_workspace_unlocked", { p_company_id: ALPHA });
  check("B.workspace_unlocked_false", unlocked.data === false, unlocked.data);

  const featSusp = await admin.client.rpc("is_feature_enabled", {
    p_company_id: ALPHA,
    p_feature_code: "customers",
  });
  check("B.customers_feature_denied", featSusp.data === false, featSusp.data);

  cust = await admin.client.from("customers").select("id,name").eq("company_id", ALPHA).limit(5);
  check("B.postgrest_customers_denied", (cust.data || []).length === 0 && !cust.error, {
    n: (cust.data || []).length,
    err: cust.error?.message,
  });

  const tickets = await admin.client.from("support_tickets").select("id").eq("company_id", ALPHA).limit(3);
  check("B.postgrest_support_tickets_denied", (tickets.data || []).length === 0 && !tickets.error, {
    n: (tickets.data || []).length,
    err: tickets.error?.message,
  });

  const wa = await api(admin.token, "POST", "/api/whatsapp/test-message", {
    companyId: ALPHA,
    recipientPhone: "+10000000099",
  });
  check(
    "B.api_whatsapp_denied",
    wa.status === 403 && (wa.json?.error === "COMPANY_SUSPENDED" || wa.json?.error === "FEATURE_NOT_ENTITLED"),
    { status: wa.status, error: wa.json?.error },
  );

  // ── C/D: Auth session still works; lock is data-plane ───────────
  const me = await admin.client.from("profiles").select("id,company_id").eq("company_id", ALPHA).limit(1);
  check("C.session_profile_readable", (me.data || []).length === 1, { n: (me.data || []).length });
  const sub = await admin.client
    .from("company_subscriptions")
    .select("status")
    .eq("company_id", ALPHA)
    .maybeSingle();
  check("D.subscription_readable_for_renew_ui", sub.data?.status === "expired", sub.data);

  // ── E: Billing admin checkout allowed ───────────────────────────
  const checkout = await api(admin.token, "POST", "/api/billing/saas/checkout", {
    companyId: ALPHA,
    returnUrl: "http://localhost:5173/dashboard?payment_return=1&sandbox=1",
    cancelUrl: "http://localhost:5173/dashboard?payment_return=1&sandbox=1",
    idempotencyKey: `sec-e-${Date.now()}`,
  });
  check("E.billing_admin_checkout_allowed", checkout.status === 200 && checkout.json?.ok === true, {
    status: checkout.status,
    sessionId: checkout.json?.sessionId,
  });

  // ── F: Employee cannot checkout (no billing.manage_own) ─────────
  // Temporarily point demo-employee at Alpha without billing perms.
  const empProf = await pgClient.query(
    `select id, company_id from public.profiles where email='demo-employee@vaultos.local' limit 1`,
  );
  const empId = empProf.rows[0].id;
  const empOrigCompany = empProf.rows[0].company_id;
  await pgClient.query(`update public.profiles set company_id=$1 where id=$2`, [ALPHA, empId]);
  try {
    const emp = await login("demo-employee@vaultos.local");
    const empCheckout = await api(emp.token, "POST", "/api/billing/saas/checkout", {
      companyId: ALPHA,
      returnUrl: "http://localhost:5173/dashboard?payment_return=1",
      idempotencyKey: `sec-f-${Date.now()}`,
    });
    const denied =
      empCheckout.status === 403 ||
      empCheckout.status === 400 ||
      empCheckout.json?.code === "UNAUTHORIZED_CHECKOUT" ||
      empCheckout.json?.error === "UNAUTHORIZED_CHECKOUT";
    check("F.employee_checkout_denied", denied, {
      status: empCheckout.status,
      error: empCheckout.json?.error ?? empCheckout.json?.code,
      text: empCheckout.text,
    });
  } finally {
    await pgClient.query(`update public.profiles set company_id=$1 where id=$2`, [empOrigCompany, empId]);
  }

  // ── H: Cross-company denied ─────────────────────────────────────
  const cross = await api(admin.token, "POST", "/api/billing/saas/checkout", {
    companyId: BETA,
    returnUrl: "http://localhost:5173/dashboard?payment_return=1",
    idempotencyKey: `sec-h-${Date.now()}`,
  });
  check("H.cross_company_checkout_denied", cross.status === 403, {
    status: cross.status,
    error: cross.json?.error,
  });

  // ── I: Direct business API bypass denied ────────────────────────
  const sms = await api(admin.token, "POST", "/api/sms/test-connection", { companyId: ALPHA });
  check(
    "I.sms_api_denied",
    sms.status === 403 &&
      (sms.json?.error === "COMPANY_SUSPENDED" || sms.json?.error === "FEATURE_NOT_ENTITLED"),
    { status: sms.status, error: sms.json?.error },
  );

  // ── J: Webhooks reachable (not 404) ─────────────────────────────
  const wh = await fetch(`${API}/api/billing/saas/webhook/sandbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check("J.webhook_sandbox_reachable", wh.status !== 404, { status: wh.status });

  // ── G: Renewal restores access ──────────────────────────────────
  const sessionId = checkout.json?.sessionId;
  if (sessionId) {
    const confirm = await api(admin.token, "POST", "/api/billing/saas/sandbox-confirm", { sessionId });
    check("G.sandbox_confirm_ok", confirm.status === 200 || confirm.status === 201, {
      status: confirm.status,
      text: confirm.text,
    });

    const st = await pgClient.query(
      `select c.status as company_status, cs.status as sub_status
       from public.companies c
       join public.company_subscriptions cs on cs.company_id=c.id
       where c.id=$1`,
      [ALPHA],
    );
    check(
      "G.status_active_after_pay",
      st.rows[0]?.company_status === "Active" && st.rows[0]?.sub_status === "active",
      st.rows[0],
    );

    admin = await login("demo-alpha-admin@vaultos.local");
    cust = await admin.client.from("customers").select("id").eq("company_id", ALPHA).limit(3);
    check("G.customers_readable_after_renew", (cust.data || []).length > 0, {
      n: (cust.data || []).length,
      err: cust.error?.message,
    });
    const featRestored = await admin.client.rpc("is_feature_enabled", {
      p_company_id: ALPHA,
      p_feature_code: "customers",
    });
    check("G.customers_feature_restored", featRestored.data === true, featRestored.data);
  } else {
    check("G.sandbox_confirm_ok", false, "no sessionId from checkout");
    await setAlpha("active");
  }
} catch (err) {
  check("fatal", false, err instanceof Error ? err.message : String(err));
  try {
    await setAlpha("active");
  } catch {
    /* */
  }
} finally {
  await pgClient.end();
}

const fails = results.filter((r) => !r.ok);
const summary = {
  total: results.length,
  pass: results.length - fails.length,
  fail: fails.length,
  fails: fails.map((f) => f.id),
};
writeFileSync(
  resolve(root, "artifacts/login-app/.verification-screenshots/_tmp-suspended-expired-security-tests.json"),
  JSON.stringify({ summary, results }, null, 2),
);
console.log("\nSUMMARY", summary);
process.exitCode = fails.length ? 1 : 0;
