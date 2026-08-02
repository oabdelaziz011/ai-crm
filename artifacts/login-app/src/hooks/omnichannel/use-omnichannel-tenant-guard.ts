import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import {
  diagnoseInboxEmptyState,
  isWhatsAppCompanyChannel,
  type InboxEmptyDiagnosis,
} from "@/lib/omnichannel/tenant/diagnose-inbox-empty-state";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import type { WorkspaceNavId } from "@/components/omnichannel/workspace-v2/workspace-nav";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

export type OmnichannelTenantContext = {
  companyId: string | null;
  companyName: string | null;
  userEmail: string | null;
  developerMode: boolean;
};

export function useOmnichannelTenantGuard(input: {
  rawRowCount: number;
  visibleCount: number;
  listLoading: boolean;
  activeNav: WorkspaceNavId;
  filters: OmnichannelListFilters;
  selectedConversation: UnifiedConversation | null;
}) {
  const { user, profile, company } = useAuth();
  const { developerMode } = useRbacDeveloperMode();
  const { data: companyChannels = [] } = useCompanyChannelsAdmin();

  const tenant = useMemo<OmnichannelTenantContext>(
    () => ({
      companyId: profile?.company_id ?? null,
      companyName: company?.name ?? null,
      userEmail: user?.email ?? null,
      developerMode,
    }),
    [profile?.company_id, company?.name, user?.email, developerMode],
  );

  const whatsAppChannels = useMemo(
    () => companyChannels.filter(isWhatsAppCompanyChannel),
    [companyChannels],
  );

  const companyChannelIds = useMemo(
    () => new Set(companyChannels.map((channel) => channel.id)),
    [companyChannels],
  );

  const hasWhatsAppChannel = whatsAppChannels.length > 0;

  const whatsAppChannelMismatch = useMemo(() => {
    if (!tenant.companyId) return false;

    const selectedChannelId = input.selectedConversation?.companyChannelId ?? null;
    if (selectedChannelId && !companyChannelIds.has(selectedChannelId)) {
      return true;
    }

    if (input.selectedConversation?.channel === "whatsapp" && !hasWhatsAppChannel) {
      return true;
    }

    if (!hasWhatsAppChannel && input.filters.channel === "whatsapp") {
      return true;
    }

    if (!hasWhatsAppChannel && input.rawRowCount === 0 && !input.listLoading) {
      return true;
    }

    return false;
  }, [
    tenant.companyId,
    input.selectedConversation?.companyChannelId,
    input.selectedConversation?.channel,
    input.filters.channel,
    input.rawRowCount,
    input.listLoading,
    companyChannelIds,
    hasWhatsAppChannel,
  ]);

  const emptyDiagnosis = useMemo<InboxEmptyDiagnosis | null>(
    () =>
      diagnoseInboxEmptyState({
        isLoading: input.listLoading,
        rawRowCount: input.rawRowCount,
        visibleCount: input.visibleCount,
        activeNav: input.activeNav,
        filters: input.filters,
        hasWhatsAppChannel,
      }),
    [
      input.listLoading,
      input.rawRowCount,
      input.visibleCount,
      input.activeNav,
      input.filters,
      hasWhatsAppChannel,
    ],
  );

  return {
    tenant,
    hasWhatsAppChannel,
    whatsAppChannelMismatch,
    emptyDiagnosis,
  };
}
