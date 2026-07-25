/**
 * Emit browser localStorage session for demo-platform inbox login.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
const anon = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });

const EMAIL = "demo-platform@vaultos.local";
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) throw linkErr;

const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
  email: EMAIL,
  token: linkData.properties.email_otp,
  type: "magiclink",
});
if (otpErr) throw otpErr;

const storageKey = `sb-${new URL(env.SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const storageValue = JSON.stringify({
  access_token: sessionData.session.access_token,
  refresh_token: sessionData.session.refresh_token,
  expires_at: sessionData.session.expires_at,
  expires_in: sessionData.session.expires_in,
  token_type: sessionData.session.token_type,
  user: sessionData.session.user,
});

writeFileSync(
  resolve(projectRoot, "artifacts/inbox-browser-session.json"),
  JSON.stringify({ storageKey, storageValue, inboxUrl: "http://localhost:5173/dashboard/inbox" }, null, 2),
  "utf8",
);
console.log("wrote artifacts/inbox-browser-session.json");
console.log("storageKey:", storageKey);
