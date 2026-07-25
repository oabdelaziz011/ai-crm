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

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const redirectTo = "http://localhost:5173/auth/callback?next=/dashboard/inbox";
const { data, error } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: "oabdelaziz011@gmail.com",
  options: { redirectTo },
});

if (error) {
  writeFileSync(resolve(projectRoot, "artifacts/inbox-login-url.txt"), `ERROR: ${error.message}`);
  process.exit(1);
}

const token = data.properties.hashed_token;
const verifyUrl = `[REDACTED]/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;
writeFileSync(resolve(projectRoot, "artifacts/inbox-login-url.txt"), verifyUrl, "utf8");
console.log("ok");
