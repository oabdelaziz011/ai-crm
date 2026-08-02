/**
 * Audit Omnichannel conversation list pipeline stages for CNV-000010.
 * Run: node scripts/audit-omnichannel-list-pipeline.mjs
 */
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

const TARGET_NUMBER = "CNV-000010";
const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PAGE_SIZE = 50;

const OMNICHANNEL_PRIMARY_CHANNELS = ["whatsapp", "email", "messenger", "instagram"];
const CLOSED_STATES = new Set(["closed", "completed", "cancelled", "archived"]);
const CLOSED_LIFECYCLE = new Set(["CLOSED", "RESOLVED"]);

function summarize(stage, items) {
  const ids = items.map((c) => c.id);
  const numbers = items.map((c) => c.conversation_number ?? c.conversationNumber ?? "?");
  return {
    stage,
    count: items.length,
    hasTarget: ids.includes(TARGET_ID) || numbers.includes(TARGET_NUMBER),
    first10Ids: ids.slice(0, 10),
    first10Numbers: numbers.slice(0, 10),
  };
}

function resolveLifecycleState(conversation) {
  const metadata = conversation.metadata ?? {};
  const overlay = metadata.lifecycle;
  if (overlay?.state) return overlay.state;
  if (conversation.state === "closed") return "CLOSED";
  if (conversation.state === "completed") return "RESOLVED";
  if (conversation.state === "cancelled") return "CLOSED";
  if (conversation.state === "idle") return "NEW";
  if (conversation.state === "transferred_to_human") {
    return conversation.assigned_user_id ? "ASSIGNED" : "WAITING_QUEUE";
  }
  if (conversation.assigned_user_id) return "ASSIGNED";
  if (conversation.state === "waiting_user") {
    return conversation.last_participant_type === "employee" ? "PENDING_CUSTOMER" : "AI_HANDLING";
  }
  return "AI_HANDLING";
}

function aggregateList(conversations) {
  return conversations.map((c) => ({
    id: c.id,
    conversationNumber: c.conversation_number,
    channel: c.channel_type,
    status: c.state,
    lifecycleState: resolveLifecycleState(c),
    unreadCount: c.unread_count_employee ?? 0,
    isArchived: c.metadata?.archived === true,
    isPinned: c.metadata?.pinned === true,
    assignedUserId: c.assigned_user_id,
    lastActivityAt: c.last_message_at ?? c.updated_at,
    source: c,
  }));
}

function filterBySupportedChannels(items) {
  return items.filter((c) => OMNICHANNEL_PRIMARY_CHANNELS.includes(c.channel));
}

function applyFilters(items, filters) {
  let result = [...items];
  if (filters.archived === true) result = result.filter((i) => i.isArchived);
  else if (filters.archived === false) result = result.filter((i) => !i.isArchived);
  if (filters.unreadOnly) result = result.filter((i) => i.unreadCount > 0);
  if (filters.channel) result = result.filter((i) => i.channel === filters.channel);
  if (filters.status) result = result.filter((i) => i.status === filters.status);
  if (filters.assignedOnly) result = result.filter((i) => Boolean(i.assignedUserId));
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((i) => (i.source.search_text ?? "").toLowerCase().includes(q));
  }
  result.sort((a, b) => {
    const lt = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const rt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return rt - lt;
  });
  return result;
}

function isTerminal(c) {
  return CLOSED_STATES.has(c.status) || CLOSED_LIFECYCLE.has(c.lifecycleState);
}

function applyConversationQueue(items, queue, userId) {
  const effective = queue ?? "all";
  switch (effective) {
    case "all":
      return items.filter((c) => !isTerminal(c));
    case "mine":
      return items.filter((c) => c.assignedUserId === userId && !isTerminal(c));
    case "waiting_ai":
      return items.filter((c) => c.lifecycleState === "AI_HANDLING" && !isTerminal(c));
    case "waiting_customer":
      return items.filter(
        (c) => !isTerminal(c) && (c.lifecycleState === "PENDING_CUSTOMER" || c.status === "waiting_user"),
      );
    case "escalated":
      return items.filter((c) => c.source.metadata?.escalation && !isTerminal(c));
    case "closed":
      return items.filter((c) => c.lifecycleState === "CLOSED" || c.status === "closed");
    default:
      return items;
  }
}

function filterByChannelPermission(items) {
  const allowed = new Set(OMNICHANNEL_PRIMARY_CHANNELS);
  return items.filter((c) => allowed.has(c.channel));
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log("=== REALTIME PUBLICATION (from migrations grep) ===");
console.log(
  "In supabase_realtime publication: notifications (007), customers (141).",
  "conversations, conversation_messages, channel_sessions: NOT in any migration.",
);

// Stage 2-3: listConversations query (service role = no RLS)
const { data: listRows, error: listErr } = await sb
  .from("conversations")
  .select("*")
  .eq("company_id", COMPANY_ID)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, PAGE_SIZE - 1);

if (listErr) throw listErr;

const stages = [];
stages.push(summarize("2-3 listConversations (page 0, limit 50)", listRows ?? []));

const aggregated = aggregateList(listRows ?? []);
stages.push(summarize("4 aggregateList", aggregated));

const supported = filterBySupportedChannels(aggregated);
stages.push(summarize("5 filterBySupportedChannels", supported));

const defaultFilters = { archived: false, queue: undefined };
const filtered = applyFilters(supported, defaultFilters);
stages.push(summarize("6 applyFilters (archived=false, default)", filtered));

const queuedAll = applyConversationQueue(filtered, "all", null);
stages.push(summarize("7 applyConversationQueue (queue=all)", queuedAll));

const permitted = filterByChannelPermission(queuedAll);
stages.push(summarize("8 filterConversationsByChannelPermission", permitted));

// displayConversations = applyViewState (does not remove rows)
stages.push(summarize("9-10 displayConversations (applyViewState passthrough)", permitted));

console.log("\n=== PIPELINE STAGE AUDIT (default inbox filters) ===");
for (const s of stages) {
  console.log(JSON.stringify(s));
}

console.log("\n=== FILTER SCENARIOS FOR CNV-000010 ===");
const target = aggregated.find((c) => c.id === TARGET_ID);
if (target) {
  console.log(
    JSON.stringify({
      channel: target.channel,
      status: target.status,
      lifecycleState: target.lifecycleState,
      isArchived: target.isArchived,
      unreadCount: target.unreadCount,
      isTerminal: isTerminal(target),
      passesSupportedChannel: OMNICHANNEL_PRIMARY_CHANNELS.includes(target.channel),
      passesQueueAll: !isTerminal(target),
      passesQueueWaitingAi: target.lifecycleState === "AI_HANDLING" && !isTerminal(target),
      passesQueueInbox: !isTerminal(target),
    }),
  );
}

console.log("\n=== NAV QUEUE SCENARIOS ===");
for (const [name, queue] of [
  ["inbox (queue=all)", "all"],
  ["ai (queue=waiting_ai)", "waiting_ai"],
  ["waiting (queue=waiting_customer)", "waiting_customer"],
  ["closed", "closed"],
]) {
  const out = applyConversationQueue(filtered, queue, null);
  console.log(name, "count=", out.length, "hasTarget=", out.some((c) => c.id === TARGET_ID));
}

// RLS check with publishable key + demo user if credentials exist
const pubKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
if (pubKey) {
  const userClient = createClient(env.SUPABASE_URL, pubKey, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await userClient.auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
  if (!authErr && authData.user) {
    const { data: rlsRows, error: rlsErr } = await userClient
      .from("conversations")
      .select("id, conversation_number, last_message_at")
      .eq("company_id", COMPANY_ID)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    console.log("\n=== RLS listConversations (demo user JWT) ===");
    console.log(
      summarize("RLS list page 0", rlsRows ?? []),
      rlsErr?.message ?? "",
    );
  } else {
    console.log("\n=== RLS check skipped ===", authErr?.message);
  }
}

let firstDrop = null;
for (const s of stages) {
  if (!s.hasTarget && !firstDrop) firstDrop = s.stage;
}
console.log("\n=== FIRST STAGE WHERE CNV-000010 DISAPPEARS (default filters) ===");
console.log(firstDrop ?? "NONE — present through entire pipeline");
