import type { QueryClient } from "@tanstack/react-query";

const RT = "[OMNI_REALTIME]";
export const OMNICHANNEL_INVALIDATE_DEBOUNCE_MS = 150;

function rtLog(event: string, detail?: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  console.info(RT, event, detail ?? {});
  if (typeof window !== "undefined") {
    const w = window as unknown as { __OMNI_RT_LOGS?: unknown[] };
    w.__OMNI_RT_LOGS ??= [];
    w.__OMNI_RT_LOGS.push(entry);
  }
}

type PendingInvalidation = {
  timer: ReturnType<typeof setTimeout>;
  conversationIds: Set<string>;
};

const pendingByCompany = new Map<string, PendingInvalidation>();

function flushOmnichannelInvalidation(
  queryClient: QueryClient,
  companyId: string,
  conversationIds: Set<string>,
  source: string,
): void {
  rtLog("invalidateOmnichannelQueries.flush", {
    companyId,
    conversationIds: [...conversationIds],
    source,
  });

  const tasks = [
    queryClient.invalidateQueries({
      queryKey: ["omnichannel", "conversations", companyId],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["conversation-list", companyId],
      refetchType: "active",
    }),
  ];

  for (const conversationId of conversationIds) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: ["omnichannel", "messages", conversationId],
        refetchType: "active",
      }),
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId],
        refetchType: "active",
      }),
    );
  }

  void Promise.all(tasks)
    .then(() => {
      rtLog("invalidateQueries.resolved", {
        source,
        taskCount: tasks.length,
      });
    })
    .catch((error) => {
      rtLog("invalidateQueries.failed", {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export function invalidateOmnichannelQueries(
  queryClient: QueryClient,
  input: { companyId: string; conversationId?: string; source?: string },
): void {
  const source = input.source ?? "unknown";
  rtLog("invalidateOmnichannelQueries.called", {
    companyId: input.companyId,
    conversationId: input.conversationId ?? null,
    source,
  });

  const existing = pendingByCompany.get(input.companyId);
  if (existing) {
    if (input.conversationId) existing.conversationIds.add(input.conversationId);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => {
      pendingByCompany.delete(input.companyId);
      flushOmnichannelInvalidation(queryClient, input.companyId, existing.conversationIds, source);
    }, OMNICHANNEL_INVALIDATE_DEBOUNCE_MS);
    return;
  }

  const conversationIds = new Set<string>();
  if (input.conversationId) conversationIds.add(input.conversationId);
  const timer = setTimeout(() => {
    pendingByCompany.delete(input.companyId);
    flushOmnichannelInvalidation(queryClient, input.companyId, conversationIds, source);
  }, OMNICHANNEL_INVALIDATE_DEBOUNCE_MS);
  pendingByCompany.set(input.companyId, { timer, conversationIds });
}
