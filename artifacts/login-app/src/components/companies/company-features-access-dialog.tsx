import { useEffect, useMemo, useState, Fragment } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCompanyEntitlements, useSyncCompanyPackageEntitlements } from "@/hooks/billing/use-company-entitlements";
import { useCompanyAccessState } from "@/hooks/billing/use-company-feature";
import { useFeaturePermissionMap } from "@/hooks/billing/use-feature-definition-permissions";
import {
  useExtendCompanyTrial,
  useRevokeCompanyFeatureGrant,
  useSetCompanyFeatureGrant,
} from "@/hooks/companies/use-company-approval";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isCommercialEntitlement, normalizeEntitlementSource } from "@/lib/billing/entitlement-display";
import {
  filterCompanyFeatureEntitlementsForDisplay,
  resolveCompanyFeatureCatalogSection,
  sortCompanyFeatureEntitlements,
} from "@/lib/billing/company-feature-catalog-display";

type CompanyFeaturesAccessDialogProps = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CompanyFeaturesAccessDialog({
  company,
  open,
  onOpenChange,
}: CompanyFeaturesAccessDialogProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const companyId = company?.id ?? null;
  const { data: entitlements = [], isLoading, refetch } = useCompanyEntitlements(companyId, open);
  const accessState = useCompanyAccessState(companyId, open);
  const { map: featurePermissionMap } = useFeaturePermissionMap(open);
  const setGrant = useSetCompanyFeatureGrant();
  const revokeGrant = useRevokeCompanyFeatureGrant();
  const extendTrial = useExtendCompanyTrial();
  const syncPackage = useSyncCompanyPackageEntitlements();
  const [extendDays, setExtendDays] = useState("14");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [localTrialEndsAt, setLocalTrialEndsAt] = useState<string | null>(null);

  const allCommercialUnlinked =
    entitlements.filter((row) => isCommercialEntitlement(row)).length > 0 &&
    entitlements
      .filter((row) => isCommercialEntitlement(row))
      .every((row) => normalizeEntitlementSource(row.source) === "none");

  useEffect(() => {
    setLocalTrialEndsAt(null);
    setSelectedCode(null);
    setExpandedCode(null);
  }, [companyId, open]);

  const selected = useMemo(
    () => entitlements.find((row) => row.feature_code === selectedCode) ?? null,
    [entitlements, selectedCode],
  );

  const selectedPermissions = useMemo(() => {
    if (!selectedCode) return [];
    return featurePermissionMap.get(selectedCode) ?? [];
  }, [featurePermissionMap, selectedCode]);

  const visibleEntitlements = useMemo(() => {
    const filtered = filterCompanyFeatureEntitlementsForDisplay(
      entitlements,
      featurePermissionMap,
    );
    return sortCompanyFeatureEntitlements(filtered);
  }, [entitlements, featurePermissionMap]);

  const trialEndsAt = localTrialEndsAt ?? company?.subscription_expires_at ?? null;

  async function toggleFeature(code: string, enable: boolean) {
    if (!companyId) return;
    try {
      if (enable) {
        await setGrant.mutateAsync({
          companyId,
          featureCode: code,
          enabled: true,
          source: "manual",
        });
      } else {
        await revokeGrant.mutateAsync({ companyId, featureCode: code });
      }
      toast({ title: t("companies.features.saveSuccess") });
    } catch (error) {
      toast({
        title: t("companies.features.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleExtendTrial() {
    if (!companyId) return;
    const days = Math.max(1, Number(extendDays) || 14);
    const base = trialEndsAt && new Date(trialEndsAt) > new Date() ? new Date(trialEndsAt) : new Date();
    const next = new Date(base.getTime() + days * 86400000);
    try {
      const result = await extendTrial.mutateAsync({
        companyId,
        newEndsAt: next.toISOString(),
      });
      if (result.trialEndsAt) {
        setLocalTrialEndsAt(result.trialEndsAt);
      }
      toast({ title: t("companies.features.extendTrialSuccess") });
    } catch (error) {
      toast({
        title: t("companies.features.extendTrialFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("companies.features.title")}: {company.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("companies.features.groupsHint")}</p>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border/60 px-2.5 py-1">
            {t("companies.features.accessState")}:{" "}
            <strong>{accessState.data ?? "—"}</strong>
          </span>
          <span className="rounded-full border border-border/60 px-2.5 py-1">
            {t("status." + company.status.toLowerCase(), { defaultValue: company.status })}
          </span>
          {trialEndsAt ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              {t("companies.features.trialEnds")}: {format(new Date(trialEndsAt), "MMM d, yyyy")}
            </span>
          ) : null}
        </div>

        {(company.status === "Trial" || accessState.data === "trial") && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border/60 p-3">
            <div className="space-y-1">
              <Label htmlFor="extend-days">{t("companies.features.extendByDays")}</Label>
              <Input
                id="extend-days"
                className="w-28"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => void handleExtendTrial()}
              disabled={extendTrial.isPending}
            >
              {extendTrial.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("companies.features.extendTrial")
              )}
            </Button>
          </div>
        )}

        {allCommercialUnlinked ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>{t("billing.entitlements.unlinkedHint")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-lg"
              disabled={syncPackage.isPending || !companyId}
              onClick={() => {
                if (!companyId) return;
                void syncPackage
                  .mutateAsync(companyId)
                  .then(async (result) => {
                    await refetch();
                    toast({
                      title: result.synced
                        ? t("billing.entitlements.syncSuccess", { count: result.provisioned })
                        : t(`billing.entitlements.syncReason.${result.reason ?? "unknown"}`),
                      variant: result.synced ? "default" : "destructive",
                    });
                  })
                  .catch((error: unknown) => {
                    toast({
                      title: t("companies.features.saveFailed"),
                      description: error instanceof Error ? error.message : undefined,
                      variant: "destructive",
                    });
                  });
              }}
            >
              <RefreshCw className={syncPackage.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
              {t("billing.entitlements.syncFromPackage")}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading", { defaultValue: "Loading…" })}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("companies.features.feature")}</th>
                    <th className="px-3 py-2 text-start">{t("companies.features.permissions")}</th>
                    <th className="px-3 py-2 text-start">{t("companies.features.status")}</th>
                    <th className="px-3 py-2 text-end">{t("companies.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntitlements.map((row, index) => {
                    const included = featurePermissionMap.get(row.feature_code) ?? [];
                    const isExpanded = expandedCode === row.feature_code;
                    const section = resolveCompanyFeatureCatalogSection(row.feature_code);
                    const prevSection =
                      index > 0
                        ? resolveCompanyFeatureCatalogSection(
                            visibleEntitlements[index - 1]!.feature_code,
                          )
                        : null;
                    const showSectionHeader = section !== prevSection;
                    return (
                      <Fragment key={row.feature_code}>
                        {showSectionHeader ? (
                          <tr className="border-t border-border/50 bg-muted/30">
                            <td
                              colSpan={4}
                              className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {section === "administration"
                                ? t("companies.features.sectionAdministration", {
                                    defaultValue: "Administration",
                                  })
                                : section === "legacy"
                                  ? t("companies.features.sectionLegacy", {
                                      defaultValue: "Legacy",
                                    })
                                  : t("companies.features.sectionProduct", {
                                      defaultValue: "Product capabilities",
                                    })}
                            </td>
                          </tr>
                        ) : null}
                        <tr
                          className={cn(
                            "border-t border-border/50",
                            selectedCode === row.feature_code && "bg-primary/5",
                          )}
                        >
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            className="text-start font-medium hover:underline"
                            onClick={() => setSelectedCode(row.feature_code)}
                          >
                            {row.label}
                          </button>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.category ?? row.feature_code}
                          </p>
                          {included.length > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-6 px-1 text-[11px] text-muted-foreground"
                              onClick={() => {
                                setSelectedCode(row.feature_code);
                                setExpandedCode(isExpanded ? null : row.feature_code);
                              }}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="me-1 size-3" />
                                  {t("companies.features.hidePermissions")}
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="me-1 size-3" />
                                  {t("companies.features.viewPermissions")}
                                </>
                              )}
                            </Button>
                          ) : null}
                          {isExpanded ? (
                            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                              {included.map((code) => (
                                <li key={code} className="font-mono">
                                  ✓ {code}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {t("companies.features.permissionCount", { count: included.length })}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              row.enabled
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {row.enabled
                              ? t("companies.features.enabled")
                              : t("companies.features.disabled")}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-xs"
                            disabled={setGrant.isPending || revokeGrant.isPending}
                            onClick={() => void toggleFeature(row.feature_code, !row.enabled)}
                          >
                            {row.enabled
                              ? t("companies.features.disable")
                              : t("companies.features.enable")}
                          </Button>
                        </td>
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border/60 p-4 text-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("companies.features.details")}
              </h3>
              {selected ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.feature")}</dt>
                    <dd className="font-medium">{selected.label}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.permissions")}</dt>
                    <dd>
                      {t("companies.features.permissionCount", {
                        count: selectedPermissions.length,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.source")}</dt>
                    <dd className="uppercase">{selected.source ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.startsAt")}</dt>
                    <dd>
                      {selected.starts_at
                        ? format(new Date(selected.starts_at), "MMM d, yyyy HH:mm")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.expiresAt")}</dt>
                    <dd>
                      {selected.expires_at
                        ? format(new Date(selected.expires_at), "MMM d, yyyy HH:mm")
                        : t("companies.features.indefinite")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("companies.features.notes")}</dt>
                    <dd>{selected.notes || "—"}</dd>
                  </div>
                  <p className="pt-2 text-xs text-muted-foreground">
                    {t("companies.features.employeeRbacHint")}
                  </p>
                </dl>
              ) : (
                <p className="text-muted-foreground">{t("companies.features.selectHint")}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            {t("buttons.close", { defaultValue: "Close" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
