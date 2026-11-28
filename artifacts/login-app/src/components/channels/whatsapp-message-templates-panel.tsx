import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useProvisionWhatsAppCompanyTemplates,
  useSyncWhatsAppCompanyTemplates,
  useWhatsAppTemplateReadiness,
} from "@/hooks/notifications/use-whatsapp-templates";
import { isWhatsAppApiConfigured } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import {
  WHATSAPP_PURPOSE_TEMPLATE_SPECS,
  type WhatsAppMessagePurpose,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";
import { WHATSAPP_TRANSACTIONAL_PURPOSES } from "@/lib/notifications/providers/whatsapp/services/whatsapp-company-templates";

const PROVISION_ALL_VALUE = "__all__";

export type WhatsAppMessageTemplatesPanelProps = {
  companyId: string;
  /** Company has a stored WABA id (required for Meta template Graph). */
  hasBusinessAccountId: boolean;
  /** Company has a stored Meta access token (management). */
  hasAccessToken: boolean;
  /** Outbound messaging toggle — informational only; does not gate admin actions. */
  messagingEnabled: boolean;
};

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusTone(status: string): string {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "PENDING":
    case "IN_APPEAL":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "REJECTED":
    case "PAUSED":
    case "DISABLED":
    case "DELETED":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    case "NOT_CREATED":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function WhatsAppMessageTemplatesPanel({
  companyId,
  hasBusinessAccountId,
  hasAccessToken,
  messagingEnabled,
}: WhatsAppMessageTemplatesPanelProps) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const apiConfigured = isWhatsAppApiConfigured();

  const defaultPurpose = WHATSAPP_TRANSACTIONAL_PURPOSES[0] ?? "customer_order_status_confirmed";
  const [provisionScope, setProvisionScope] = useState<string>(defaultPurpose);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Template admin needs WABA + management token. Outbound "enabled" is not required.
  const canManageTemplates = hasBusinessAccountId && hasAccessToken;
  const templatesQuery = useWhatsAppTemplateReadiness(companyId, {
    enabled: canManageTemplates && apiConfigured,
  });
  const syncMutation = useSyncWhatsAppCompanyTemplates(companyId);
  const provisionMutation = useProvisionWhatsAppCompanyTemplates(companyId);

  const templates = templatesQuery.data?.templates ?? [];
  const lastSyncedAt = templatesQuery.data?.lastSyncedAt ?? null;
  const readiness = templatesQuery.readiness;
  const setupPending = readiness.setupPending || templatesQuery.data?.setupPending === true;
  const busy =
    templatesQuery.isFetching || syncMutation.isPending || provisionMutation.isPending;
  const actionsEnabled = canManageTemplates && apiConfigured && !busy && !setupPending;

  const selectedPurposes = useMemo((): WhatsAppMessagePurpose[] | undefined => {
    if (provisionScope === PROVISION_ALL_VALUE) return undefined;
    return [provisionScope as WhatsAppMessagePurpose];
  }, [provisionScope]);

  const confirmDescription = useMemo(() => {
    if (provisionScope === PROVISION_ALL_VALUE) {
      return t("notifications.whatsapp.settings.messageTemplates.provisionConfirmAll", {
        count: WHATSAPP_TRANSACTIONAL_PURPOSES.length,
      });
    }
    const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[provisionScope as WhatsAppMessagePurpose];
    return t("notifications.whatsapp.settings.messageTemplates.provisionConfirmOne", {
      purpose: provisionScope,
      metaName: spec?.recommendedMetaName ?? provisionScope,
      language: spec?.language ?? "en_US",
    });
  }, [provisionScope, t]);

  const onSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast({
        title: t("notifications.whatsapp.settings.messageTemplates.syncSuccess"),
        description: t("notifications.whatsapp.settings.messageTemplates.syncSummary", {
          approved: result.approved,
          upserted: result.upserted,
          notCreated: result.notCreated,
        }),
      });
    } catch (error) {
      toast({
        title: t("notifications.whatsapp.settings.messageTemplates.syncFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const onConfirmProvision = async () => {
    setConfirmOpen(false);
    try {
      const result = await provisionMutation.mutateAsync({
        purposes: selectedPurposes,
      });
      toast({
        title: t("notifications.whatsapp.settings.messageTemplates.provisionSuccess"),
        description: t("notifications.whatsapp.settings.messageTemplates.provisionSummary", {
          created: result.created,
          reused: result.reused,
          failed: result.failed,
        }),
      });
    } catch (error) {
      toast({
        title: t("notifications.whatsapp.settings.messageTemplates.provisionFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardCard className="p-6 space-y-4" data-testid="whatsapp-message-templates-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold">
            {t("notifications.whatsapp.settings.messageTemplates.title")}
          </h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {t("notifications.whatsapp.settings.messageTemplates.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={provisionScope}
            onValueChange={setProvisionScope}
            disabled={!actionsEnabled}
          >
            <SelectTrigger
              className="w-[min(100%,18rem)] h-9"
              data-testid="whatsapp-templates-provision-scope"
            >
              <SelectValue
                placeholder={t(
                  "notifications.whatsapp.settings.messageTemplates.provisionScopePlaceholder",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {WHATSAPP_TRANSACTIONAL_PURPOSES.map((purpose) => {
                const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
                return (
                  <SelectItem key={purpose} value={purpose}>
                    {spec.recommendedMetaName} ({purpose})
                  </SelectItem>
                );
              })}
              <SelectItem value={PROVISION_ALL_VALUE}>
                {t("notifications.whatsapp.settings.messageTemplates.provisionAllOption", {
                  count: WHATSAPP_TRANSACTIONAL_PURPOSES.length,
                })}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!actionsEnabled}
            onClick={() => setConfirmOpen(true)}
            data-testid="whatsapp-templates-provision"
          >
            {provisionMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin me-2" />
            ) : (
              <Sparkles className="w-4 h-4 me-2" />
            )}
            {t("notifications.whatsapp.settings.messageTemplates.provision")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!actionsEnabled}
            onClick={() => void onSync()}
            data-testid="whatsapp-templates-sync"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin me-2" />
            ) : (
              <RefreshCw className="w-4 h-4 me-2" />
            )}
            {t("notifications.whatsapp.settings.messageTemplates.sync")}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="whatsapp-templates-provision-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("notifications.whatsapp.settings.messageTemplates.provisionConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("notifications.whatsapp.settings.messageTemplates.provisionConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onConfirmProvision()}
              data-testid="whatsapp-templates-provision-confirm-action"
            >
              {t("notifications.whatsapp.settings.messageTemplates.provisionConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!apiConfigured ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("notifications.whatsapp.settings.messageTemplates.apiMissing")}
        </p>
      ) : !canManageTemplates ? (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          data-testid="whatsapp-templates-admin-unavailable"
        >
          {!hasBusinessAccountId && !hasAccessToken
            ? t("notifications.whatsapp.settings.messageTemplates.notConnectedHint")
            : !hasBusinessAccountId
              ? t("notifications.whatsapp.settings.messageTemplates.wabaMissingHint")
              : t("notifications.whatsapp.settings.messageTemplates.tokenMissingHint")}
        </p>
      ) : (
        <>
          {!messagingEnabled ? (
            <p
              className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2"
              role="status"
              data-testid="whatsapp-templates-messaging-disabled-note"
            >
              {t("notifications.whatsapp.settings.messageTemplates.messagingDisabledAdminOk")}
            </p>
          ) : null}

          {setupPending ? (
            <p
              className="text-sm text-amber-800 dark:text-amber-200 bg-amber-500/10 rounded-md px-3 py-2"
              role="status"
              data-testid="whatsapp-templates-setup-pending"
            >
              {t("notifications.whatsapp.settings.messageTemplates.setupPending")}
            </p>
          ) : (
            <div
              className="text-sm text-muted-foreground space-y-1"
              data-testid="whatsapp-templates-readiness"
            >
              <p>
                {t("notifications.whatsapp.settings.messageTemplates.readiness", {
                  approved: readiness.approvedCount,
                  pending: readiness.pendingCount,
                  rejected: readiness.rejectedCount,
                  paused: readiness.pausedCount,
                  notCreated: readiness.notCreatedCount,
                })}
              </p>
              {!readiness.readyForTransactionalSends ? (
                <p className="text-amber-800 dark:text-amber-200">
                  {t("notifications.whatsapp.settings.messageTemplates.notReadyHint")}
                </p>
              ) : (
                <p className="text-emerald-700 dark:text-emerald-300">
                  {t("notifications.whatsapp.settings.messageTemplates.readyHint")}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t("notifications.whatsapp.settings.messageTemplates.lastSynced", {
              value: formatDateTime(lastSyncedAt, i18n.language),
            })}
          </p>

          {templatesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("notifications.whatsapp.settings.messageTemplates.loading")}
            </div>
          ) : templatesQuery.error && !setupPending ? (
            <p className="text-sm text-destructive" role="alert">
              {templatesQuery.error instanceof Error
                ? templatesQuery.error.message
                : String(templatesQuery.error)}
            </p>
          ) : templates.length === 0 && !setupPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("notifications.whatsapp.settings.messageTemplates.empty")}
            </p>
          ) : templates.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-start">
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.name")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.purpose")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.language")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.recipient")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.metaStatus")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.lastSync")}
                    </th>
                    <th className="px-3 py-2 font-medium text-start">
                      {t("notifications.whatsapp.settings.messageTemplates.columns.error")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2 font-mono text-xs">{row.metaTemplateName}</td>
                      <td className="px-3 py-2">{row.purposeKey}</td>
                      <td className="px-3 py-2">{row.languageCode}</td>
                      <td className="px-3 py-2">{row.recipient ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusTone(row.metaStatus)}`}
                        >
                          {row.metaStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateTime(row.lastSyncedAt, i18n.language)}
                      </td>
                      <td className="px-3 py-2 text-destructive max-w-[14rem] break-words">
                        {row.lastError ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}
