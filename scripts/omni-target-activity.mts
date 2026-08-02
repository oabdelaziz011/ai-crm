import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data } = await sb
  .from("conversations")
  .select("id,conversation_number,last_message_at,updated_at,metadata,channel_type")
  .eq("company_id", VAULTOS)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, 49);

const target = data?.find((r) => r.id === TARGET_ID);
const activity = (r: { last_message_at: string | null; updated_at: string | null }) =>
  r.last_message_at ?? r.updated_at;

console.log(
  JSON.stringify(
    {
      target: {
        number: target?.conversation_number,
        last_message_at: target?.last_message_at,
        updated_at: target?.updated_at,
        clientLastActivityAt: target ? activity(target) : null,
        pinned: target?.metadata?.pinned === true,
      },
      sqlRank1: data?.[0]
        ? {
            id: data[0].id,
            number: data[0].conversation_number,
            last_message_at: data[0].last_message_at,
          }
        : null,
    },
    null,
    2,
  ),
);
