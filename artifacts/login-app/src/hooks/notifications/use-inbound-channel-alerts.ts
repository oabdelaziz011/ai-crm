/**
 * App-shell inbound alerts: toast + bell persistence for new customer messages
 * even when Omnichannel / Email / SMS pages are not open.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import i18n from "@/i18n";
import { useAuth } from "@/context/auth-context";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { playDeskNotificationSound } from "@/lib/omnichannel/presentation/desk-notification-sound";
import { notifyDeskIncomingCustomerAlert } from "@/lib/omnichannel/presentation/desk-incoming-alerts";
import type { InboundChannelKind } from "@/lib/omnichannel/presentation/desk-incoming-alerts";

type MessageRow = {
  id?: string;
  conversation_id?: string;
  message_type?: string;
  channel_type?: string;
  content?: string | null;
  body?: string | null;
};

function readChannel(row: MessageRow | null): InboundChannelKind {
  const raw = (row?.channel_type ?? "").toLowerCase();
  if (raw.includes("email")) return "email";
  if (raw.includes("sms")) return "sms";
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("messenger") || raw.includes("facebook")) return "messenger";
  if (raw.includes("whatsapp")) return "whatsapp";
  return "omnichannel";
}

function focusedConversationFromLocation(location: string): string | null {
  try {
    const query = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    return params.get("conversation")?.trim() || null;
  } catch {
    return null;
  }
}

export function useInboundChannelAlerts(companyId: string | null) {
  const { user } = useAuth();
  const [location] = useLocation();
  const focusedRef = useRef<string | null>(null);
  focusedRef.current = focusedConversationFromLocation(location);

  useEffect(() => {
    if (!companyId || !user?.id) return;

    const channelName = `inbound-alerts:${companyId}:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = (payload.new ?? null) as MessageRow | null;
          if (!row || row.message_type !== "incoming") return;
          const conversationId = row.conversation_id?.trim();
          if (!conversationId) return;

          const preview =
            (typeof row.content === "string" && row.content) ||
            (typeof row.body === "string" && row.body) ||
            "";

          notifyDeskIncomingCustomerAlert(conversationId, focusedRef.current, {
            channel: readChannel(row),
            messageId: row.id ?? null,
            companyId,
            userId: user.id,
            preview,
            persist: true,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, user?.id]);
}

type NotificationRow = {
  id?: string;
  user_id?: string | null;
  channel?: string | null;
  message?: string | null;
};

const HANDOFF_ALERT_TITLE_KEYS: Record<string, string> = {
  assignment: "notifications.platform.operations.conversationAssigned",
  transfer: "notifications.platform.operations.conversationTransferred",
};

function readHandoffAlert(row: NotificationRow | null, userId: string) {
  if (!row || row.user_id !== userId || row.channel !== "in_app") return null;
  let params: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.message ?? "")) as { params?: Record<string, unknown> };
    params = parsed.params ?? {};
  } catch {
    return null;
  }
  const kind = typeof params.kind === "string" ? params.kind : "";
  const titleKey = HANDOFF_ALERT_TITLE_KEYS[kind];
  const conversationId = typeof params.conversationId === "string" ? params.conversationId.trim() : "";
  if (!titleKey || !conversationId) return null;
  if (params.actorUserId === userId) return null;
  return {
    conversationId,
    titleKey,
    customerName: typeof params.customerName === "string" ? params.customerName.trim() : "",
  };
}

/** Sound + toast when a conversation is assigned or transferred to the signed-in agent. */
export function useHandoffAssignmentAlerts(companyId: string | null) {
  const { user } = useAuth();
  const [location] = useLocation();
  const focusedRef = useRef<string | null>(null);
  focusedRef.current = focusedConversationFromLocation(location);

  useEffect(() => {
    if (!companyId || !user?.id) return;
    const userId = user.id;
    const channel = supabase
      .channel(`handoff-assignment-alerts:${companyId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const alert = readHandoffAlert((payload.new ?? null) as NotificationRow | null, userId);
          if (!alert || alert.conversationId === focusedRef.current) return;
          playDeskNotificationSound();
          const shown = toast({
            title: i18n.t(alert.titleKey),
            description: alert.customerName || undefined,
          });
          window.setTimeout(() => shown.dismiss(), 8_000);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, user?.id]);
}
