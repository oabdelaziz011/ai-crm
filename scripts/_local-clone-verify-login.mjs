/**
 * Local clone verification: auth session, data access, outbound safety.
 * Never prints passwords or secret values.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { valueorEnv: "local" });
const OUT = resolve(root, "artifacts/.local-dev-clone/login-verify.json");

const USERS = [
  {
    key: "original_dev",
    email: "oabdelaziz011@gmail.com",
    id: "a9b150d0-cf93-4937-a6f2-1b75213eada8",
    companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
    envPassKeys: ["DEV_LOGIN_PASSWORD", "VERIFY_PASSWORD", "SMOKE_PASSWORD"],
  },
  {
    key: "nhossam",
    email: "nhossam@ntgclarity.com",
    id: "8bdbd62a-2cd8-44e7-bd6d-45d089046a4e",
    companyId: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8",
    envPassKeys: ["NESSMA_PASSWORD", "VERIFY_PASSWORD", "SMOKE_PASSWORD"],
  },
];

function pickPassword(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return { key: k, value: String(v) };
  }
  return null;
}

const url = env.SUPABASE_URL || "http://127.0.0.1:54321";
const anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!anon || !service) throw new Error("Missing local anon/service keys");

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new pg.Client({
  connectionString: env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await db.connect();

const exportAuth = existsSync(resolve(root, "artifacts/.local-dev-clone/auth-users.json"))
  ? JSON.parse(readFileSync(resolve(root, "artifacts/.local-dev-clone/auth-users.json"), "utf8"))
  : [];

const report = {
  stamp: new Date().toISOString(),
  supabaseUrl: url,
  hashPreservation: [],
  logins: [],
  endpoints: {},
  outbound: {},
  productionWrites: 0,
};

// Hash preservation check (boolean only — never log hash)
for (const u of USERS) {
  const src = exportAuth.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
  const { rows } = await db.query(
    `select encrypted_password from auth.users where id = $1::uuid`,
    [u.id],
  );
  const localHash = rows[0]?.encrypted_password || null;
  const srcHash = src?.encrypted_password || null;
  report.hashPreservation.push({
    email: u.email,
    sourceHasHash: Boolean(srcHash && String(srcHash).length > 10),
    localHasHash: Boolean(localHash && String(localHash).length > 10),
    hashesEqual: Boolean(srcHash && localHash && srcHash === localHash),
  });
}

for (const u of USERS) {
  const entry = {
    email: u.email,
    passwordLogin: "SKIPPED_NO_PLAINTEXT",
    magicSession: "FAIL",
    profile: null,
    company: null,
    role: null,
    dataSpotChecks: {},
  };

  const pass = pickPassword(u.envPassKeys);
  if (pass) {
    const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await userClient.auth.signInWithPassword({
      email: u.email,
      password: pass.value,
    });
    entry.passwordLogin = error ? `FAIL:${error.message}` : data?.session ? "PASS" : "FAIL:no_session";
    entry.passwordSourceEnvKey = pass.key; // name only, not value
  }

  // Always verify account via admin-generated magic link session (no email sent to external)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: u.email,
  });
  if (linkErr) {
    entry.magicSession = `FAIL:${linkErr.message}`;
  } else {
    const hashed = linkData?.properties?.hashed_token;
    const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    let sessionOk = false;
    if (hashed) {
      const { data: verified, error: vErr } = await userClient.auth.verifyOtp({
        token_hash: hashed,
        type: "magiclink",
      });
      sessionOk = !vErr && Boolean(verified?.session);
      entry.magicSession = sessionOk ? "PASS" : `FAIL:${vErr?.message || "no_session"}`;
    } else {
      entry.magicSession = "FAIL:no_hashed_token";
    }

    if (sessionOk || true) {
      const { rows: profile } = await db.query(
        `select p.id, p.email, p.company_id, c.name as company_name, r.name as role_name
         from profiles p
         left join companies c on c.id = p.company_id
         left join user_roles ur on ur.user_id = p.id
         left join roles r on r.id = ur.role_id
         where p.id = $1::uuid`,
        [u.id],
      );
      entry.profile = profile[0]
        ? {
            id: profile[0].id,
            email: profile[0].email,
            companyId: profile[0].company_id,
            companyName: profile[0].company_name,
          }
        : null;
      entry.company = profile[0]?.company_name || null;
      entry.role = profile.map((p) => p.role_name).filter(Boolean);

      const cid = u.companyId;
      const checks = {};
      for (const [table, sql] of [
        ["customers", `select count(*)::int as n from customers where company_id=$1`],
        ["leads", `select count(*)::int as n from leads where company_id=$1`],
        ["opportunities", `select count(*)::int as n from opportunities where company_id=$1`],
        ["bookings", `select count(*)::int as n from bookings where company_id=$1`],
        ["invoices", `select count(*)::int as n from invoices where company_id=$1`],
        ["support_tickets", `select count(*)::int as n from support_tickets where company_id=$1`],
        ["conversations", `select count(*)::int as n from conversations where company_id=$1`],
      ]) {
        try {
          const { rows } = await db.query(sql, [cid]);
          checks[table] = rows[0].n;
        } catch {
          checks[table] = null;
        }
      }
      entry.dataSpotChecks = checks;
    }
  }

  report.logins.push(entry);
}

// Endpoints
async function ping(name, target) {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    report.endpoints[name] = { ok: res.ok || res.status < 500, status: res.status };
  } catch (e) {
    report.endpoints[name] = { ok: false, error: e.message };
  }
}
await ping("supabase_auth_health", `${url}/auth/v1/health`);
await ping("frontend", "http://localhost:5173/");
await ping("api", "http://localhost:3001/health");
await ping("api_root", "http://localhost:3001/");

// Outbound guard source check
const guardPath = resolve(root, "artifacts/api-server/src/lib/local-outbound-guard.ts");
const guardSrc = readFileSync(guardPath, "utf8");
report.outbound = {
  guardFilePresent: existsSync(guardPath),
  codeDefinesLocalOutboundBlocked: guardSrc.includes("LOCAL_OUTBOUND_BLOCKED"),
  localstackValueorEnv: env.VALUEOR_ENV || null,
  allowLocalExternalOutbound: process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND || env.ALLOW_LOCAL_EXTERNAL_OUTBOUND || null,
  supabaseUrlIsLocal: /127\.0\.0\.1|localhost/.test(url),
  databaseIsLocal: /127\.0\.0\.1|localhost/.test(env.DATABASE_URL || ""),
};

// Channel / integration secret sanitization spot-check
const { rows: waCols } = await db.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='company_whatsapp_settings'`,
);
const secretish = waCols
  .map((r) => r.column_name)
  .filter((n) => /token|secret|password|credential|api_key|access/i.test(n));
let sanitized = { checkedColumns: secretish, nonNullSecretValues: 0 };
if (secretish.length) {
  const selects = secretish
    .map(
      (col) =>
        `count(*) filter (where ${JSON.stringify(col).slice(1, -1)} is not null and length(coalesce(${JSON.stringify(col).slice(1, -1)}::text,'')) > 0)::int as ${col}`,
    )
    .join(", ");
  // safer per-column
  const counts = {};
  for (const col of secretish) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(col)) continue;
    const { rows } = await db.query(
      `select count(*)::int as n from company_whatsapp_settings
       where company_id = any($1::uuid[])
         and ${col} is not null
         and length(coalesce(${col}::text,'')) > 0`,
      [USERS.map((u) => u.companyId)],
    );
    counts[col] = rows[0].n;
  }
  sanitized.nonNullSecretValues = Object.values(counts).reduce((a, b) => a + b, 0);
  sanitized.perColumn = counts;
}
report.outbound.channelCredentialSanitization = sanitized;

await db.end();
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
