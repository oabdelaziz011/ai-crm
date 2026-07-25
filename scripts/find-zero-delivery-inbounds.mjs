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

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const SENDER = "201011404109";
const RUN_ID = "f627b887-30ce-4c8b-a772-8be95881a49c";

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, error_message, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z")
  .order("created_at", { ascending: true });

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("created_at, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z");

const byCorr = new Map();
for (const d of deliveries ?? []) {
  const c = d.payload?.correlationId;
  if (!c) continue;
  if (!byCorr.has(c)) byCorr.set(c, 0);
  byCorr.set(c, byCorr.get(c) + 1);
}

console.log("=== ZERO-DELIVERY PROCESSED INBOUNDS ===");
let zeroCount = 0;
for (const i of inbounds ?? []) {
  if (i.processing_status !== "processed") continue;
  const n = byCorr.get(i.id) ?? 0;
  if (n === 0) {
    zeroCount++;
    const msg = i.payload?.message;
    console.log(JSON.stringify({
      id: i.id,
      at: i.created_at,
      text: msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title,
      replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id,
    }));
  }
}
console.log("zero delivery count:", zeroCount, "of", inbounds?.filter((i) => i.processing_status === "processed").length);

// Deliveries for run f627
console.log("\n=== ALL DELIVERIES FOR RUN f627b887 ===");
for (const d of deliveries ?? []) {
  if (d.payload?.automationRunId === RUN_ID) {
    console.log(JSON.stringify({ at: d.created_at, corr: d.payload?.correlationId, text: (d.payload?.text ?? "").slice(0, 55) }));
  }
}
