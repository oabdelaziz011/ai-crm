import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conversationAggregator } from "../artifacts/login-app/src/lib/omnichannel/aggregators/conversation-aggregator.ts";

const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    conversation_number: String(row.conversation_number),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    channel_type: row.channel_type,
    state: row.state,
    priority: row.priority ?? "normal",
    last_message_preview: row.last_message_preview ?? null,
    last_message_at: (row.last_message_at as string | null) ?? null,
    updated_at: row.updated_at as string,
    assigned_user_id: row.assigned_user_id ?? null,
    ai_assistant_id: row.ai_assistant_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    unread_count_employee: Number(row.unread_count_employee ?? 0),
    company_channel_id: row.company_channel_id ?? null,
    external_thread_id: row.external_thread_id ?? null,
    last_participant_type: row.last_participant_type ?? null,
    started_at: row.started_at as string,
    created_at: row.created_at as string,
    ended_at: row.ended_at ?? null,
    locked_by: row.locked_by ?? null,
    locked_at: row.locked_at ?? null,
    unread_count_customer: Number(row.unread_count_customer ?? 0),
    search_text: String(row.search_text ?? ""),
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    channel_instance_id: row.channel_instance_id ?? null,
  };
}

const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: rawRow, error } = await sb
  .from("conversations")
  .select("*")
  .eq("id", TARGET_ID)
  .single();

if (error || !rawRow) {
  console.error(error);
  process.exit(1);
}

const mapped = mapRow(rawRow as Record<string, unknown>);
const unified = conversationAggregator.aggregateConversation(
  mapped as never,
  new Map(),
  new Map(),
);

const sortedPeers = conversationAggregator.applyFilters(
  conversationAggregator.filterBySupportedChannels(
    conversationAggregator.aggregateList({
      conversations: [mapped as never],
      customersById: new Map(),
      agentsById: new Map(),
    }),
  ),
  { sortBy: "last_activity", sortDirection: "desc", archived: false },
);

// full list for sort position
const { data: allRaw } = await sb
  .from("conversations")
  .select("*")
  .eq("company_id", VAULTOS)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, 49);

const flat = (allRaw ?? []).map((r) => mapRow(r as Record<string, unknown>));
const supported = conversationAggregator.filterBySupportedChannels(
  conversationAggregator.aggregateList({
    conversations: flat as never[],
    customersById: new Map(),
    agentsById: new Map(),
  }),
);
const sorted = conversationAggregator.applyFilters(supported, {
  sortBy: "last_activity",
  sortDirection: "desc",
  archived: false,
});
const targetIdx = sorted.findIndex((c) => c.id === TARGET_ID);
const top = sorted[0];
const targetInSorted = sorted[targetIdx];

console.log(
  JSON.stringify(
    {
      CNV_000010: {
        database: {
          last_message_at: rawRow.last_message_at,
          updated_at: rawRow.updated_at,
          metadata_pinned: (rawRow.metadata as Record<string, unknown>)?.pinned === true,
        },
        mappedConversationRecord: {
          last_message_at: mapped.last_message_at,
          updated_at: mapped.updated_at,
        },
        mappedUnifiedConversation: {
          lastMessage: unified.lastMessage,
          lastActivityAt: unified.lastActivityAt,
          isPinned: unified.isPinned,
        },
        equality: {
          last_message_at_equals_lastActivityAt:
            mapped.last_message_at === unified.lastActivityAt,
          last_message_at_fallback_used: mapped.last_message_at == null,
        },
      },
      afterApplyFiltersSort: {
        targetIndex: targetIdx,
        total: sorted.length,
        topRow: top
          ? {
              id: top.id,
              conversationNumber: top.conversationNumber,
              lastActivityAt: top.lastActivityAt,
              isPinned: top.isPinned,
              Date_parse: Date.parse(top.lastActivityAt ?? ""),
            }
          : null,
        targetRow: targetInSorted
          ? {
              id: targetInSorted.id,
              conversationNumber: targetInSorted.conversationNumber,
              lastActivityAt: targetInSorted.lastActivityAt,
              isPinned: targetInSorted.isPinned,
              Date_parse: Date.parse(targetInSorted.lastActivityAt ?? ""),
            }
          : null,
        pinnedCountAmongSupported: supported.filter((c) => c.isPinned).length,
      },
    },
    null,
    2,
  ),
);
