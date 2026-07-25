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

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-24T04:35:00Z")
  .lte("created_at", "2026-07-24T04:38:00Z")
  .order("created_at", { ascending: true });

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, payload, delivery_status")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:35:00Z")
  .lte("created_at", "2026-07-24T04:38:30Z");

const byCorr = new Map();
for (const d of deliveries ?? []) {
  const c = d.payload?.correlationId ?? d.payload?.metadata?.correlationId;
  if (!c) continue;
  if (!byCorr.has(c)) byCorr.set(c, []);
  byCorr.get(c).push(d);
}

for (const i of inbounds ?? []) {
  const msg = i.payload?.message;
  const text = msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title;
  const ds = byCorr.get(i.id) ?? [];
  console.log(JSON.stringify({
    id: i.id,
    at: i.created_at,
    text,
    status: i.processing_status,
    deliveryCount: ds.length,
    deliveryTexts: ds.map((d) => d.payload?.text?.slice(0, 50)),
  }));
}
