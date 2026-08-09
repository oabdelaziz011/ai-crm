import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

const { supabase } = await import("../src/lib/supabase.ts");
const { error } = await supabase.auth.signInWithPassword({
  email: "demo-platform@vaultos.local",
  password: "DemoVault2026!",
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
const { data: sess } = await supabase.auth.getSession();
const payload = {
  storageKey: "sb-lfbtnskmvibikalsxwsm-auth-token",
  session: sess.session,
};
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-export.json"), JSON.stringify(payload));
console.log("SESSION_EXPORT_OK");
