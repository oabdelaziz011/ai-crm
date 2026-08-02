/**
 * Audit + fix WhatsApp personal number 201023169075 for VaultOS ownership.
 * Writes: docs/architecture/whatsapp-personal-audit.json
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "docs/architecture/whatsapp-personal-audit.json");
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PHONE = "201023169075";
const PHONE_DIGITS = "1023169075";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const report = {
  auditedAt: new Date().toISOString(),
  phone: PHONE,
  vaultosCompanyId: VAULTOS,
  checks: {},
  globalSearch: {},
  duplicates: { foreign: [] },
  fixes: [],
  canonical: {},
  inboxReady: false,
};

async function fetchAll(table, build) {
  const { data, error } = await build();
  return { data: data ?? [], error: error?.message ?? null };
}

// 1. company_channels
const { data: waChannels, error: chErr } = await sb
  .from("company_channels")
  .select("id, company_id, channel_type, display_name, is_enabled, deleted_at, metadata")
  .eq("channel_type", "whatsapp");
report.checks.company_channels = {
  error: chErr?.message ?? null,
  vaultos: (waChannels ?? []).filter((c) => c.company_id === VAULTOS && !c.deleted_at),
  otherTenants: (waChannels ?? []).filter((c) => c.company_id !== VAULTOS && !c.deleted_at),
};

// 2. channel_sessions
const { data: sessions } = await sb
  .from("channel_sessions")
  .select("id, company_id, company_channel_id, conversation_id, external_thread_id, last_inbound_at, deleted_at, metadata")
  .or(`external_thread_id.eq.${PHONE},external_thread_id.ilike.%${PHONE_DIGITS}%`);
report.checks.channel_sessions = sessions ?? [];

// 3. conversations from sessions + direct metadata search
const convIds = [...new Set((sessions ?? []).map((s) => s.conversation_id).filter(Boolean))];
const conversations = [];
for (const id of convIds) {
  const { data } = await sb.from("conversations").select("*").eq("id", id).maybeSingle();
  if (data) conversations.push(data);
}
report.checks.conversations = conversations;

// 4. customers
const { data: customers } = await sb
  .from("customers")
  .select("id, company_id, phone, name, deleted_at, metadata")
  .or(`phone.eq.${PHONE},phone.ilike.%${PHONE_DIGITS}%,phone.eq.+${PHONE},phone.eq.01023169075,phone.eq.0${PHONE.slice(2)}`);
report.checks.customers = customers ?? [];

// 5. recent messages per vault conversation
const vaultSessions = (sessions ?? []).filter((s) => s.company_id === VAULTOS && !s.deleted_at);
const vaultConvId = vaultSessions[0]?.conversation_id ?? conversations.find((c) => c.company_id === VAULTOS)?.id;
let recentMessages = [];
if (vaultConvId) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, conversation_id, message_type, content, created_at, metadata")
    .eq("conversation_id", vaultConvId)
    .order("created_at", { ascending: false })
    .limit(10);
  recentMessages = msgs ?? [];
}
report.checks.conversation_messages = {
  conversationId: vaultConvId,
  recent: recentMessages,
  allSameConversation: recentMessages.every((m) => m.conversation_id === vaultConvId),
};

// 6. company_channel_customer_links
const customerIds = [...new Set((customers ?? []).map((c) => c.id))];
const links = [];
for (const custId of customerIds) {
  const { data } = await sb
    .from("company_channel_customer_links")
    .select("id, company_id, company_channel_id, customer_id, external_customer_id, deleted_at, metadata")
    .eq("customer_id", custId);
  links.push(...(data ?? []));
}
// also by external id
const { data: linksByExt } = await sb
  .from("company_channel_customer_links")
  .select("id, company_id, company_channel_id, customer_id, external_customer_id, deleted_at")
  .or(`external_customer_id.eq.${PHONE},external_customer_id.ilike.%${PHONE_DIGITS}%`);
for (const l of linksByExt ?? []) {
  if (!links.some((x) => x.id === l.id)) links.push(l);
}
report.checks.company_channel_customer_links = links;

// 7. Global inbound/outbound
const { data: inbound } = await sb
  .from("channel_inbound_events")
  .select("id, company_id, company_channel_id, conversation_id, channel_session_id, sender_external_id, created_at, processing_status")
  .or(`sender_external_id.eq.${PHONE},sender_external_id.ilike.%${PHONE_DIGITS}%`)
  .order("created_at", { ascending: false })
  .limit(20);
report.globalSearch.channel_inbound_events = inbound ?? [];

const { data: outbound } = await sb
  .from("channel_outbound_events")
  .select("id, company_id, conversation_id, recipient_external_id, created_at")
  .or(`recipient_external_id.eq.${PHONE},recipient_external_id.ilike.%${PHONE_DIGITS}%`)
  .order("created_at", { ascending: false })
  .limit(10);
report.globalSearch.channel_outbound_events = outbound ?? [];

// Identify duplicates in foreign tenants
const foreignSessions = (sessions ?? []).filter((s) => s.company_id !== VAULTOS);
const foreignCustomers = (customers ?? []).filter((c) => c.company_id !== VAULTOS);
const foreignConversations = conversations.filter((c) => c.company_id !== VAULTOS);
const foreignLinks = links.filter((l) => l.company_id !== VAULTOS);
report.duplicates.foreign = {
  channel_sessions: foreignSessions,
  customers: foreignCustomers,
  conversations: foreignConversations,
  company_channel_customer_links: foreignLinks,
};

// FIX: soft-delete foreign duplicates, ensure vault canonical session points to vault conv
const canonicalSession = vaultSessions.find((s) => s.external_thread_id === PHONE) ?? vaultSessions[0];
const canonicalConv = conversations.find((c) => c.id === canonicalSession?.conversation_id && c.company_id === VAULTOS)
  ?? conversations.find((c) => c.company_id === VAULTOS && !c.deleted_at);

async function softDelete(table, id, reason) {
  const patch =
    table === "conversations"
      ? { deleted_at: new Date().toISOString(), archived: true }
      : { deleted_at: new Date().toISOString() };
  const { error } = await sb.from(table).update(patch).eq("id", id);
  report.fixes.push({ table, id, action: "soft_delete", reason, error: error?.message ?? null });
}

for (const s of foreignSessions) {
  await softDelete("channel_sessions", s.id, "duplicate foreign tenant session for same WhatsApp number");
}
for (const c of foreignCustomers) {
  await softDelete("customers", c.id, "duplicate foreign tenant customer for same phone");
}
for (const c of foreignConversations) {
  await softDelete("conversations", c.id, "duplicate foreign tenant conversation");
}
for (const l of foreignLinks) {
  const { error } = await sb.from("company_channel_customer_links").update({ deleted_at: new Date().toISOString() }).eq("id", l.id);
  report.fixes.push({ table: "company_channel_customer_links", id: l.id, action: "soft_delete", reason: "foreign tenant link", error: error?.message ?? null });
}

// Ensure vault conversation is active
if (canonicalConv) {
  const patch = {};
  if (canonicalConv.deleted_at) patch.deleted_at = null;
  if (canonicalConv.archived) patch.archived = false;
  if (Object.keys(patch).length) {
    const { error } = await sb.from("conversations").update(patch).eq("id", canonicalConv.id);
    report.fixes.push({ table: "conversations", id: canonicalConv.id, action: "reactivate", patch, error: error?.message ?? null });
  }
}

// Ensure session conversation_id matches canonical conv
if (canonicalSession && canonicalConv && canonicalSession.conversation_id !== canonicalConv.id) {
  const { error } = await sb
    .from("channel_sessions")
    .update({ conversation_id: canonicalConv.id })
    .eq("id", canonicalSession.id);
  report.fixes.push({
    table: "channel_sessions",
    id: canonicalSession.id,
    action: "repoint_conversation_id",
    conversationId: canonicalConv.id,
    error: error?.message ?? null,
  });
}

// Re-fetch canonical after fixes
const { data: finalSession } = canonicalSession
  ? await sb.from("channel_sessions").select("*").eq("id", canonicalSession.id).maybeSingle()
  : { data: null };
const { data: finalConv } = canonicalConv
  ? await sb.from("conversations").select("*").eq("id", canonicalConv.id).maybeSingle()
  : { data: null };
const vaultCustomer =
  (customers ?? []).find((c) => c.company_id === VAULTOS && !c.deleted_at)
  ?? (finalConv?.customer_id
    ? (await sb.from("customers").select("*").eq("id", finalConv.customer_id).maybeSingle()).data
    : null);

report.canonical = {
  phone: PHONE,
  customerId: vaultCustomer?.id ?? finalConv?.customer_id ?? null,
  conversationId: finalConv?.id ?? null,
  conversationNumber: finalConv?.conversation_number ?? null,
  channelSessionId: finalSession?.id ?? null,
  companyChannelId: finalSession?.company_channel_id ?? finalConv?.company_channel_id ?? null,
  companyId: VAULTOS,
  externalThreadId: finalSession?.external_thread_id ?? null,
  archived: finalConv?.archived ?? null,
  deletedAt: finalConv?.deleted_at ?? null,
  lastMessageAt: finalConv?.last_message_at ?? null,
};

report.inboxReady = Boolean(
  report.canonical.companyId === VAULTOS
  && report.canonical.conversationId
  && report.canonical.channelSessionId
  && report.canonical.externalThreadId === PHONE
  && !report.canonical.deletedAt
  && report.canonical.archived === false
  && report.checks.company_channels.vaultos?.length > 0
  && foreignSessions.length === 0
);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.canonical, null, 2));
console.log("inboxReady:", report.inboxReady);
console.log("written:", OUT);
