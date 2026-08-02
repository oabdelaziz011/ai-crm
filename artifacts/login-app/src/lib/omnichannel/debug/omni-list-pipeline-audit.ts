import type { ConversationRecord } from "@workspace/ai-conversation";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import { conversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
import { applyConversationQueue } from "@/lib/omnichannel/services/conversation-queues";
import { filterConversationsByChannelPermission } from "@/lib/omnichannel/permissions";
import { OMNICHANNEL_PRIMARY_CHANNELS, isPrimaryOmnichannelChannel } from "@/lib/omnichannel/types/unified-conversation";
import {
  diagnoseApplyFilters,
  OMNI_RENDER_TARGET_ID,
  OMNI_RENDER_TARGET_NUMBER,
} from "@/lib/omnichannel/debug/omni-render-audit";

const RT = "[OMNI_LIST_PIPELINE]";

export type OmniListPipelineStage = {
  at: string;
  stage: string;
  file: string;
  function: string;
  line: number;
  present: boolean;
  count: number;
  dataLength: number | null;
  responseCount: number | null;
  first10Ids: string[];
  removedHere: boolean;
  removalReason: string | null;
};

export type OmniListRawSupabaseProbe = {
  at: string;
  status: number | null;
  error: string | null;
  responseCount: number | null;
  dataLength: number;
  first10Ids: string[];
  targetInRawData: boolean;
  targetInRawDataIndex: number | null;
  targetInMappedRows: boolean;
  targetInMappedRowsIndex: number | null;
};

declare global {
  interface Window {
    __OMNI_LIST_PIPELINE__?: {
      rawSupabase: OmniListRawSupabaseProbe | null;
      stages: OmniListPipelineStage[];
      firstRemoval: OmniListPipelineStage | null;
    };
  }
}

function ensurePipelineState() {
  if (typeof window === "undefined") {
    return {
      rawSupabase: null as OmniListRawSupabaseProbe | null,
      stages: [] as OmniListPipelineStage[],
      firstRemoval: null as OmniListPipelineStage | null,
    };
  }
  window.__OMNI_LIST_PIPELINE__ ??= { rawSupabase: null, stages: [], firstRemoval: null };
  return window.__OMNI_LIST_PIPELINE__;
}

function idsOf(rows: ReadonlyArray<{ id: string }>): string[] {
  return rows.map((r) => r.id);
}

function traceStage(
  stage: string,
  file: string,
  functionName: string,
  line: number,
  rows: ReadonlyArray<{ id: string }>,
  extra?: { responseCount?: number | null; dataLength?: number | null; previousPresent?: boolean; removalReason?: string | null },
): OmniListPipelineStage {
  const present = rows.some((r) => r.id === OMNI_RENDER_TARGET_ID);
  const previousPresent = extra?.previousPresent ?? true;
  const removedHere = previousPresent && !present;
  const entry: OmniListPipelineStage = {
    at: new Date().toISOString(),
    stage,
    file,
    function: functionName,
    line,
    present,
    count: rows.length,
    dataLength: extra?.dataLength ?? rows.length,
    responseCount: extra?.responseCount ?? null,
    first10Ids: idsOf(rows).slice(0, 10),
    removedHere,
    removalReason: removedHere ? (extra?.removalReason ?? `${functionName} @ ${file}:${line}`) : null,
  };

  const state = ensurePipelineState();
  state.stages.push(entry);
  if (removedHere && !state.firstRemoval) {
    state.firstRemoval = entry;
  }

  console.info(RT, stage, entry);
  return entry;
}

export function recordMapRowStage(mappedRows: ReadonlyArray<{ id: string }>) {
  const raw = typeof window !== "undefined" ? window.__OMNI_LIST_PIPELINE__?.rawSupabase ?? null : null;
  traceStage(
    "after.mapRow",
    "supabase-conversation-repository.ts",
    "mapRow",
    233,
    mappedRows,
    {
      responseCount: raw?.responseCount ?? null,
      dataLength: raw?.dataLength ?? null,
      previousPresent: raw?.targetInRawData ?? false,
      removalReason:
        raw?.targetInRawData && !mappedRows.some((r) => r.id === OMNI_RENDER_TARGET_ID)
          ? "mapRow @ supabase-conversation-repository.ts:24"
          : null,
    },
  );

  traceStage(
    "after.listConversations.return",
    "conversation-service.ts",
    "listConversations",
    128,
    mappedRows,
    { previousPresent: mappedRows.some((r) => r.id === OMNI_RENDER_TARGET_ID) },
  );
}

export function logOmniListRawSupabaseResponse(input: {
  status: number | null;
  error: string | null;
  count: number | null;
  data: ReadonlyArray<{ id?: string }> | null;
  mappedRows: ReadonlyArray<{ id: string }>;
}) {
  const rawData = input.data ?? [];
  const targetInRawDataIndex = rawData.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID);
  const targetInMappedRowsIndex = input.mappedRows.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID);

  const probe: OmniListRawSupabaseProbe = {
    at: new Date().toISOString(),
    status: input.status,
    error: input.error,
    responseCount: input.count,
    dataLength: rawData.length,
    first10Ids: rawData.map((r) => r.id).filter((id): id is string => typeof id === "string").slice(0, 10),
    targetInRawData: targetInRawDataIndex >= 0,
    targetInRawDataIndex: targetInRawDataIndex >= 0 ? targetInRawDataIndex : null,
    targetInMappedRows: targetInMappedRowsIndex >= 0,
    targetInMappedRowsIndex: targetInMappedRowsIndex >= 0 ? targetInMappedRowsIndex : null,
  };

  const state = ensurePipelineState();
  state.rawSupabase = probe;

  console.info(RT, "rawSupabase.beforeMap", {
    responseCount: probe.responseCount,
    dataLength: probe.dataLength,
    first10Ids: probe.first10Ids,
    targetId: OMNI_RENDER_TARGET_ID,
    targetNumber: OMNI_RENDER_TARGET_NUMBER,
    targetInRawData: probe.targetInRawData,
    targetInRawDataIndex: probe.targetInRawDataIndex,
  });

  traceStage(
    "after.mapRow",
    "supabase-conversation-repository.ts",
    "mapRow",
    233,
    input.mappedRows,
    {
      responseCount: input.count,
      dataLength: rawData.length,
      previousPresent: probe.targetInRawData,
      removalReason: probe.targetInRawData && !probe.targetInMappedRows
        ? "mapRow @ supabase-conversation-repository.ts:24"
        : null,
    },
  );

  return probe;
}

export function auditOmniListPipeline(input: {
  flatRows: ConversationRecord[];
  filters: OmnichannelListFilters;
  userId: string | null | undefined;
  customersById: Parameters<typeof conversationAggregator.aggregateList>[0]["customersById"];
  agentsById: Parameters<typeof conversationAggregator.aggregateList>[0]["agentsById"];
  profilesByUserId: Parameters<typeof conversationAggregator.aggregateList>[0]["profilesByUserId"];
  ownershipLabels: Parameters<typeof conversationAggregator.aggregateList>[0]["ownershipLabels"];
}) {
  let previousPresent = input.flatRows.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  traceStage(
    "after.reactQuery.flatMap",
    "use-conversation-list.ts",
    "pages.flatMap",
    179,
    input.flatRows,
    { previousPresent },
  );
  previousPresent = input.flatRows.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  const unified = conversationAggregator.aggregateList({
    conversations: input.flatRows,
    customersById: input.customersById,
    agentsById: input.agentsById,
    profilesByUserId: input.profilesByUserId,
    ownershipLabels: input.ownershipLabels,
  });
  traceStage(
    "after.aggregateList",
    "conversation-aggregator.ts",
    "aggregateList",
    153,
    unified,
    { previousPresent },
  );
  previousPresent = unified.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  const supported = conversationAggregator.filterBySupportedChannels(unified);
  const itemBeforeSupported = unified.find((c) => c.id === OMNI_RENDER_TARGET_ID);
  traceStage(
    "after.filterBySupportedChannels",
    "conversation-aggregator.ts",
    "filterBySupportedChannels",
    286,
    supported,
    {
      previousPresent,
      removalReason: previousPresent && !supported.some((c) => c.id === OMNI_RENDER_TARGET_ID) && itemBeforeSupported
        ? `.filter() @ conversation-aggregator.ts:286 — channel ${itemBeforeSupported.channel} isPrimary=${isPrimaryOmnichannelChannel(itemBeforeSupported.channel)}`
        : null,
    },
  );
  previousPresent = supported.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  const afterFilters = conversationAggregator.applyFilters(supported, input.filters);
  const itemBeforeFilters = supported.find((c) => c.id === OMNI_RENDER_TARGET_ID);
  traceStage(
    "after.applyFilters",
    "conversation-aggregator.ts",
    "applyFilters",
    201,
    afterFilters,
    {
      previousPresent,
      removalReason: previousPresent && !afterFilters.some((c) => c.id === OMNI_RENDER_TARGET_ID) && itemBeforeFilters
        ? `.filter() @ conversation-aggregator.ts:201 — ${diagnoseApplyFilters(itemBeforeFilters, input.filters)}`
        : null,
    },
  );
  previousPresent = afterFilters.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  const effectiveQueue = input.filters.queue ?? "all";
  const afterQueue = applyConversationQueue(afterFilters, effectiveQueue, input.userId);
  traceStage(
    "after.applyConversationQueue",
    "conversation-queues.ts",
    "applyConversationQueue",
    41,
    afterQueue,
    { previousPresent },
  );
  previousPresent = afterQueue.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  const afterChannelPerm = filterConversationsByChannelPermission(afterQueue, OMNICHANNEL_PRIMARY_CHANNELS);
  traceStage(
    "after.filterConversationsByChannelPermission",
    "permissions.ts",
    "filterConversationsByChannelPermission",
    54,
    afterChannelPerm,
    {
      previousPresent,
      removalReason: previousPresent && !afterChannelPerm.some((c) => c.id === OMNI_RENDER_TARGET_ID)
        ? `.filter() @ permissions.ts:54 — channel not in OMNICHANNEL_PRIMARY_CHANNELS`
        : null,
    },
  );

  return ensurePipelineState();
}

export function summarizeOmniListPipeline() {
  const state = ensurePipelineState();
  return {
    raw: state.rawSupabase,
    firstRemoval: state.firstRemoval,
    stages: state.stages,
    targetId: OMNI_RENDER_TARGET_ID,
    targetNumber: OMNI_RENDER_TARGET_NUMBER,
  };
}
