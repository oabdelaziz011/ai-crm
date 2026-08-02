/**
 * READ-ONLY audit for WhatsApp 201023169075 — service role, correct schema.
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
const KNOWN_CHANNEL = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

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

const report = { auditedAt: new Date().toISOString(), phone: PHONE, vaultosCompanyId: VAULTOS, checks: {}, globalSearch: {}, duplicates: {}, canonical: {}, inboxReady: false, notes: [] };

const { data: waKey } = await sb.from("communication_channels").select("id, key").eq("key", "whatsapp").maybeSingle();

const { data: allWaChannels } = await sb
  .from("company_channels")
  .select("id, company_id, display_name, is_enabled, deleted_at, channel_id, status, external_account_id")
  .eq("channel_id", waKey?.id ?? "")
  .is("deleted_at", null);

report.checks.company_channels = {
  vaultos: (allWaChannels ?? []).filter((c) => c.company_id === VAULTOS),
  otherTenants: (allWaChannels ?? []).filter((c) => c.company_id !== VAULTOS),
  knownVaultChannelPresent: (allWaChannels ?? []).some((c) => c.id === KNOWN_CHANNEL && c.company_id === VAULTOS),
};

const { data: sessions } = await sb
  .from("channel_sessions")
  .select("id, company_id, company_channel_id, conversation_id, external_thread_id, last_inbound_at, session_status, channel_key")
  .or(`external_thread_id.eq.${PHONE},external_thread_id.ilike.%${PHONE_DIGITS}%`);

report.checks.channel_sessions = sessions ?? [];

const convIds = [...new Set((sessions ?? []).map((s) => s.conversation_id).filter(Boolean))];
const conversations = [];
for (const id of convIds) {
  const { data } = await sb
    .from("conversations")
    .select("id, company_id, conversation_number, customer_id, archived, deleted_at, last_message_at, company_channel_id, state, metadata")
    .eq("id", id)
    .maybeSingle();
  if (data) conversations.push(data);
}
report.checks.conversations = conversations;

const { data: customers } = await sb
  .from("customers")
  .select("id, company_id, phone, name")
  .or(`phone.eq.${PHONE},phone.eq.01023169075,phone.eq.+${PHONE},phone.ilike.%${PHONE_DIGITS}%`);
report.checks.customers = customers ?? [];

const vaultSession =
  (sessions ?? []).find((s) => s.company_id === VAULTOS && s.external_thread_id === PHONE)
  ?? (sessions ?? []).find((s) => s.company_id === VAULTOS);
const vaultConvId = vaultSession?.conversation_id;
let recentMessages = [];
if (vaultConvId) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, conversation_id, message_type, content, created_at")
    .eq("conversation_id", vaultConvId)
    .order("created_at", { ascending: false })
    .limit(10);
  recentMessages = msgs ?? [];
}
report.checks.conversation_messages = {
  conversationId: vaultConvId,
  recent: recentMessages,
  allSameConversation: recentMessages.length === 0 || recentMessages.every((m) => m.conversation_id === vaultConvId),
};

// Table may not exist — probe gracefully
let links = [];
const linkProbe = await sb.from("company_channel_customer_links").select("id").limit(1);
if (linkProbe.error?.code === "42P01") {
  report.notes.push("company_channel_customer_links table does not exist in this database");
  report.checks.company_channel_customer_links = null;
} else {
  const customerIds = [...new Set((customers ?? []).map((c) => c.id))];
  for (const custId of customerIds) {
    const { data } = await sb
      .from("company_channel_customer_links")
      .select("id, company_id, company_channel_id, customer_id, external_customer_id, deleted_at")
      .eq("customer_id", custId);
    links.push(...(data ?? []));
  }
  const { data: linksByExt } = await sb
    .from("company_channel_customer_links")
    .select("id, company_id, company_channel_id, customer_id, external_customer_id, deleted_at")
    .or(`external_customer_id.eq.${PHONE},external_customer_id.ilike.%${PHONE_DIGITS}%`);
  for (const l of linksByExt ?? []) if (!links.some((x) => x.id === l.id)) links.push(l);
  report.checks.company_channel_customer_links = links;
}

const { data: inbound } = await sb
  .from("channel_inbound_events")
  .select("id, company_id, company_channel_id, conversation_id, channel_session_id, sender_external_id, created_at, processing_status")
  .or(`sender_external_id.eq.${PHONE},sender_external_id.ilike.%${PHONE_DIGITS}%`)
  .order("created_at", { ascending: false })
  .limit(20);
report.globalSearch.channel_inbound_events = inbound ?? [];

// Metadata search on conversations for phone in metadata
const { data: convMeta } = await sb
  .from("conversations")
  .select("id, company_id, conversation_number, metadata, deleted_at, archived, last_message_at")
  .eq("company_id", VAULTOS)
  .is("deleted_at", null)
  .limit(200);
report.globalSearch.conversations_metadata_phone = (convMeta ?? []).filter((c) =>
  JSON.stringify(c.metadata ?? {}).includes(PHONE) || JSON.stringify(c.metadata ?? {}).includes(PHONE_DIGITS),
);

report.duplicates = {
  channel_sessions: (sessions ?? []).filter((s) => s.company_id !== VAULTOS),
  customers: (customers ?? []).filter((c) => c.company_id !== VAULTOS),
  conversations: conversations.filter((c) => c.company_id !== VAULTOS),
  inbound_other_company: (inbound ?? []).filter((e) => e.company_id !== VAULTOS),
};

const vaultConv = conversations.find((c) => c.id === vaultConvId && c.company_id === VAULTOS)
  ?? report.globalSearch.conversations_metadata_phone?.find((c) => c.company_id === VAULTOS);
const vaultCustomer = (customers ?? []).find((c) => c.company_id === VAULTOS);

report.canonical = {
  phone: PHONE,
  customerId: vaultCustomer?.id ?? vaultConv?.customer_id ?? null,
  conversationId: vaultConv?.id ?? vaultConvId ?? null,
  conversationNumber: vaultConv?.conversation_number ?? null,
  channelSessionId: vaultSession?.id ?? null,
  companyChannelId: vaultSession?.company_channel_id ?? vaultConv?.company_channel_id ?? KNOWN_CHANNEL,
  companyId: VAULTOS,
  externalThreadId: vaultSession?.external_thread_id ?? vaultConv?.metadata?.externalThreadId ?? null,
  archived: vaultConv?.archived ?? null,
  deletedAt: vaultConv?.deleted_at ?? null,
  lastMessageAt: vaultConv?.last_message_at ?? null,
};

report.inboxReady = Boolean(
  report.canonical.companyId === VAULTOS
  && report.canonical.conversationId
  && report.canonical.channelSessionId
  && report.canonical.externalThreadId === PHONE
  && !report.canonical.deletedAt
  && report.canonical.archived === false
  && report.checks.company_channels.vaultos?.length > 0
  && report.duplicates.channel_sessions.length === 0,
);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
