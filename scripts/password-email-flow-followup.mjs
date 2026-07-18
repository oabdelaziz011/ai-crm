import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2];
      }
    } catch {}
  }
  return env;
}

async function main() {
  const keytar = require("keytar");
  const entries = await keytar.findCredentials("Supabase CLI");
  let token = "";
  for (const entry of entries) {
    const raw = entry.password ?? "";
    token = raw.startsWith("go-keyring-base64:")
      ? Buffer.from(raw.slice("go-keyring-base64:".length), "base64").toString("utf8").trim()
      : raw.trim();
    if (token) break;
  }
  if (!token) throw new Error("no mgmt token");

  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const end = new Date().toISOString();

  const authCfg = await fetch("https://api.supabase.com/v1/projects/lfbtnskmvibikalsxwsm/config/auth", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const sql = `select timestamp, event_message, metadata from auth_logs where timestamp >= '${since}' and timestamp <= '${end}' order by timestamp desc limit 30`;
  const logs = await fetch(
    `https://api.supabase.com/v1/projects/lfbtnskmvibikalsxwsm/analytics/endpoints/logs.all?${new URLSearchParams({ sql, iso_timestamp_start: since, iso_timestamp_end: end })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());

  const { createClient } = await import(
    pathToFileURL(resolve(root, "artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs")).href
  );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
  const accessToken = signIn.data.session?.access_token;
  const inviteEmail = `oabdelaziz011+e2e${Date.now()}@gmail.com`;
  const redirectLocalhost = "http://localhost:5173/auth/callback?next=%2Freset-password";
  const redirectAllowed = "http://192.168.1.10:5173/auth/callback?next=%2Freset-password";

  const { data: companies } = await client.from("companies").select("id").limit(1);
  const { data: roles } = await client.from("roles").select("id, name").limit(5);
  const baseBody = {
    fullName: "E2E Invite Test 3",
    companyId: companies?.[0]?.id,
    roleId: roles?.find((r) => r.name?.toLowerCase().includes("employee"))?.id ?? roles?.[0]?.id,
    isActive: true,
  };

  async function invokeInvite(email, redirectTo) {
    const body = { ...baseBody, email, redirectTo };
    const res = await fetch(`${url}/functions/v1/provision-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = text;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, request: body, response: json };
  }

  const inviteLocalhost = await invokeInvite(`oabdelaziz011+e2eL${Date.now()}@gmail.com`, redirectLocalhost);
  const inviteAllowed = await invokeInvite(`oabdelaziz011+e2eA${Date.now()}@gmail.com`, redirectAllowed);

  console.log(JSON.stringify({ auth_config: {
    site_url: authCfg.site_url,
    uri_allow_list: authCfg.uri_allow_list,
    smtp_host: authCfg.smtp_host,
    rate_limit_email_sent: authCfg.rate_limit_email_sent,
    audit_log_disable_postgres: authCfg.audit_log_disable_postgres,
  }, auth_logs: logs, invite_localhost_redirect: inviteLocalhost, invite_allowed_redirect: inviteAllowed }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
