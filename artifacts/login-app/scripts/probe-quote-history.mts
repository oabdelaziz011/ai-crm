import { readFileSync } from "node:fs";
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

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const oppId = process.argv[2] ?? "919b1f5c-9208-4bd8-8c4e-5b65883cb2ec";

const { data, error } = await sb
  .from("opportunity_history")
  .select("id,event_type,field_name,previous_value,new_value,summary,payload,actor_user_id,created_at")
  .eq("opportunity_id", oppId)
  .like("event_type", "quote%")
  .order("created_at", { ascending: true });

console.log(JSON.stringify({ quoteHistory: data, error }, null, 2));
