import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ConversationState, ConversationChannelType } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { CONVERSATION_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { useConversationServices } from "@/lib/ai-conversation";
import { omniRenderTrace } from "@/lib/omnichannel/debug/omni-render-audit";
import { omniCompanyTrace } from "@/lib/omnichannel/debug/omni-company-audit";
import {
  buildSupabaseListFilters,
  traceOmniListEvent,
  traceOmniListRows,
  OMNI_LIST_TRACE_TARGET_ID,
} from "@/lib/omnichannel/debug/omni-list-trace";
import { logOmniListConversationsBeforeQuery } from "@/lib/omnichannel/debug/omni-session-probe";
import { recordMapRowStage } from "@/lib/omnichannel/debug/omni-list-pipeline-audit";

export type ConversationListFilters = {
  state?: ConversationState;
  channelType?: ConversationChannelType;
  assignedUserId?: string | null;
  hasEmployeeUnread?: boolean;
  searchQuery?: string;
};

export function conversationListQueryKey(companyId: string | null, filters: ConversationListFilters) {
  return ["conversation-list", companyId, filters] as const;
}

export function useConversationList(
  filters: ConversationListFilters = {},
  pageSize = CONVERSATION_LIST_PAGE_SIZE,
) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();

  return useQuery({
    queryKey: [...conversationListQueryKey(companyId, filters), "bounded", pageSize],
    enabled: Boolean(companyId),
    staleTime: 0,
    queryFn: async () => {
      if (!companyId) return [];
      return services.conversations.listConversations(context, {
        companyId,
        limit: pageSize,
        offset: 0,
        ...filters,
      });
    },
  });
}

export function useConversationListInfinite(
  filters: ConversationListFilters = {},
  pageSize = CONVERSATION_LIST_PAGE_SIZE,
) {
  const { profile, company, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();
  const queryClient = useQueryClient();
  const queryKey = [...conversationListQueryKey(companyId, filters), "infinite", pageSize] as const;

  useEffect(() => {
    omniCompanyTrace("useConversationListInfinite", {
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      profileCompanyId: profile?.company_id ?? null,
      companyRecordId: company?.id ?? null,
      companyId,
      extra: { queryEnabled: Boolean(companyId), filters },
    });
  }, [user?.id, user?.email, profile?.company_id, company?.id, companyId, filters]);

  const query = useInfiniteQuery({
    queryKey,
    enabled: Boolean(companyId),
    staleTime: 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const listInput = {
        companyId: companyId!,
        limit: pageSize,
        offset: pageParam,
        ...filters,
      };
      const supabaseFilters = buildSupabaseListFilters({
        companyId: companyId!,
        searchQuery: filters.searchQuery,
        state: filters.state,
        assignedUserId: filters.assignedUserId,
        channelType: filters.channelType,
        limit: pageSize,
        offset: pageParam,
      });

      traceOmniListEvent("listConversations.request", {
        companyId,
        searchQuery: filters.searchQuery ?? null,
        state: filters.state ?? null,
        assignedUserId: filters.assignedUserId ?? null,
        archived: null,
        channelType: filters.channelType ?? null,
        pageSize,
        page: Math.floor(pageParam / pageSize),
        offset: pageParam,
        supabaseFilters,
        queryKey,
      });

      const entry = {
        at: new Date().toISOString(),
        event: "useConversationListInfinite.queryFn.start",
        companyId,
        pageParam,
        filters,
      };
      console.info("[OMNI_REALTIME]", entry.event, { companyId, pageParam, filters });
      if (typeof window !== "undefined") {
        const w = window as unknown as { __OMNI_RT_LOGS?: unknown[] };
        w.__OMNI_RT_LOGS ??= [];
        w.__OMNI_RT_LOGS.push(entry);
      }
      if (!companyId) {
        return { rows: [], nextOffset: null };
      }

      logOmniListConversationsBeforeQuery({
        companyId: companyId!,
        userEmail: user?.email ?? null,
        filter: {
          companyId: companyId!,
          limit: pageSize,
          offset: pageParam,
          ...filters,
        },
      });

      const rows = await services.conversations.listConversations(context, listInput);
      recordMapRowStage(rows);

      traceOmniListRows("listConversations.return", rows, { pageParam, supabaseFilters });

      const cached = queryClient.getQueryData<{ pages: Array<{ rows: typeof rows }> }>(queryKey);
      const cacheFlat = cached?.pages.flatMap((p) => p.rows) ?? [];
      const cacheIndex = cacheFlat.findIndex((r) => r.id === OMNI_LIST_TRACE_TARGET_ID);
      traceOmniListEvent("reactQuery.cache.beforeWrite", {
        pageParam,
        cachePageCount: cached?.pages.length ?? 0,
        cacheFlatCount: cacheFlat.length,
        targetPresentInCacheBeforeWrite: cacheIndex >= 0,
        targetIndexInCacheBeforeWrite: cacheIndex >= 0 ? cacheIndex : null,
      });

      const done = {
        at: new Date().toISOString(),
        event: "useConversationListInfinite.queryFn.done",
        companyId,
        pageParam,
        rowCount: rows.length,
        topConversation: rows[0]
          ? { id: rows[0].id, number: rows[0].conversation_number, last_message_at: rows[0].last_message_at }
          : null,
      };
      console.info("[OMNI_REALTIME]", done.event, done);
      if (typeof window !== "undefined") {
        const w = window as unknown as { __OMNI_RT_LOGS?: unknown[] };
        w.__OMNI_RT_LOGS ??= [];
        w.__OMNI_RT_LOGS.push(done);
      }
      return {
        rows,
        nextOffset: rows.length < pageSize ? null : pageParam + pageSize,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });

  useEffect(() => {
    if (!query.data?.pages) return;
    const flat = query.data.pages.flatMap((page) => page.rows);
    traceOmniListRows("reactQuery.cache.afterWrite", flat, {
      queryKey,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isStale: query.isStale,
      dataUpdatedAt: query.dataUpdatedAt,
    });

    const supabasePresent = (window as unknown as { __OMNI_LIST_LOGS?: Array<{ stage: string; present?: boolean }> })
      .__OMNI_LIST_LOGS
      ?.findLast?.((l) => l.stage === "supabase.list.raw_response" || l.stage === "listConversations.return")
      ?.present;

    const cachePresent = flat.some((r) => r.id === OMNI_LIST_TRACE_TARGET_ID);
    traceOmniListEvent("reactQuery.verdict", {
      targetId: OMNI_LIST_TRACE_TARGET_ID,
      presentInSupabaseLayer: supabasePresent ?? null,
      presentInReactQueryCache: cachePresent,
      missingBeforeReactQuery: supabasePresent === false,
      missingAfterReactQuery: supabasePresent === true && !cachePresent,
    });
  }, [query.data?.pages, query.isLoading, query.isFetching, query.isStale, query.dataUpdatedAt, queryKey]);

  useEffect(() => {
    const flat = query.data?.pages.flatMap((page) => page.rows) ?? [];
    omniRenderTrace("useConversationListInfinite", flat, {
      companyId,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      pageCount: query.data?.pages.length ?? 0,
      filters,
      topRowIds: flat.slice(0, 3).map((r) => ({ id: r.id, number: r.conversation_number })),
    });
  }, [query.data?.pages, query.isLoading, query.isFetching, filters, companyId]);

  return query;
}
