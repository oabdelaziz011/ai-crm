import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useConversationList } from "@/hooks/conversations/use-conversation-list";
import {
  countEmailWorkspaceOutboundMetrics,
  type EmailOutboundMetricRow,
} from "@/lib/email-workspace/email-workspace-metrics";
import {
  isEmailWorkspaceInboxConversation,
  isEmailWorkspacePendingConversation,
} from "@/lib/email-workspace/email-workspace-list-item";

export type EmailWorkspaceMetrics = {
  incoming: number | null;
  sent: number | null;
  pending: number | null;
  failed: number | null;
  aiRouted: number | null;
  ticketsCreated: number | null;
};

/**
 * Compact Email landing metrics from existing company-scoped Email data.
 * Incoming = Inbox bucket (excludes active drafts).
 * Pending = active draft conversations + outbound delivery-in-flight.
 * Never fabricates values — unavailable counts remain null.
 */
export function useEmailWorkspaceMetrics(companyId: string | null) {
  const listQuery = useConversationList({ channelType: "email" });

  const extras = useQuery({
    queryKey: ["email-workspace-metrics-extras", companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<{
      sent: number | null;
      pending: number | null;
      failed: number | null;
      aiRouted: number | null;
      ticketsCreated: number | null;
    }> => {
      if (!companyId) {
        return { sent: null, pending: null, failed: null, aiRouted: null, ticketsCreated: null };
      }

      const [
        { data: conversations, error: convErr },
        { count: aiRouted, error: aiErr },
        { count: ticketsCreated, error: ticketErr },
      ] = await Promise.all([
        supabase
          .from("conversations")
          .select("id")
          .eq("company_id", companyId)
          .eq("channel_type", "email"),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("channel_type", "email")
          .not("metadata->emailRoutingClassification", "is", null),
        supabase
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .not("conversation_id", "is", null)
          .filter("metadata->>source", "eq", "email"),
      ]);

      if (aiErr) {
        console.warn("[email-metrics] aiRouted count failed", aiErr.message);
      }
      if (ticketErr) {
        console.warn("[email-metrics] ticketsCreated count failed", ticketErr.message);
      }
      if (convErr) {
        console.warn("[email-metrics] email conversations failed", convErr.message);
      }

      let sent: number | null = convErr ? null : 0;
      let pending: number | null = convErr ? null : 0;
      let failed: number | null = convErr ? null : 0;

      const conversationIds = (conversations ?? []).map((row) => row.id as string);
      if (!convErr && conversationIds.length > 0) {
        const { data: outbound, error: outboundErr } = await supabase
          .from("conversation_messages")
          .select("message_type, status, metadata, external_message_id")
          .in("conversation_id", conversationIds)
          .eq("message_type", "outgoing");

        if (outboundErr) {
          console.warn("[email-metrics] outbound count failed", outboundErr.message);
          sent = null;
          pending = null;
          failed = null;
        } else {
          const counts = countEmailWorkspaceOutboundMetrics(
            (outbound ?? []) as EmailOutboundMetricRow[],
          );
          sent = counts.sent;
          pending = counts.pending;
          failed = counts.failed;
        }
      }

      return {
        sent,
        pending,
        failed,
        aiRouted: aiErr ? null : Number(aiRouted ?? 0),
        ticketsCreated: ticketErr ? null : Number(ticketsCreated ?? 0),
      };
    },
  });

  const inboxCount = listQuery.data
    ? listQuery.data.filter(isEmailWorkspaceInboxConversation).length
    : null;
  const draftPendingCount = listQuery.data
    ? listQuery.data.filter(isEmailWorkspacePendingConversation).length
    : null;

  const metrics: EmailWorkspaceMetrics = {
    incoming: inboxCount,
    sent: extras.data ? extras.data.sent : null,
    pending:
      extras.data?.pending == null && draftPendingCount == null
        ? null
        : (extras.data?.pending ?? 0) + (draftPendingCount ?? 0),
    failed: extras.data ? extras.data.failed : null,
    aiRouted: extras.data ? extras.data.aiRouted : null,
    ticketsCreated: extras.data ? extras.data.ticketsCreated : null,
  };

  return {
    metrics,
    isLoading: listQuery.isLoading || extras.isLoading,
  };
}
