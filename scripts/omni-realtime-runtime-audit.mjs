/**
 * Runtime audit: capture [OMNI_REALTIME] browser console while Omnichannel is open.
 * Usage: node scripts/omni-realtime-runtime-audit.mjs
 */
import { chromium } from "../artifacts/login-app/node_modules/playwright/index.mjs";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const pubKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const convId = "a35d7fff-cac7-47f3-9604-df683e726b71";
const demoUserId = "d0000001-0001-4001-8001-000000000001";
const WAIT_MS = 90_000;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: beforeProfile } = await admin.from("profiles").select("company_id").eq("id", demoUserId).single();
await admin.from("profiles").update({ company_id: companyId }).eq("id", demoUserId);

const logs = [];
function push(line) {
  logs.push(line);
  process.stdout.write(`${line}\n`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[OMNI_REALTIME]")) {
    push(`[browser ${new Date().toISOString()}] ${text}`);
  }
});

push(`=== OMNI REALTIME RUNTIME AUDIT started ${new Date().toISOString()} ===`);

await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.evaluate(async ({ url, pubKey }) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  await createClient(url, pubKey).auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
}, { url, pubKey });

push("--- navigated to login, signing in ---");
await page.goto("http://localhost:5173/dashboard/omnichannel", { waitUntil: "networkidle", timeout: 120_000 });
push("--- omnichannel loaded, waiting for subscription mount ---");
await page.waitForTimeout(8000);

const subscribed = logs.some((l) => l.includes("SUBSCRIBED"));
push(`--- subscribe SUBSCRIBED seen: ${subscribed} ---`);

if (subscribed) {
  push("--- admin touch: bump conversations.updated_at to probe realtime ---");
  const touchAt = new Date().toISOString();
  await admin
    .from("conversations")
    .update({ updated_at: touchAt })
    .eq("id", convId);
  push(`--- admin touch applied at ${touchAt} ---`);
  await page.waitForTimeout(5000);

  push("--- admin touch: insert probe conversation_messages row ---");
  const { data: probeMsg, error: probeErr } = await admin
    .from("conversation_messages")
    .insert({
      conversation_id: convId,
      message_type: "internal_note",
      content_type: "text",
      content: `[OMNI_REALTIME probe ${touchAt}]`,
      metadata: { omniRealtimeProbe: true },
      status: "delivered",
    })
    .select("id")
    .single();
  push(`--- probe message: ${probeErr ? probeErr.message : JSON.stringify(probeMsg)} ---`);
  await page.waitForTimeout(5000);
}

push("--- waiting for WhatsApp inbound / realtime events ---");
const started = Date.now();
while (Date.now() - started < WAIT_MS) {
  const { data: latest } = await admin
    .from("channel_inbound_events")
    .select("id, created_at, sender_external_id")
    .eq("company_channel_id", "e126113b-6d0e-48d3-9296-a46aafe0cc75")
    .gte("created_at", new Date(started).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (latest?.[0]) {
    push(`--- detected new inbound event in DB: ${JSON.stringify(latest[0])} ---`);
  }
  await page.waitForTimeout(3000);
}

push(`=== CAPTURE COMPLETE (${logs.filter((l) => l.includes("[OMNI_REALTIME]")).length} OMNI_REALTIME lines) ===`);
if (logs.filter((l) => l.includes("subscribe.status")).length === 0) {
  push("WARNING: no subscribe.status captured");
}

await browser.close();
await admin.from("profiles").update({ company_id: beforeProfile?.company_id ?? null }).eq("id", demoUserId);
