import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useEmailRoutingConfig } from "@/hooks/email/use-email-routing-config";
import { useEmailTemplates } from "@/hooks/email/use-email-templates";
import { useEmailHealth, useEmailSettings } from "@/hooks/notifications/use-email-health";
import {
  EMAIL_ROUTING_TAB_PERMISSION,
  EMAIL_TEMPLATES_TAB_PERMISSION,
} from "@/lib/email-workspace/email-tab-permissions";
import {
  mapEmailAiCapabilities,
  mapEmailControlCenterStatus,
} from "@/lib/email-workspace/email-control-center-status";

/**
 * Live Email Control Center snapshot from existing company-scoped sources.
 */
export function useEmailControlCenter() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup } = useCommercialFeatureLookup();
  const settingsQuery = useEmailSettings(companyId);
  const healthQuery = useEmailHealth(companyId);
  const routingEntitled = lookup("ai_email_routing");
  const canRouting = isSuperAdmin || hasPermission(EMAIL_ROUTING_TAB_PERMISSION);
  const canTemplates = isSuperAdmin || hasPermission(EMAIL_TEMPLATES_TAB_PERMISSION);
  const { data: routing } = useEmailRoutingConfig(
    companyId,
    routingEntitled === true && canRouting,
  );
  const templatesQuery = useEmailTemplates(companyId, canTemplates);

  const routingHasEnabledTarget = Boolean(
    routing?.categories?.some((row) => row.enabled && row.targetId),
  );

  const snapshot = mapEmailControlCenterStatus({
    settingsLoaded: settingsQuery.isSuccess,
    settings: settingsQuery.data
      ? {
          enabled: settingsQuery.data.enabled,
          conversationEnabled: settingsQuery.data.conversationEnabled,
          smtpHost: settingsQuery.data.smtpHost,
          fromEmail: settingsQuery.data.fromEmail,
          imapHost: settingsQuery.data.imapHost,
          inboundProvider: settingsQuery.data.inboundProvider,
        }
      : null,
    routingEntitled,
    routingHasEnabledTarget,
    ticketingEntitled: lookup("ticketing"),
    templateCount: templatesQuery.data ? templatesQuery.data.length : null,
    outboundHealthOk: healthQuery.data ? healthQuery.data.ok : null,
    inboundHealthOk: null,
  });

  const aiCapabilities = mapEmailAiCapabilities({
    routingEntitled,
    assistantEntitled: lookup("ai_assistant"),
    suggestedRepliesEntitled: lookup("ai_suggested_replies"),
  });

  return {
    companyId,
    snapshot,
    aiCapabilities,
    settings: settingsQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
  };
}
