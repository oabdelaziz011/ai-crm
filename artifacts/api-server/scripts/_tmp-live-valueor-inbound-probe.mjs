import { loadProjectEnv } from "../../../scripts/lib/load-project-env.mjs";
import { resolveProjectRoot } from "../../../scripts/lib/supabase-env.mjs";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";
import fs from "node:fs";
import path from "node:path";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url), {
  hydrateProcessEnv: true,
  mergeProcessEnv: true,
});
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const ch = await client.query(
  `select id, channel_type, is_enabled, deleted_at
   from company_channels
   where company_id = $1 and deleted_at is null`,
  [companyId],
);
const s = await client.query(
  `select inbound_provider, imap_host, imap_mailbox, imap_last_uid,
          conversation_enabled, connection_status, connection_last_error,
          last_synced_at, from_email, provider
   from company_email_settings where company_id = $1`,
  [companyId],
);
const branding = await client.query(
  `select email_logo_url,
          left(coalesce(email_signature_html,''), 180) as sig_html_preview,
          left(coalesce(email_signature_text,''), 120) as sig_text_preview
   from company_email_branding where company_id = $1`,
  [companyId],
);

const channelId = ch.rows[0]?.id ?? null;
const probes = {};
if (channelId) {
  const base = "http://127.0.0.1:3000";
  for (const [name, init] of [
    ["health", () => fetch(`${base}/api/healthz`)],
    ["provider_errors", () => fetch(`${base}/api/email/provider-errors`)],
    [
      "webhook_probe",
      () =>
        fetch(`${base}/api/webhooks/email/${channelId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ probe: true }),
        }),
    ],
  ]) {
    try {
      const res = await init();
      probes[name] = { status: res.status, ok: res.ok };
    } catch (e) {
      probes[name] = { error: String(e?.message || e) };
    }
  }
}

const out = {
  companyId,
  channels: ch.rows,
  settings: s.rows[0] ?? null,
  branding: branding.rows[0] ?? null,
  probes,
  verdict:
    s.rows[0]?.inbound_provider === "imap" && s.rows[0]?.imap_host
      ? "LIVE_INBOUND_POSSIBLE_VIA_IMAP"
      : "NO_LIVE_INBOUND",
};
const outPath = path.resolve(
  process.cwd(),
  "../login-app/.verification-screenshots/_tmp-live-valueor-inbound-probe.json",
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await client.end();
