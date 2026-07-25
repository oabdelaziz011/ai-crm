import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
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

const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
const candidates = ["oabdelaziz011@gmail.com", "oma@yahoo.com", "hhhfff@yahoo.com"];
const password = "DemoVault2026!";

for (const email of candidates) {
  const client = createClient(env.SUPABASE_URL, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  console.log(email, error ? "FAIL" : "OK");
}
