/**
 * Seed one disposable company + pending AI send request for Browser E2E (Fake Provider).
 * Does NOT cleanup — caller must run cleanup-m427-disposable-local.mjs --prefix m427_brfake_
 *
 *   node --import ./artifacts/api-server/node_modules/tsx/dist/esm/index.mjs ./scripts/seed-quote-delivery-fake-browser-local.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(resolve(__dirname, "../artifacts/api-server/package.json"));
const requireFromDb = createRequire(resolve(__dirname, "../lib/db/package.json"));
const { createClient } = requireFromApi("@supabase/supabase-js");
const pg = requireFromDb("pg");

const { AI_SEND_REQUEST_METADATA_KEY, requestSendQuote } = await import(
  "../lib/ai-tool-router/src/index.ts"
);
const { createQuoteDeliveryCommandDeps } = await import(
  "../artifacts/api-server/src/platform/webhook-quote-agent-ports.ts"
);

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
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

if (isProductionDatabaseUrl(databaseUrl)) throw new Error("Refusing production DATABASE_URL");
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") throw new Error(`Refusing non-local port: ${parsed.port}`);

const stamp = Date.now().toString(36);
const PREFIX = `m427_brfake_${stamp}`;
const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();
const q = (sql, params) => c.query(sql, params);
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  await q(`select set_config('vault.provisioning_bootstrap', 'true', true)`);
  const email = `${PREFIX}.send@valueor-test.local`;
  const password = `Tmp_${stamp}_Aa1!`;

  const companyId = (
    await q(
      `insert into public.companies (
         name, status, subscription_plan, subscription_status, company_type,
         approval_status, approval_requested_at, tenant_provisioning_status, contact_email
       ) values ($1, 'Active', 'Pro', 'active', 'demo', 'approved', now(), 'completed', $2)
       returning id`,
      [`${PREFIX}_A`, email],
    )
  ).rows[0].id;

  const auth = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = auth.data.user.id;

  await q(
    `insert into public.profiles (
       id, user_id, company_id, full_name, email, role, is_active, preferred_language, is_super_admin
     ) values ($1, $1, $2, $3, $4, 'admin', true, 'en', false)
     on conflict (id) do update set company_id = $2, role = 'admin', email = excluded.email, is_active = true`,
    [userId, companyId, "Browser Fake E2E", email],
  );

  const roleId = (
    await q(
      `insert into public.roles (company_id, name, description, is_system, role_type, template_key)
       values ($1, $2, 'browser fake e2e', false, 'DEFAULT', 'admin') returning id`,
      [companyId, `${PREFIX} Sender`],
    )
  ).rows[0].id;

  await q(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('quotes.view','quotes.create','quotes.edit','quotes.send')`,
    [roleId],
  );
  await q(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [userId, roleId]);
  await q(
    `insert into public.company_feature_overrides (
       company_id, feature_code, override_state, reason, source, is_active, starts_at
     ) values ($1, 'opportunities', 'enabled', $2, 'manual', true, now())`,
    [companyId, `${PREFIX} fake`],
  );

  const quoteId = randomUUID();
  await q(
    `insert into public.quotes (
       id, company_id, quote_family_id, quote_number, title, status, currency, language, contact_name,
       subtotal, discount_total, tax_total, shipping_total, grand_total,
       is_current, version_number, metadata, created_by, updated_by
     ) values (
       $1, $2, $1, $3, $4, 'draft', 'EGP', 'en', $5,
       100, 0, 0, 0, 100, true, 1, '{}'::jsonb, $6, $6
     )`,
    [quoteId, companyId, `Q-BR-${stamp}`, `${PREFIX} browser approve`, `${PREFIX} Contact`, userId],
  );
  await q(
    `insert into public.quote_line_items (
       company_id, quote_id, line_kind, product_name_snapshot, quantity, unit_price,
       discount_amount, tax_amount, subtotal, total, sort_order, currency
     ) values ($1, $2, 'manual', $3, 1, 100, 0, 0, 100, 100, 0, 'EGP')`,
    [companyId, quoteId, `${PREFIX} Line`],
  );

  const deps = createQuoteDeliveryCommandDeps(admin);
  const aiResult = await requestSendQuote(deps, {
    companyId,
    userId,
    conversationId: randomUUID(),
    quoteId,
    channel: "email",
  });
  if (!aiResult.ok || aiResult.deliveryState !== "pending_human_approval") {
    throw new Error(`requestSendQuote failed: ${JSON.stringify(aiResult)}`);
  }

  const out = {
    prefix: "m427_brfake_",
    stamp,
    companyId,
    userId,
    quoteId,
    quoteNumber: `Q-BR-${stamp}`,
    email,
    password,
    loginUrl: "http://127.0.0.1:5173",
    sendRequestsUrl: "http://127.0.0.1:5173/dashboard/quotes/send-requests",
    aiSendRequestKey: AI_SEND_REQUEST_METADATA_KEY,
    deliveryState: aiResult.deliveryState,
    fakeProviderRequired: true,
  };
  const outPath = resolve(root, "artifacts/login-app/.verification-screenshots/_tmp-quote-fake-browser-seed.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, ...out }, null, 2));
} finally {
  await c.end();
}
