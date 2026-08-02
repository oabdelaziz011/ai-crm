/**
 * Raw PostgREST probe for listConversations pipeline audit.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const DEMO = "d0000010-0001-4001-8001-000000000002";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function probe(companyId, label) {
  const { data, error, count, status } = await sb
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, 49);

  const ids = (data ?? []).map((r) => r.id);
  const idx = ids.indexOf(TARGET_ID);
  return {
    label,
    companyId,
    status,
    error: error?.message ?? null,
    responseCount: count ?? null,
    dataLength: (data ?? []).length,
    first10Ids: ids.slice(0, 10),
    targetInRawData: idx >= 0,
    targetIndex: idx >= 0 ? idx : null,
  };
}

const results = await Promise.all([probe(VAULTOS, "VaultOS"), probe(DEMO, "DemoBeta")]);
console.log("[OMNI_LIST_PIPELINE] rawSupabase.probe", JSON.stringify(results, null, 2));
