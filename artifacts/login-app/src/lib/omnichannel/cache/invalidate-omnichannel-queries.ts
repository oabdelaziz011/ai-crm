import type { QueryClient } from "@tanstack/react-query";

const RT = "[OMNI_REALTIME]";

function rtLog(event: string, detail?: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  console.info(RT, event, detail ?? {});
  if (typeof window !== "undefined") {
    const w = window as unknown as { __OMNI_RT_LOGS?: unknown[] };
    w.__OMNI_RT_LOGS ??= [];
    w.__OMNI_RT_LOGS.push(entry);
  }
}

export function invalidateOmnichannelQueries(
  queryClient: QueryClient,
  input: { companyId: string; conversationId?: string; source?: string },
): void {
  rtLog("invalidateOmnichannelQueries.called", {
    companyId: input.companyId,
    conversationId: input.conversationId ?? null,
    source: input.source ?? "unknown",
  });

  const tasks = [
    queryClient.invalidateQueries({ queryKey: ["omnichannel", "conversations", input.companyId] }),
    queryClient.invalidateQueries({ queryKey: ["conversation-list", input.companyId] }),
  ];

  if (input.conversationId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: ["omnichannel", "messages", input.conversationId] }),
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", input.conversationId] }),
    );
  }

  void Promise.all(tasks)
    .then(() => {
      rtLog("invalidateQueries.resolved", {
        source: input.source ?? "unknown",
        taskCount: tasks.length,
      });
    })
    .catch((error) => {
      rtLog("invalidateQueries.failed", {
        source: input.source ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
