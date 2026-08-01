import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceSidebarLabels } from "@/components/omnichannel/workspace-sidebar";

export function useWorkspaceSidebarLabels(): WorkspaceSidebarLabels {
  const { t } = useTranslation("common");
  return useMemo(
    () => ({
      customer: t("omnichannel.sidebar.customer"),
      aiSummary: t("omnichannel.sidebar.aiSummary"),
      crm: t("omnichannel.sidebar.crm"),
      assignment: t("omnichannel.sidebar.assignment"),
      properties: t("omnichannel.sidebar.properties"),
      timeline: t("omnichannel.sidebar.timeline"),
      internalNotes: t("omnichannel.sidebar.internalNotes"),
      recentActivity: t("omnichannel.sidebar.recentActivity"),
      empty: t("omnichannel.sidebar.empty"),
      summary: t("omnichannel.aiAssist.summary"),
      intent: t("omnichannel.aiAssist.intent"),
      sentiment: t("omnichannel.aiAssist.sentiment"),
      priority: t("omnichannel.aiAssist.priority"),
      suggestedReply: t("omnichannel.aiAssist.suggestedReply"),
      confidence: t("omnichannel.aiAssist.confidence"),
      assignTo: t("omnichannel.sidebar.assignTo"),
      currentOwner: t("omnichannel.customer.owner"),
      escalationHistory: t("omnichannel.sidebar.escalationHistory"),
      returnConversation: t("omnichannel.actions.returnConversation"),
      crmTabs: {
        customer: t("omnichannel.sidebar.crmTabs.customer"),
        orders: t("omnichannel.sidebar.crmTabs.orders"),
        invoices: t("omnichannel.sidebar.crmTabs.invoices"),
        tickets: t("omnichannel.sidebar.crmTabs.tickets"),
        activities: t("omnichannel.sidebar.crmTabs.activities"),
        timeline: t("omnichannel.sidebar.crmTabs.timeline"),
      },
      targetTypes: {
        user: t("omnichannel.assignment.user"),
        team: t("omnichannel.assignment.team"),
        department: t("omnichannel.assignment.department"),
        ai_employee: t("omnichannel.assignment.aiEmployee"),
        queue: t("omnichannel.assignment.queue"),
      },
    }),
    [t],
  );
}

export function useConversationViewLabels() {
  const { t } = useTranslation("common");
  return useMemo(
    () => ({
      selectConversation: t("omnichannel.selectConversation"),
      loading: t("status.loading"),
      unknownContact: t("omnichannel.unknownContact"),
      createCustomer: t("omnichannel.customer.createCustomer"),
      linkCustomer: t("omnichannel.customer.linkCustomer"),
      vip: t("omnichannel.customer.vip"),
      owner: t("omnichannel.customer.owner"),
      unassigned: t("omnichannel.customer.unassigned"),
      escalated: t("omnichannel.escalatedBadge"),
      status: t("omnichannel.header.status"),
      sla: t("omnichannel.header.sla"),
      language: t("omnichannel.header.language"),
      lastActivity: t("omnichannel.header.lastActivity"),
      reply: t("omnichannel.actions.reply"),
      assign: t("omnichannel.actions.assign"),
      statusAction: t("omnichannel.actions.status"),
      escalate: t("omnichannel.actions.escalate"),
      close: t("omnichannel.actions.close"),
      resolve: t("omnichannel.actions.resolve", { defaultValue: "Resolve" }),
      reopen: t("omnichannel.actions.reopen", { defaultValue: "Reopen" }),
      ai: t("omnichannel.actions.ai"),
      release: t("omnichannel.actions.release"),
      returnConversation: t("omnichannel.actions.returnConversation"),
      cancelEscalation: t("omnichannel.actions.cancelEscalation"),
      more: t("omnichannel.actions.more"),
      internalNote: t("omnichannel.composer.internalNote"),
      send: t("omnichannel.composer.send"),
      templates: t("omnichannel.composer.templates"),
      variables: t("omnichannel.composer.variables"),
      voicePlaceholder: t("omnichannel.composer.voicePlaceholder"),
      emoji: t("omnichannel.composer.emoji"),
      attachments: t("omnichannel.composer.attachments"),
      aiRewrite: t("omnichannel.composer.aiRewrite"),
      translate: t("omnichannel.composer.translate"),
      composerPlaceholder: t("omnichannel.composer.placeholder"),
      languageComposer: t("omnichannel.composer.language"),
    }),
    [t],
  );
}

const TAG_DEFINITIONS = [
  { id: "vip", labelKey: "omnichannel.tags.vip" },
  { id: "complaint", labelKey: "omnichannel.tags.complaint" },
  { id: "sales", labelKey: "omnichannel.tags.sales" },
  { id: "support", labelKey: "omnichannel.tags.support" },
] as const;

export function useConversationTagOptions(
  conversations: Array<{ source: { metadata: Record<string, unknown> } }>,
) {
  const { t } = useTranslation("common");
  return useMemo(
    () =>
      TAG_DEFINITIONS.map((tag) => ({
        id: tag.id,
        label: t(tag.labelKey),
        count: conversations.filter((conversation) => {
          const tags = conversation.source.metadata?.tags;
          if (!Array.isArray(tags)) return false;
          return tags.some((entry) => String(entry).toLowerCase() === tag.id);
        }).length,
      })),
    [conversations, t],
  );
}
