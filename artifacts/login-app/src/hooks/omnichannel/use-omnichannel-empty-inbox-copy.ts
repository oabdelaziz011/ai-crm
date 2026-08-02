import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { InboxEmptyDiagnosis } from "@/lib/omnichannel/tenant/diagnose-inbox-empty-state";
import type { OmnichannelTenantContext } from "@/hooks/omnichannel/use-omnichannel-tenant-guard";

export function useOmnichannelEmptyInboxCopy(
  diagnosis: InboxEmptyDiagnosis | null,
  tenant: OmnichannelTenantContext,
): { title: string; hint: string } | null {
  const { t } = useTranslation("common");

  return useMemo(() => {
    if (!diagnosis || diagnosis.code === "loading") {
      return null;
    }

    const companyLabel = tenant.companyName ?? t("omnichannel.tenantGuard.unknownCompany");
    const companyIdHint = tenant.developerMode && tenant.companyId
      ? t("omnichannel.tenantGuard.emptyCompanyIdHint", { companyId: tenant.companyId })
      : "";

    switch (diagnosis.code) {
      case "no_whatsapp_for_tenant":
        return {
          title: t("omnichannel.tenantGuard.emptyNoWhatsAppTitle", { company: companyLabel }),
          hint: [
            t("omnichannel.tenantGuard.emptyNoWhatsAppHint"),
            tenant.userEmail
              ? t("omnichannel.tenantGuard.emptySignedInAs", { email: tenant.userEmail })
              : null,
            companyIdHint || null,
          ]
            .filter(Boolean)
            .join(" "),
        };
      case "no_conversations":
        return {
          title: t("omnichannel.tenantGuard.emptyNoRowsTitle", { company: companyLabel }),
          hint: [
            t("omnichannel.tenantGuard.emptyNoRowsHint"),
            companyIdHint || null,
          ]
            .filter(Boolean)
            .join(" "),
        };
      case "queue_mine":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueMineTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueMineHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_ai":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueAiTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueAiHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_assigned":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueAssignedTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueAssignedHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_escalated":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueEscalatedTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueGenericHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_waiting":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueWaitingTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueGenericHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_closed":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueClosedTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueGenericHint", { count: diagnosis.rawRowCount }),
        };
      case "queue_archived":
        return {
          title: t("omnichannel.tenantGuard.emptyQueueArchivedTitle"),
          hint: t("omnichannel.tenantGuard.emptyQueueGenericHint", { count: diagnosis.rawRowCount }),
        };
      case "search":
        return {
          title: t("omnichannel.tenantGuard.emptySearchTitle"),
          hint: t("omnichannel.tenantGuard.emptySearchHint", {
            query: diagnosis.searchQuery ?? "",
            count: diagnosis.rawRowCount,
          }),
        };
      case "channel_filter":
        return {
          title: t("omnichannel.tenantGuard.emptyChannelTitle"),
          hint: t("omnichannel.tenantGuard.emptyChannelHint", {
            channel: diagnosis.channelFilter ?? "",
            count: diagnosis.rawRowCount,
          }),
        };
      case "client_filters":
        return {
          title: t("omnichannel.tenantGuard.emptyFilteredTitle"),
          hint: t("omnichannel.tenantGuard.emptyFilteredHint", { count: diagnosis.rawRowCount }),
        };
      default:
        return null;
    }
  }, [diagnosis, tenant, t]);
}
