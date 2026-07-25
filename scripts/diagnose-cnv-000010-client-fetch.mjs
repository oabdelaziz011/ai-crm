/**
 * Simulate authenticated client fetch + parser for CNV-000010 messages.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConversationMessageView } from "../lib/ai-conversation/src/display/parse-conversation-message-view.ts";

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

const PLATFORM_USER_ID = "d0000001-0001-4001-8001-000000000001";
const CONV_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "demo-platform@vaultos.local",
});
if (linkErr) throw linkErr;

const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
  email: "demo-platform@vaultos.local",
  token: linkData.properties.email_otp,
  type: "magiclink",
});
if (otpErr) throw otpErr;

const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
});

console.log("user:", sessionData.session.user.id);

const { data: profile } = await client.from("profiles").select("company_id, email").eq("id", PLATFORM_USER_ID).single();
console.log("profile company_id:", profile?.company_id);

const { data: rows, error } = await client
  .from("conversation_messages")
  .select("*")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: true });

if (error) {
  console.error("client fetch error:", error.message);
  process.exit(1);
}

console.log("client rows:", rows?.length);

const structured = (rows ?? []).filter((r) => {
  const kind = r.metadata?.outboundPayload?.kind;
  return kind === "buttons" || kind === "list";
});

for (const row of structured.slice(0, 4)) {
  const payload = row.metadata?.outboundPayload;
  console.log("\n--- CLIENT ROW ---");
  console.log("id:", row.id);
  console.log("metadata keys:", Object.keys(row.metadata ?? {}));
  console.log("outboundPayload exists:", Boolean(payload));
  console.log("outboundPayload.kind:", payload?.kind);
  const view = parseConversationMessageView(row);
  console.log("parser view.kind:", view.kind);
  console.log("component:", view.kind === "buttons" ? "ButtonsMessageContent" : view.kind === "list" ? "ListMessageContent" : "TextMessageContent");
}
