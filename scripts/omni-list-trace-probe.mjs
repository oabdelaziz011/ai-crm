/**
 * Probe listConversations Supabase query for CNV-000010 (VaultOS).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PAGE_SIZE = 50;

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

const filters = {
  companyId: VAULTOS,
  searchQuery: undefined,
  state: undefined,
  assignedUserId: undefined,
  archived: false,
  channelType: undefined,
  pageSize: PAGE_SIZE,
  page: 0,
  offset: 0,
  deletedAt: "IS NULL",
  orderBy: "last_message_at DESC NULLS LAST, created_at DESC",
};

console.log("[OMNI_LIST] probe.filters", JSON.stringify(filters, null, 2));

const { data, error, status, statusText } = await sb
  .from("conversations")
  .select("*")
  .eq("company_id", VAULTOS)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, PAGE_SIZE - 1);

const target = (data ?? []).find((r) => r.id === TARGET_ID);
console.log("[OMNI_LIST] probe.raw_response", {
  status,
  statusText,
  error: error?.message ?? null,
  rowCount: data?.length ?? 0,
  targetPresent: Boolean(target),
  targetIndex: target ? data.findIndex((r) => r.id === TARGET_ID) : -1,
});

if (target) {
  console.log("[OMNI_LIST] probe.target_object", JSON.stringify(target, null, 2));
} else {
  console.log("[OMNI_LIST] probe.target_missing — not in first page for VaultOS with default filters");
  const direct = await sb.from("conversations").select("*").eq("id", TARGET_ID).maybeSingle();
  console.log("[OMNI_LIST] probe.direct_by_id", direct.data ? JSON.stringify(direct.data, null, 2) : direct.error?.message ?? "NOT FOUND");
}
