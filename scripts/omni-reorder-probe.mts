/**
 * Reproduce reorder pipeline for CNV-000010 on VaultOS (service role).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conversationAggregator } from "../artifacts/login-app/src/lib/omnichannel/aggregators/conversation-aggregator.ts";
import { applyConversationQueue } from "../artifacts/login-app/src/lib/omnichannel/services/conversation-queues.ts";
import { filterConversationsByChannelPermission } from "../artifacts/login-app/src/lib/omnichannel/permissions.ts";
import { applyInboxViewState } from "../artifacts/login-app/src/lib/omnichannel/presentation/inbox-view-state.ts";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "../artifacts/login-app/src/lib/omnichannel/types/unified-conversation.ts";

const TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const DEFAULT_FILTERS = {
  sortBy: "last_activity" as const,
  sortDirection: "desc" as const,
  archived: false,
  queue: "all" as const,
};

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

function idx(rows: ReadonlyArray<{ id: string }>) {
  const i = rows.findIndex((r) => r.id === TARGET_ID);
  return i >= 0 ? i : null;
}

function orderChangedAmongSurvivors(before: string[], after: string[]) {
  const afterSet = new Set(after);
  const beforeSurvivors = before.filter((id) => afterSet.has(id));
  const afterSurvivors = after.filter((id) => before.includes(id));
  if (beforeSurvivors.length !== afterSurvivors.length) return false;
  return beforeSurvivors.some((id, i) => id !== afterSurvivors[i]);
}

type Stage = {
  stage: string;
  targetIndexBefore: number | null;
  targetIndexAfter: number | null;
  sortCalled: boolean;
  comparator: string | null;
  orderChangedAmongSurvivors: boolean;
  why: string | null;
  stackTrace: string | null;
};

const stages: Stage[] = [];
let firstReorder: (Stage & { beforeIndex: number; afterIndex: number }) | null = null;

function trace(
  stage: string,
  before: ReadonlyArray<{ id: string }>,
  after: ReadonlyArray<{ id: string }>,
  opts: { sortCalled?: boolean; comparator?: string | null; stackTrace?: string | null } = {},
) {
  const beforeIds = before.map((r) => r.id);
  const afterIds = after.map((r) => r.id);
  const targetIndexBefore = idx(before);
  const targetIndexAfter = idx(after);
  const reordered = orderChangedAmongSurvivors(beforeIds, afterIds);
  const sortCalled = opts.sortCalled ?? false;
  const comparator = opts.comparator ?? null;
  let why: string | null = null;
  if (targetIndexBefore !== targetIndexAfter) {
    if (sortCalled && comparator) {
      why = `sort() with comparator "${comparator}" moved target from index ${targetIndexBefore} to ${targetIndexAfter}`;
    } else if (before.length !== after.length) {
      why = `filter removed ${before.length - after.length} row(s); target index shifted ${targetIndexBefore} → ${targetIndexAfter}`;
    } else {
      why = `target index changed ${targetIndexBefore} → ${targetIndexAfter}`;
    }
  }
  const entry: Stage = {
    stage,
    targetIndexBefore,
    targetIndexAfter,
    sortCalled,
    comparator,
    orderChangedAmongSurvivors: reordered,
    why,
    stackTrace: opts.stackTrace ?? null,
  };
  stages.push(entry);
  if (
    targetIndexBefore !== null
    && targetIndexAfter !== null
    && targetIndexBefore !== targetIndexAfter
    && !firstReorder
  ) {
    firstReorder = { ...entry, beforeIndex: targetIndexBefore, afterIndex: targetIndexAfter };
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    channel_type: row.channel_type,
    state: row.state,
    priority: row.priority ?? "normal",
    last_message_preview: row.last_message_preview ?? null,
    last_message_at: row.last_message_at ?? null,
    updated_at: row.updated_at ?? null,
    assigned_user_id: row.assigned_user_id ?? null,
    ai_assistant_id: row.ai_assistant_id ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    unread_count_employee: Number(row.unread_count_employee ?? 0),
    conversation_number: row.conversation_number ?? null,
    company_channel_id: row.company_channel_id ?? null,
    external_thread_id: row.external_thread_id ?? null,
    last_participant_type: row.last_participant_type ?? null,
  };
}

const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("conversations")
  .select("*")
  .eq("company_id", VAULTOS)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, 49);

if (error) {
  console.error(error);
  process.exit(1);
}

const flatRows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
const emptyMaps = { customersById: new Map(), agentsById: new Map(), profilesByUserId: new Map() };

trace("reactQuery.flatMap", flatRows, flatRows);

const unified = conversationAggregator.aggregateList({ conversations: flatRows, ...emptyMaps });
trace("aggregateList", flatRows, unified);

const supported = conversationAggregator.filterBySupportedChannels(unified);
trace("filterBySupportedChannels", unified, supported);

// applyFilters internal: filter phase then sort
let filtered = [...supported];
if (DEFAULT_FILTERS.archived === false) {
  filtered = filtered.filter((item) => !item.isArchived);
}
trace("applyFilters.filter", supported, filtered);

const beforeSort = [...filtered];
const stackTrace = new Error("omni-reorder sort()").stack?.split("\n").slice(1, 8).join("\n") ?? null;
const comparator = `lastActivityAt(${DEFAULT_FILTERS.sortDirection}, pinnedFirst)`;
const sorted = conversationAggregator.applyFilters(supported, DEFAULT_FILTERS);
trace("applyFilters.sort", beforeSort, sorted, {
  sortCalled: true,
  comparator,
  stackTrace,
});

const queued = applyConversationQueue(sorted, DEFAULT_FILTERS.queue, null);
trace("applyConversationQueue", sorted, queued);

const permitted = filterConversationsByChannelPermission(queued, OMNICHANNEL_PRIMARY_CHANNELS);
trace("filterConversationsByChannelPermission", queued, permitted);

const viewState = applyInboxViewState(permitted, new Map());
trace("applyInboxViewState", permitted, viewState);

console.log(JSON.stringify({ firstReorder, finalTargetIndex: idx(viewState), stages }, null, 2));

const topAfterSort = sorted[0];
const bottomAfterSort = sorted[sorted.length - 1];
console.log("[OMNI_REORDER] sortEnds", JSON.stringify({
  top: { id: topAfterSort?.id, number: topAfterSort?.conversationNumber, lastActivityAt: topAfterSort?.lastActivityAt, parsed: Date.parse(topAfterSort?.lastActivityAt ?? "") },
  bottom: { id: bottomAfterSort?.id, number: bottomAfterSort?.conversationNumber, lastActivityAt: bottomAfterSort?.lastActivityAt, parsed: Date.parse(bottomAfterSort?.lastActivityAt ?? "") },
  targetIsBottom: bottomAfterSort?.id === TARGET_ID,
}, null, 2));
