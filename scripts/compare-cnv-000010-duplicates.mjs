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

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DEMO_CONV = "86f06a07-1b67-47c0-bc40-6d546bfb631b";
const WA_CONV = "a35d7fff-cac7-47f3-9604-df683e726b71";

for (const [label, convId] of [["DEMO", DEMO_CONV], ["WHATSAPP", WA_CONV]]) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });

  console.log(`\n=== ${label} CNV-000010 (${convId}) ===`);
  for (const m of msgs ?? []) {
    const view = parseConversationMessageView(m);
    console.log({
      type: m.message_type,
      content: m.content?.slice(0, 50),
      outboundKind: m.metadata?.outboundPayload?.kind ?? null,
      metadata: JSON.stringify(m.metadata),
      parserKind: view.kind,
      component:
        view.kind === "buttons"
          ? "ButtonsMessageContent"
          : view.kind === "list"
            ? "ListMessageContent"
            : "TextMessageContent",
    });
  }
}

// Simulate inbox list for platform user with null company vs whatsapp company
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: "magiclink", email: "demo-platform@vaultos.local" });
const anon = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
const { data: sessionData } = await anon.auth.verifyOtp({
  email: "demo-platform@vaultos.local",
  token: linkData.properties.email_otp,
  type: "magiclink",
});

const authed = createClient(env.SUPABASE_URL, anonKey, {
  global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
});

const { data: convList } = await authed
  .from("conversations")
  .select("id, conversation_number, company_id, company_channel_id, channel_type")
  .eq("conversation_number", "CNV-000010");

console.log("\n=== CLIENT-VISIBLE CNV-000010 ROWS ===");
console.log(JSON.stringify(convList, null, 2));
