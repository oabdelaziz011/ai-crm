/**
 * Email Workspace realtime: auto-refresh list/messages when inbound email persists.
 * Reuses Omnichannel invalidation + shared desk sound preference; adds email-only
 * channel filtering and message-id sound baseline/dedup.
 *
 * Diagnostics are exposed on window.__EMAIL_WORKSPACE_REALTIME__ for live debugging.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { supabase } from "@/lib/supabase";
import { invalidateOmnichannelQueries } from "@/lib/omnichannel/cache/invalidate-omnichannel-queries";
import {
  markEmailInboundAlertBaselineReady,
  notifyEmailIncomingMessageAlert,
} from "@/lib/email-workspace/email-incoming-alerts";

type MessageRow = {
  id?: string;
  conversation_id?: string;
  message_type?: string;
};

type ConversationRow = {
  id?: string;
  channel_type?: string;
  company_id?: string;
};

type EmailRealtimeDebugState = {
  channelName: string | null;
  companyId: string | null;
  status: string | null;
  statusError: string | null;
  eventCount: number;
  lastEventAt: string | null;
  lastEvent: Record<string, unknown> | null;
  lastInvalidateAt: string | null;
  softPollAt: string | null;
};

/** Safety-net list refresh while Email Workspace is open (covers silent Realtime drops). */
export const EMAIL_WORKSPACE_SOFT_POLL_MS = 15_000;

const RT = "[EMAIL_WORKSPACE_REALTIME]";

function publishEmailRealtimeDebug(partial: Partial<EmailRealtimeDebugState>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __EMAIL_WORKSPACE_REALTIME__?: EmailRealtimeDebugState };
  w.__EMAIL_WORKSPACE_REALTIME__ = {
    channelName: null,
    companyId: null,
    status: null,
    statusError: null,
    eventCount: 0,
    lastEventAt: null,
    lastEvent: null,
    lastInvalidateAt: null,
    softPollAt: null,
    ...(w.__EMAIL_WORKSPACE_REALTIME__ ?? {}),
    ...partial,
  };
}

function rtLog(event: string, detail?: Record<string, unknown>): void {
  console.info(RT, event, detail ?? {});
  if (typeof window === "undefined") return;
  const w = window as unknown as { __EMAIL_RT_LOGS?: unknown[] };
  w.__EMAIL_RT_LOGS ??= [];
  w.__EMAIL_RT_LOGS.push({ at: new Date().toISOString(), event, ...detail });
}

function readMessageRow(payload: { new?: unknown; old?: unknown }): MessageRow | null {
  const row = (payload.new ?? payload.old) as MessageRow | null | undefined;
  return row ?? null;
}

function findCachedConversationChannelType(
  queryClient: QueryClient,
  conversationId: string,
): string | null {
  const queries = queryClient.getQueriesData({ queryKey: ["conversation-list"] });
  for (const [, data] of queries) {
    if (Array.isArray(data)) {
      const match = (data as ConversationRecord[]).find((row) => row.id === conversationId);
      if (match?.channel_type) return match.channel_type;
      continue;
    }
    if (data && typeof data === "object" && "pages" in data) {
      const pages = (data as { pages?: ConversationRecord[][] }).pages ?? [];
      for (const page of pages) {
        if (!Array.isArray(page)) continue;
        const match = page.find((row) => row.id === conversationId);
        if (match?.channel_type) return match.channel_type;
      }
    }
  }
  return null;
}

async function resolveIsEmailConversation(
  queryClient: QueryClient,
  conversationId: string,
): Promise<"email" | "other" | "unknown"> {
  const cached = findCachedConversationChannelType(queryClient, conversationId);
  if (cached === "email") return "email";
  if (cached && cached !== "email") return "other";

  const { data, error } = await supabase
    .from("conversations")
    .select("channel_type")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) return "unknown";
  const channelType = String((data as ConversationRow | null)?.channel_type ?? "");
  if (channelType === "email") return "email";
  if (channelType) return "other";
  return "unknown";
}

function invalidateEmailWorkspaceQueries(
  queryClient: QueryClient,
  companyId: string,
  conversationId?: string | null,
  source = "email_workspace_realtime",
): void {
  invalidateOmnichannelQueries(queryClient, {
    companyId,
    conversationId: conversationId ?? undefined,
    source,
  });
  void queryClient.invalidateQueries({
    queryKey: ["email-workspace-metrics-extras", companyId],
    refetchType: "active",
  });
  void queryClient.invalidateQueries({
    queryKey: ["email-workspace-conversation"],
    refetchType: "active",
  });
  publishEmailRealtimeDebug({ lastInvalidateAt: new Date().toISOString() });
}

/**
 * Subscribe to conversation/message changes for the Email Workspace.
 * Does not remount the panel or reload the window.
 */
export function useEmailWorkspaceRealtime(
  companyId: string | null,
  selectedConversationId: string | null,
  options?: { listReady?: boolean },
): void {
  const queryClient = useQueryClient();
  const selectedRef = useRef(selectedConversationId);
  selectedRef.current = selectedConversationId;
  const listReady = options?.listReady === true;
  /** Bumps to tear down + re-subscribe after Realtime channel errors. */
  const [subscribeEpoch, setSubscribeEpoch] = useState(0);

  useEffect(() => {
    if (!listReady) return;
    markEmailInboundAlertBaselineReady();
  }, [listReady]);

  // Visibility soft-refetch: if Realtime briefly disconnects, returning to the tab
  // still refreshes the list without a hard reload or panel remount.
  useEffect(() => {
    if (!companyId) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      rtLog("visibility.refetch", { companyId });
      invalidateEmailWorkspaceQueries(queryClient, companyId, selectedRef.current, "email_visibility");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [companyId, queryClient]);

  // Soft poll: proven live gap is DB insert OK while a long-lived browser tab stays stale
  // until hard refresh. Keep Realtime primary; this only refetches active Email Workspace queries.
  useEffect(() => {
    if (!companyId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const at = new Date().toISOString();
      rtLog("soft_poll.refetch", { companyId, at });
      publishEmailRealtimeDebug({ softPollAt: at });
      invalidateEmailWorkspaceQueries(queryClient, companyId, selectedRef.current, "email_soft_poll");
    }, EMAIL_WORKSPACE_SOFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [companyId, queryClient]);

  useEffect(() => {
    if (!companyId) {
      rtLog("effect.skip", { reason: "no_companyId" });
      return;
    }

    const channelName = `email-workspace:${companyId}`;
    rtLog("effect.mount", { channelName, companyId, subscribeEpoch });
    publishEmailRealtimeDebug({
      channelName,
      companyId,
      status: "subscribing",
      statusError: null,
      eventCount: 0,
      lastEventAt: null,
      lastEvent: null,
    });

    let eventCount = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as ConversationRow | null;
          eventCount += 1;
          const detail = {
            table: "conversations",
            eventType: payload.eventType,
            conversationId: row?.id ?? null,
            channelType: row?.channel_type ?? null,
            companyId: row?.company_id ?? null,
          };
          rtLog("postgres_changes", detail);
          publishEmailRealtimeDebug({
            eventCount,
            lastEventAt: new Date().toISOString(),
            lastEvent: detail,
          });
          // Fail-open: missing channel_type still invalidates (new INSERT payloads can omit it).
          if (row?.channel_type && row.channel_type !== "email") return;
          invalidateEmailWorkspaceQueries(
            queryClient,
            companyId,
            row?.id ?? null,
            "email_conversations",
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        (payload) => {
          const row = readMessageRow(payload);
          const conversationId = String(row?.conversation_id ?? "").trim();
          if (!conversationId) return;

          void (async () => {
            const kind = await resolveIsEmailConversation(queryClient, conversationId);
            // Fail-open: unknown (RLS miss / race) still invalidates so Inbox updates.
            if (kind === "other") return;

            eventCount += 1;
            const detail = {
              table: "conversation_messages",
              eventType: payload.eventType,
              conversationId,
              messageId: row?.id ?? null,
              messageType: row?.message_type ?? null,
              channelResolve: kind,
            };
            rtLog("postgres_changes", detail);
            publishEmailRealtimeDebug({
              eventCount,
              lastEventAt: new Date().toISOString(),
              lastEvent: detail,
            });

            if (
              payload.eventType === "INSERT"
              && row?.message_type === "incoming"
              && row.id
              && kind === "email"
            ) {
              notifyEmailIncomingMessageAlert({
                messageId: row.id,
                conversationId,
                focusedConversationId: selectedRef.current,
              });
            }

            invalidateEmailWorkspaceQueries(
              queryClient,
              companyId,
              conversationId,
              "email_conversation_messages",
            );
          })();
        },
      )
      .subscribe((status, err) => {
        rtLog("subscribe.status", {
          status,
          error: err?.message ?? null,
          channelName,
        });
        publishEmailRealtimeDebug({
          status,
          statusError: err?.message ?? null,
        });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Remount subscription without requiring a full page refresh.
          reconnectTimer = setTimeout(() => {
            setSubscribeEpoch((value) => value + 1);
          }, 1_500);
        }
      });

    return () => {
      rtLog("effect.cleanup", { channelName, subscribeEpoch });
      if (reconnectTimer) clearTimeout(reconnectTimer);
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient, subscribeEpoch]);
}
