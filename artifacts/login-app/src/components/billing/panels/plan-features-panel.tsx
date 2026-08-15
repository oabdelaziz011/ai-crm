import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingGrantCommercialFeatureDialog } from "@/components/billing/dialogs/billing-grant-commercial-feature-dialog";
import { BillingRevokeFeatureGrantDialog } from "@/components/billing/dialogs/billing-revoke-feature-grant-dialog";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCompanyEntitlements,
  useSyncCompanyPackageEntitlements,
} from "@/hooks/billing/use-company-entitlements";
import { useToast } from "@/hooks/use-toast";
import {
  canDirectRevokeEntitlementSource,
  entitlementSourceToneClass,
  isCommercialEntitlement,
  isManagedEntitlementSource,
  normalizeEntitlementSource,
} from "@/lib/billing/entitlement-display";
import { formatBillingDate } from "@/lib/billing/format";
import type { CompanyEntitlement } from "@/lib/billing/types";

type PlanFeaturesPanelProps = {
  companyId: string;
  enabled?: boolean;
  /** Super-admin commercial access — not billing.edit. */
  canManageCommercial?: boolean;
};

export function PlanFeaturesPanel({
  companyId,
  enabled = true,
  canManageCommercial = false,
}: PlanFeaturesPanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data: entitlements = [], isLoading, error, refetch } = useCompanyEntitlements(
    companyId,
    enabled,
  );
  const syncPackage = useSyncCompanyPackageEntitlements();
  const autoSyncAttempted = useRef<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CompanyEntitlement | null>(null);

  const commercialRows = useMemo(
    () => entitlements.filter((row) => isCommercialEntitlement(row)),
    [entitlements],
  );
  const allCommercialUnlinked =
    commercialRows.length > 0 &&
    commercialRows.every((row) => normalizeEntitlementSource(row.source) === "none");

  const showToastError = (message: string) => {
    toast({ variant: "destructive", title: t("billing.toast.errorTitle"), description: message });
  };
  const showToastSuccess = (description: string) => {
    toast({ title: t("billing.toast.successTitle"), description });
  };

  const sourceLabel = (source: string) => {
    const key = normalizeEntitlementSource(source);
    return t(`billing.detail.featureSources.${key}`, key);
  };

  const runSync = async (silent = false) => {
    try {
      const result = await syncPackage.mutateAsync(companyId);
      await refetch();
      if (!silent) {
        if (result.synced) {
          showToastSuccess(
            t("billing.entitlements.syncSuccess", {
              count: result.provisioned,
              defaultValue: "Synced {{count}} package entitlements from the assigned plan.",
            }),
          );
        } else {
          showToastError(
            t(`billing.entitlements.syncReason.${result.reason ?? "unknown"}`, {
              defaultValue:
                result.reason === "no_plan"
                  ? "No package assigned to this company yet. Assign a plan first."
                  : result.reason === "empty_package_features"
                    ? "Assigned package has no mapped features."
                    : "Could not sync package entitlements.",
            }),
          );
        }
      }
    } catch (err) {
      if (!silent) {
        showToastError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  useEffect(() => {
    if (!enabled || !canManageCommercial || isLoading || error) return;
    if (!allCommercialUnlinked) return;
    if (autoSyncAttempted.current === companyId) return;
    autoSyncAttempted.current = companyId;
    void runSync(true);
    // One-shot repair when commercial sources are all "none".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCommercialUnlinked, canManageCommercial, companyId, enabled, error, isLoading]);

  return (
    <DashboardCard className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 p-5">
        <div>
          <h2 className="font-semibold">
            {t("billing.detail.features", "Commercial entitlements")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "billing.detail.featuresHint",
              "Effective access from feature definitions and company grants (package, trial, manual, contract, system).",
            )}
          </p>
          {allCommercialUnlinked ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {t(
                "billing.entitlements.unlinkedHint",
                "Commercial features show “none” because package grants were never provisioned. Sync from the assigned package to connect them.",
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageCommercial ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={syncPackage.isPending}
                onClick={() => void runSync(false)}
              >
                <RefreshCw className={syncPackage.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
                {t("billing.entitlements.syncFromPackage", "Sync from package")}
              </Button>
              <Button size="sm" onClick={() => setGrantOpen(true)}>
                {t("billing.entitlements.grantAction", "Grant commercial access")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <div className="p-5">
          <DashboardTableSkeleton rows={5} />
        </div>
      ) : entitlements.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noFeatures")} icon={Sparkles} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.detail.featureName")}</TableHead>
                <TableHead>{t("billing.entitlements.featureCode", "Code")}</TableHead>
                <TableHead>{t("billing.entitlements.classification", "Type")}</TableHead>
                <TableHead>{t("billing.tables.status")}</TableHead>
                <TableHead>{t("billing.detail.featureSource")}</TableHead>
                <TableHead>{t("billing.entitlements.startsAt", "Starts")}</TableHead>
                <TableHead>{t("billing.entitlements.expiresAt", "Expires")}</TableHead>
                {canManageCommercial ? (
                  <TableHead className="text-end">{t("billing.tables.actions")}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entitlements.map((item) => {
                const source = normalizeEntitlementSource(item.source);
                const commercial = isCommercialEntitlement(item);
                const managed = isManagedEntitlementSource(source);
                const canRevoke = canDirectRevokeEntitlementSource(source);
                const hasActiveGrant = ["package", "trial", "manual", "contract", "system"].includes(
                  source,
                );

                return (
                  <TableRow key={item.feature_code}>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.feature_code}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {commercial
                          ? t("billing.entitlements.commercial", "Commercial")
                          : t("billing.entitlements.core", "Core")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={item.enabled ? "text-emerald-400" : "text-muted-foreground"}>
                        {item.enabled
                          ? t("billing.common.enabled")
                          : t("billing.common.disabled")}
                      </span>
                      {hasActiveGrant && !item.enabled ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t(
                            "billing.entitlements.grantExistsNotEffective",
                            "Grant present; not currently effective",
                          )}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={entitlementSourceToneClass(source)}>
                        {sourceLabel(source)}
                      </Badge>
                      {managed ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t(
                            "billing.entitlements.managedSourceHint",
                            "Managed by package / trial / system lifecycle",
                          )}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.starts_at
                        ? formatBillingDate(item.starts_at, true)
                        : t("billing.common.notAvailable")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.expires_at
                        ? formatBillingDate(item.expires_at, true)
                        : source === "none" || source === "default"
                          ? t("billing.common.notAvailable")
                          : t("billing.entitlements.indefinite", "No expiration")}
                    </TableCell>
                    {canManageCommercial ? (
                      <TableCell className="text-end">
                        {canRevoke ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setRevokeTarget(item)}
                          >
                            {source === "contract"
                              ? t("billing.entitlements.revokeContract", "Revoke contract grant")
                              : t("billing.entitlements.revokeManual", "Revoke manual grant")}
                          </Button>
                        ) : managed ? (
                          <span className="text-xs text-muted-foreground">
                            {t("billing.entitlements.revokeManagedBlocked", "Managed — no direct revoke")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canManageCommercial ? (
        <>
          <BillingGrantCommercialFeatureDialog
            open={grantOpen}
            onOpenChange={setGrantOpen}
            companyId={companyId}
            entitlements={entitlements}
            onSuccess={() =>
              showToastSuccess(
                t("billing.entitlements.grantSuccess", "Commercial feature grant applied."),
              )
            }
            onError={showToastError}
          />
          <BillingRevokeFeatureGrantDialog
            open={Boolean(revokeTarget)}
            onOpenChange={(open) => {
              if (!open) setRevokeTarget(null);
            }}
            companyId={companyId}
            entitlement={revokeTarget}
            onSuccess={() =>
              showToastSuccess(t("billing.entitlements.revokeSuccess", "Grant revoked."))
            }
            onError={showToastError}
          />
        </>
      ) : null}
    </DashboardCard>
  );
}
