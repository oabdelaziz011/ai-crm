import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCompanyLocation } from "@/components/companies/company-onboarding-wizard";
import {
  CompanyApprovalWizardStepper,
  type WizardStepId,
} from "@/components/companies/approval/wizard/company-approval-wizard-stepper";
import { useToast } from "@/hooks/use-toast";
import {
  useApproveCompany,
  useRejectCompany,
  useSetCompanyFeatureGrant,
  useRevokeCompanyFeatureGrant,
} from "@/hooks/companies/use-company-approval";
import {
  useCompanyCommercialTerms,
  useCompanyPayablePreview,
  useCompanySubscriptionForReview,
  useCompanyUsageLimitOverrides,
  useUpsertCompanyCommercialTerms,
  useUpsertCompanyUsageLimitOverrides,
  useUsageMetricDefinitions,
} from "@/hooks/companies/use-company-commercial-terms";
import { useCompanyEntitlements, useCompanyCurrentPeriodUsage } from "@/hooks/billing/use-company-entitlements";
import { useAssignSubscriptionPlan, useChangeCompanyPackage } from "@/hooks/billing/use-billing-edit";
import { useCommercialPackages, usePackageFeatures } from "@/hooks/billing/use-commercial-packages";
import { useCompanyResourceOccupancy, useSetCompanyResourceLimits } from "@/hooks/billing/use-company-resource-occupancy";
import { resourceLimitsForPackageCode } from "@/lib/billing/company-resource-limits";
import { occupancyDisplayRow, occupancyRatioLabel } from "@/lib/companies/company-occupancy-display";
import { useBillingSettingValue } from "@/hooks/billing/use-billing-setting-value";
import { filterCompanyFeatureEntitlementsForDisplay } from "@/lib/billing/company-feature-catalog-display";
import { groupEntitlementsByModule } from "@/lib/billing/entitlement-module-groups";
import { useFeaturePermissionMap } from "@/hooks/billing/use-feature-definition-permissions";
import {
  resolveCompanyPayablePreview,
  type CompanyPricingSource,
} from "@/lib/billing/company-payable-amount";
import { calculateOveragePreview, type UsageLimitOverride } from "@/lib/billing/usage-overage";
import { metricUsageForPreview } from "@/lib/billing/fetch-current-period-usage";
import {
  rejectCompanyErrorI18nKey,
  type RejectCompanyErrorCode,
} from "@/lib/companies/reject-company-flow";
import { formatBillingCurrency } from "@/lib/billing/format";
import { formatPackageListPrice } from "@/lib/billing/package-pricing";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CommercialPath = "trial" | "package" | "custom" | "reject";

type CompanyApprovalWorkspaceProps = {
  company: Company;
  pending: boolean;
  onApproved: () => void;
  onRejected: () => void;
};

function humanizeCode(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").trim() || "—";
}

function Field({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b border-border/50 py-2 last:border-b-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd dir={ltr ? "ltr" : undefined} className="text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function ReviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      <dl className="mt-2">{children}</dl>
    </section>
  );
}

function StepPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="w-full space-y-5">
      <div className="border-b border-border/60 pb-3">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function parseTrialFeatureSet(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return parseTrialFeatureSet((value as Record<string, unknown>).value);
  }
  return [];
}

function parseTrialDurationDays(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/^"|"$/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 14;
}

function commercialPathLabel(t: (key: string) => string, path: CommercialPath | null): string {
  if (!path) return "—";
  return t(`companies.approval.wizard.paths.${path}`);
}

function translateCode(
  t: (key: string, options?: { defaultValue?: string }) => string,
  prefix: string,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const translated = t(`${prefix}.${value}`, { defaultValue: "" });
  return translated || humanizeCode(value);
}

function formatGrantDate(value: string | null | undefined, language: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return date.toLocaleDateString(language.startsWith("ar") ? "ar-EG" : "en-GB");
}

const REJECT_ERROR_CODES = new Set<RejectCompanyErrorCode>([
  "reasonRequired",
  "cannotRejectApproved",
  "forbidden",
  "companyNotFound",
  "invalidResponse",
  "unknown",
]);

function resolveRejectErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (REJECT_ERROR_CODES.has(raw as RejectCompanyErrorCode)) {
    return t(rejectCompanyErrorI18nKey(raw as RejectCompanyErrorCode));
  }
  return raw;
}

export function CompanyApprovalWorkspace({
  company,
  pending,
  onApproved,
  onRejected,
}: CompanyApprovalWorkspaceProps) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const companyId = company.id;
  const billingProfile = Array.isArray(company.billing_profile)
    ? company.billing_profile[0] ?? null
    : company.billing_profile ?? null;
  const branch = Array.isArray(company.primary_branch)
    ? company.primary_branch[0] ?? null
    : company.primary_branch ?? null;

  const entitlementsQuery = useCompanyEntitlements(companyId, true);
  const { map: permissionMap } = useFeaturePermissionMap(true);
  const packagesQuery = useCommercialPackages(true);
  const subscriptionQuery = useCompanySubscriptionForReview(companyId, true);
  const termsQuery = useCompanyCommercialTerms(companyId, true);
  const limitsQuery = useCompanyUsageLimitOverrides(companyId, true);
  const metricsQuery = useUsageMetricDefinitions(true);
  const usageQuery = useCompanyCurrentPeriodUsage(companyId, true);
  const payableQuery = useCompanyPayablePreview(companyId, true);
  const trialFeatureSetQuery = useBillingSettingValue("trial_feature_set", companyId, true);
  const trialDurationQuery = useBillingSettingValue("trial_duration_days", companyId, true);

  const approve = useApproveCompany();
  const reject = useRejectCompany();
  const setGrant = useSetCompanyFeatureGrant();
  const revokeGrant = useRevokeCompanyFeatureGrant();
  const assignPlan = useAssignSubscriptionPlan();
  const changePackage = useChangeCompanyPackage();
  const upsertTerms = useUpsertCompanyCommercialTerms();
  const upsertLimits = useUpsertCompanyUsageLimitOverrides();
  const occupancyQuery = useCompanyResourceOccupancy(companyId, true);
  const setResourceLimits = useSetCompanyResourceLimits();

  const [wizardStep, setWizardStep] = useState<WizardStepId>(1);
  const [commercialPath, setCommercialPath] = useState<CommercialPath | null>(null);
  const [notes, setNotes] = useState(company.approval_notes ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [featureQuery, setFeatureQuery] = useState("");
  const [pricingSource, setPricingSource] = useState<CompanyPricingSource>("list");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [customMonthly, setCustomMonthly] = useState("");
  const [customYearly, setCustomYearly] = useState("");
  const [limitDraft, setLimitDraft] = useState<Record<string, UsageLimitOverride>>({});
  const [saving, setSaving] = useState(false);
  const [customMaxUsers, setCustomMaxUsers] = useState("");
  const [customMaxBranches, setCustomMaxBranches] = useState("");

  const handleRejectCompany = async () => {
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      toast({
        title: t("companies.approval.rejectFailed"),
        description: t("companies.approval.errors.reasonRequired"),
        variant: "destructive",
      });
      return;
    }

    try {
      await reject.mutateAsync({ companyId, reason: trimmed });
      setRejectConfirmOpen(false);
      onRejected();
    } catch (error: unknown) {
      toast({
        title: t("companies.approval.rejectFailed"),
        description: resolveRejectErrorMessage(error, t),
        variant: "destructive",
      });
    }
  };

  const openRejectConfirmation = () => {
    setRejectConfirmOpen(true);
  };

  const subscription = subscriptionQuery.data;
  const plan = (subscription as { plan?: Company["plan"] } | null)?.plan ?? null;
  const billingCycle = ((subscription as { billing_cycle?: "monthly" | "yearly" } | null)?.billing_cycle ??
    company.billing_cycle ??
    "monthly") as "monthly" | "yearly";
  const selectedPlanId = (subscription as { plan_id?: string | null } | null)?.plan_id ?? company.plan_id;

  const packageFeaturesQuery = usePackageFeatures(selectedPlanId ?? null, Boolean(selectedPlanId));

  useEffect(() => {
    const terms = termsQuery.data;
    if (!terms) return;
    setPricingSource(terms.pricing_source);
    setDiscountPercent(String(terms.discount_percent ?? 0));
    setCustomMonthly(terms.custom_price_monthly != null ? String(terms.custom_price_monthly) : "");
    setCustomYearly(terms.custom_price_yearly != null ? String(terms.custom_price_yearly) : "");
  }, [termsQuery.data]);

  useEffect(() => {
    const next: Record<string, UsageLimitOverride> = {};
    for (const row of limitsQuery.data ?? []) {
      next[row.metric_code] = { ...row };
    }
    setLimitDraft(next);
  }, [limitsQuery.data]);

  const trialFeatures = useMemo(
    () => parseTrialFeatureSet(trialFeatureSetQuery.data),
    [trialFeatureSetQuery.data],
  );
  const trialDurationDays = useMemo(
    () => parseTrialDurationDays(trialDurationQuery.data),
    [trialDurationQuery.data],
  );

  const visibleEntitlements = useMemo(() => {
    const filtered = filterCompanyFeatureEntitlementsForDisplay(
      entitlementsQuery.data ?? [],
      permissionMap,
    );
    const q = featureQuery.trim().toLowerCase();
    return q
      ? filtered.filter(
          (row) =>
            row.feature_code.toLowerCase().includes(q) ||
            String(row.label ?? "").toLowerCase().includes(q),
        )
      : filtered;
  }, [entitlementsQuery.data, permissionMap, featureQuery]);

  const grouped = useMemo(() => groupEntitlementsByModule(visibleEntitlements), [visibleEntitlements]);

  const packageFeatureCodes = useMemo(
    () => new Set((packageFeaturesQuery.data ?? []).map((row) => row.feature_code)),
    [packageFeaturesQuery.data],
  );

  const enabledFeatureCount = useMemo(
    () => (entitlementsQuery.data ?? []).filter((row) => row.enabled).length,
    [entitlementsQuery.data],
  );

  const limitsConfiguredCount = useMemo(
    () => Object.values(limitDraft).filter((row) => row.metric_code).length,
    [limitDraft],
  );

  const overageConfiguredCount = useMemo(
    () => Object.values(limitDraft).filter((row) => row.overage_allowed).length,
    [limitDraft],
  );

  const payable = useMemo(
    () =>
      resolveCompanyPayablePreview({
        billingCycle,
        plan: plan ?? undefined,
        terms: {
          company_id: companyId,
          pricing_source: pricingSource,
          discount_percent: Number(discountPercent) || 0,
          custom_price_monthly: customMonthly ? Number(customMonthly) : null,
          custom_price_yearly: customYearly ? Number(customYearly) : null,
          notes: notes || null,
        },
      }),
    [billingCycle, plan, companyId, pricingSource, discountPercent, customMonthly, customYearly, notes],
  );

  const activePackages = useMemo(
    () => (packagesQuery.data ?? []).filter((pkg) => pkg.is_active !== false),
    [packagesQuery.data],
  );

  function selectCommercialPath(path: CommercialPath) {
    setCommercialPath(path);
    if (path === "custom") setPricingSource("custom");
    if (path === "package") setPricingSource("list");
  }

  function nextStep() {
    if (wizardStep === 2) {
      if (!commercialPath) {
        toast({ title: t("companies.approval.wizard.errors.pathRequired"), variant: "destructive" });
        return;
      }
      if (commercialPath === "package" && !selectedPlanId) {
        toast({ title: t("companies.approval.wizard.errors.packageRequired"), variant: "destructive" });
        return;
      }
      if (commercialPath === "reject") {
        setWizardStep(6);
        return;
      }
    }
    if (wizardStep === 3 && commercialPath === "custom" && !selectedPlanId) {
      toast({ title: t("companies.approval.wizard.errors.packageRequired"), variant: "destructive" });
      return;
    }
    if (wizardStep < 6) setWizardStep((step) => (step + 1) as WizardStepId);
  }

  function prevStep() {
    if (wizardStep === 6 && commercialPath === "reject") {
      setWizardStep(2);
      return;
    }
    if (wizardStep > 1) setWizardStep((step) => (step - 1) as WizardStepId);
  }

  async function persistConfiguration() {
    setSaving(true);
    try {
      await upsertTerms.mutateAsync({
        companyId,
        pricingSource,
        discountPercent: Number(discountPercent) || 0,
        customPriceMonthly: customMonthly ? Number(customMonthly) : null,
        customPriceYearly: customYearly ? Number(customYearly) : null,
        notes: notes.trim() || null,
      });
      const rows = Object.values(limitDraft).filter((row) => row.metric_code);
      if (rows.length > 0) {
        await upsertLimits.mutateAsync({ companyId, rows });
      }
      toast({ title: t("companies.approval.saveSuccess") });
    } catch (error) {
      toast({
        title: t("companies.approval.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectPlan(planId: string) {
    try {
      if (selectedPlanId) {
        await changePackage.mutateAsync({
          companyId,
          planId,
          reason: "Configured during company review",
        });
      } else {
        await assignPlan.mutateAsync({
          companyId,
          planId,
          billingCycle,
        });
      }
      toast({ title: t("companies.approval.packageAssigned") });
    } catch (error) {
      toast({
        title: t("companies.approval.packageFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function toggleFeature(code: string, enable: boolean) {
    try {
      if (enable) {
        await setGrant.mutateAsync({ companyId, featureCode: code, enabled: true, source: "manual" });
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

  function approveMode(): "trial" | "active" {
    return commercialPath === "trial" ? "trial" : "active";
  }

  const stepKey = ["review", "decision", "features", "limits", "pricing", "final"][wizardStep - 1];
  const stepTitle = t(`companies.approval.wizard.steps.${stepKey}`);
  const stepDescription = t(`companies.approval.wizard.${stepKey}Description`);
  const operationalStatusLabel = t(
    `companies.displayStatus.${company.status === "Trial" ? "trial" : company.status === "Suspended" ? "suspended" : "active"}`,
  );
  const approvalStatusLabel = t(`companies.approval.status.${company.approval_status ?? "pending"}`);
  const subscriptionStatusLabel = translateCode(t, "billing.status", company.subscription_status);
  const billingCycleLabel =
    billingCycle === "yearly"
      ? t("billing.billingCycle.yearly")
      : t("billing.billingCycle.monthly");
  const industryLabel = translateCode(t, "companyOnboarding.industries", company.industry);
  const businessTypeLabel = translateCode(t, "companyOnboarding.businessTypes", company.business_type);
  const packageDisplayName = plan?.display_name || plan?.name || t("billing.plan.unassigned");
  const localeTag = i18n.language?.startsWith("ar") ? "ar-EG" : "en-GB";
  const emptyDateLabel = t("companies.features.indefinite");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("companies.approval.workspaceEyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{company.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{approvalStatusLabel}</Badge>
            <Badge variant="outline">{operationalStatusLabel}</Badge>
            <Badge variant="outline">{subscriptionStatusLabel}</Badge>
          </div>
        </div>
        <div className="mt-4">
          <CompanyApprovalWizardStepper currentStep={wizardStep} commercialPath={commercialPath} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <StepPanel title={stepTitle} description={stepDescription}>
          {wizardStep === 1 ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <ReviewSection title={t("companies.details.overview")}>
                <Field label={t("companies.table.name")} value={company.name} />
                <Field label={t("companies.details.legalName")} value={billingProfile?.legal_name || "—"} />
                <Field label={t("companies.table.businessType")} value={businessTypeLabel} />
                <Field label={t("companies.table.industry")} value={industryLabel} />
                <Field label={t("companies.approval.country")} value={branch?.country || "—"} />
                <Field label={t("companies.approval.city")} value={branch?.city || "—"} />
                <Field
                  label={t("companies.approval.address")}
                  value={branch?.address_line1 || billingProfile?.address || formatCompanyLocation(company) || "—"}
                />
              </ReviewSection>
              <ReviewSection title={t("companies.details.contact")}>
                <Field label={t("companies.table.email")} value={company.contact_email || "—"} ltr />
                <Field label={t("companies.table.phone")} value={company.contact_phone || "—"} ltr />
                <Field label={t("companies.table.owner")} value={company.contact_person || "—"} />
              </ReviewSection>
              <ReviewSection title={t("companies.table.status")}>
                <Field label={t("companies.details.operationalStatus")} value={operationalStatusLabel} />
                <Field label={t("companies.details.approvalStatus")} value={approvalStatusLabel} />
                <Field label={t("companies.table.plan")} value={packageDisplayName} />
                <Field label={t("companies.details.subscriptionStatus")} value={subscriptionStatusLabel} />
              </ReviewSection>
              <ReviewSection title={t("companies.approval.verification")}>
                <Field label={t("companies.approval.registration")} value={billingProfile?.commercial_registration || "—"} />
                <Field label={t("companies.approval.taxId")} value={billingProfile?.tax_id || "—"} />
                {company.approval_change_request ? (
                  <Field label={t("companies.approval.changeRequestPending")} value={company.approval_change_request} />
                ) : null}
                {company.approval_status === "rejected" && company.approval_rejection_reason ? (
                  <Field label={t("companies.approval.rejectedReason")} value={company.approval_rejection_reason} />
                ) : null}
              </ReviewSection>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "trial" as const,
                      icon: Sparkles,
                      title: t("companies.approval.wizard.paths.trial"),
                      description: t("companies.approval.wizard.trialDescription"),
                      extra: (
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          <li>{t("companies.approval.wizard.trialDuration", { days: trialDurationDays })}</li>
                          <li>{t("companies.approval.wizard.trialFeatureCount", { count: trialFeatures.length })}</li>
                        </ul>
                      ),
                    },
                    {
                      id: "package" as const,
                      icon: Package,
                      title: t("companies.approval.wizard.paths.package"),
                      description: t("companies.approval.wizard.packageDescription"),
                      extra: selectedPlanId ? (
                        <p className="mt-3 text-xs font-medium text-foreground">{packageDisplayName}</p>
                      ) : null,
                    },
                    {
                      id: "custom" as const,
                      icon: Wallet,
                      title: t("companies.approval.wizard.paths.custom"),
                      description: t("companies.approval.wizard.customDescription"),
                      extra: (
                        <p className="mt-3 text-xs text-muted-foreground">{t("companies.approval.wizard.customPriceNote")}</p>
                      ),
                    },
                    {
                      id: "reject" as const,
                      icon: XCircle,
                      title: t("companies.approval.wizard.paths.reject"),
                      description: t("companies.approval.wizard.rejectDescription"),
                      extra: null,
                    },
                  ]
                ).map((option) => {
                  const selected = commercialPath === option.id;
                  const Icon = option.icon;
                  const danger = option.id === "reject";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectCommercialPath(option.id)}
                      className={cn(
                        "rounded-lg border p-4 text-start transition-colors",
                        selected && !danger && "border-primary bg-primary/5",
                        selected && danger && "border-destructive/50 bg-destructive/5",
                        !selected && "border-border/80 hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn("size-4", danger ? "text-destructive" : "text-primary")} aria-hidden="true" />
                        <p className="text-sm font-semibold">{option.title}</p>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{option.description}</p>
                      {option.extra}
                    </button>
                  );
                })}
              </div>
              {commercialPath === "package" ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">{t("companies.approval.wizard.choosePackage")}</h4>
                  <div className="divide-y divide-border/70">
                    {activePackages.map((pkg) => {
                      const selected = pkg.id === selectedPlanId;
                      const limits = resourceLimitsForPackageCode(pkg.code);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            selectCommercialPath("package");
                            void handleSelectPlan(pkg.id);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-4 py-3 text-start",
                            selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{pkg.display_name || pkg.name}</p>
                            <p className="mt-0.5 text-xs">
                              {formatPackageListPrice(pkg, { billingCycle: "monthly", withPeriod: true })}
                              {" · "}
                              {t("companies.approval.resourceLimits.users")}:{" "}
                              {limits.maxUsers == null
                                ? t("companies.approval.resourceLimits.unlimited")
                                : limits.maxUsers}
                              {" · "}
                              {t("companies.approval.resourceLimits.branches")}: {limits.maxBranches}
                            </p>
                          </div>
                          {selected ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {wizardStep === 3 && commercialPath !== "reject" ? (
            <div className="space-y-6">
              {commercialPath === "trial" ? (
                <section>
                  <h4 className="text-sm font-semibold">{t("companies.approval.wizard.trialFeatureSetTitle")}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{t("companies.approval.featurePreviewHint")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {trialFeatures.length > 0 ? (
                      trialFeatures.map((code) => {
                        const label =
                          entitlementsQuery.data?.find((row) => row.feature_code === code)?.label || humanizeCode(code);
                        return (
                          <Badge key={code} variant="outline">
                            {label}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("companies.approval.wizard.emptyFeatures")}</span>
                    )}
                  </div>
                </section>
              ) : null}

              {commercialPath === "custom" ? (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold">{t("companies.approval.wizard.selectUnderlyingPackage")}</h4>
                  <div className="divide-y divide-border/70">
                    {activePackages.map((pkg) => {
                      const selected = pkg.id === selectedPlanId;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => void handleSelectPlan(pkg.id)}
                          className="flex w-full items-center justify-between gap-3 py-2.5 text-start"
                        >
                          <div>
                            <p className="text-sm font-medium">{pkg.display_name || pkg.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatPackageListPrice(pkg, { billingCycle, withPeriod: true })}
                            </p>
                          </div>
                          {selected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <Input
                value={featureQuery}
                onChange={(event) => setFeatureQuery(event.target.value)}
                placeholder={t("companies.approval.searchFeatures")}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                      <th className="px-2 py-2 text-start">{t("companies.features.feature")}</th>
                      <th className="px-2 py-2 text-start">{t("companies.features.status")}</th>
                      <th className="px-2 py-2 text-start">{t("companies.features.source")}</th>
                      <th className="px-2 py-2 text-start">{t("companies.features.startsAt")}</th>
                      <th className="px-2 py-2 text-start">{t("companies.features.expiresAt")}</th>
                      <th className="px-2 py-2 text-end">{t("companies.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                          {t("companies.approval.wizard.emptyFeatures")}
                        </td>
                      </tr>
                    ) : (
                      grouped.flatMap((group) =>
                        group.rows.map((row) => (
                          <tr key={row.feature_code} className="border-b border-border/60">
                            <td className="px-2 py-2">
                              <p className="font-medium">{row.label || humanizeCode(row.feature_code)}</p>
                              <p className="text-xs text-muted-foreground">
                                {t(`companies.approval.modules.${group.module}`)}
                                {" · "}
                                {row.is_commercial
                                  ? t("companies.approval.wizard.commercialFeature")
                                  : t("companies.approval.wizard.coreFeature")}
                              </p>
                            </td>
                            <td className="px-2 py-2">
                              {row.enabled ? t("companies.features.enabled") : t("companies.features.disabled")}
                            </td>
                            <td className="px-2 py-2">
                              {translateCode(t, "billing.workspace.features.featureSources", row.source)}
                            </td>
                            <td className="px-2 py-2">
                              {formatGrantDate(row.starts_at, localeTag, emptyDateLabel)}
                            </td>
                            <td className="px-2 py-2">
                              {formatGrantDate(row.expires_at, localeTag, emptyDateLabel)}
                            </td>
                            <td className="px-2 py-2 text-end">
                              <Switch
                                checked={row.enabled}
                                onCheckedChange={(checked) => void toggleFeature(row.feature_code, checked)}
                                disabled={setGrant.isPending || revokeGrant.isPending}
                                aria-label={row.label || row.feature_code}
                              />
                            </td>
                          </tr>
                        )),
                      )
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{t("companies.features.employeeRbacHint")}</p>
            </div>
          ) : null}

          {wizardStep === 4 && commercialPath !== "reject" ? (
            <div className="space-y-6">
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">{t("companies.approval.wizard.occupancyHeading")}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{t("companies.approval.resourceLimits.hint")}</p>
                </div>
                {occupancyQuery.data ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                          <th className="px-2 py-2 text-start">{t("companies.details.resource")}</th>
                          <th className="px-2 py-2 text-start">{t("companies.details.current")}</th>
                          <th className="px-2 py-2 text-start">{t("companies.details.limit")}</th>
                          <th className="px-2 py-2 text-start">{t("companies.details.remaining")}</th>
                          <th className="px-2 py-2 text-start">{t("companies.details.state")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[
                          { key: "users", row: occupancyDisplayRow(occupancyQuery.data.users), label: t("companies.details.users") },
                          { key: "branches", row: occupancyDisplayRow(occupancyQuery.data.branches), label: t("companies.details.branches") },
                        ].map((item) => (
                          <tr key={item.key}>
                            <td className="px-3 py-2 font-medium">{item.label}</td>
                            <td className="px-3 py-2 tabular-nums">{item.row.used}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {item.row.unlimited
                                ? t("companies.details.unlimited")
                                : item.row.limit}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {item.row.unlimited
                                ? t("companies.details.unlimited")
                                : item.row.remaining}
                            </td>
                            <td className={item.row.overLimit ? "px-3 py-2 font-semibold text-destructive" : "px-3 py-2"}>
                              {item.row.overLimit
                                ? t("companies.details.overLimit")
                                : t("companies.approval.wizard.withinLimit")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("companies.approval.wizard.emptyOccupancy")}</p>
                )}
                {commercialPath === "custom" ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label>{t("companies.approval.resourceLimits.maxUsers")}</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-28"
                        placeholder={t("companies.approval.resourceLimits.unlimited")}
                        value={customMaxUsers}
                        onChange={(event) => setCustomMaxUsers(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("companies.approval.resourceLimits.maxBranches")}</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-28"
                        value={customMaxBranches}
                        onChange={(event) => setCustomMaxBranches(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={setResourceLimits.isPending}
                      onClick={() => {
                        void setResourceLimits.mutateAsync({
                          companyId,
                          maxUsers: customMaxUsers === "" ? null : Number(customMaxUsers),
                          maxBranches: customMaxBranches === "" ? 1 : Number(customMaxBranches),
                          source: "contract",
                        }).then(
                          () => toast({ title: t("companies.approval.saveSuccess") }),
                          (error) =>
                            toast({
                              title: t("companies.approval.saveFailed"),
                              description: error instanceof Error ? error.message : undefined,
                              variant: "destructive",
                            }),
                        );
                      }}
                    >
                      {t("companies.approval.resourceLimits.apply")}
                    </Button>
                  </div>
                ) : null}
              </section>
              <p className="text-sm text-muted-foreground">{t("companies.approval.limitsHint")}</p>
              <p className="text-xs text-muted-foreground">{t("companies.approval.wizard.limitsEnforcementNote")}</p>
              {usageQuery.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("companies.approval.usageLoading")}
                </p>
              ) : null}
              {usageQuery.isError ? (
                <p className="text-xs text-destructive">
                  {t("companies.approval.usageLoadFailed")}
                  {usageQuery.error instanceof Error ? `: ${usageQuery.error.message}` : ""}
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("companies.approval.wizard.metric")}</th>
                      <th className="px-3 py-2 text-start">{t("companies.approval.included")}</th>
                      <th className="px-3 py-2 text-start">{t("companies.approval.wizard.limitBehavior")}</th>
                      <th className="px-3 py-2 text-start">{t("companies.approval.overageAllowed")}</th>
                      <th className="px-3 py-2 text-start">{t("companies.approval.overageUnit")}</th>
                      <th className="px-3 py-2 text-start">{t("companies.approval.overagePrice")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(metricsQuery.data ?? []).map((metric) => {
                      const draft = limitDraft[metric.code] ?? {
                        metric_code: metric.code,
                        included_quantity: null,
                        is_unlimited: false,
                        overage_allowed: false,
                        overage_unit_size: null,
                        overage_unit_price: null,
                      };
                      const usage =
                        usageQuery.isError || usageQuery.isLoading
                          ? null
                          : metricUsageForPreview(usageQuery.data, metric.code);
                      const preview = calculateOveragePreview({ metricCode: metric.code, usage, override: draft });
                      return (
                        <tr key={metric.code}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{metric.label}</p>
                            <p className="text-xs text-muted-foreground">{metric.unit}</p>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-24"
                              disabled={draft.is_unlimited}
                              value={draft.included_quantity ?? ""}
                              onChange={(event) =>
                                setLimitDraft((prev) => ({
                                  ...prev,
                                  [metric.code]: {
                                    ...draft,
                                    included_quantity: event.target.value ? Number(event.target.value) : null,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={draft.is_unlimited}
                                onCheckedChange={(checked) =>
                                  setLimitDraft((prev) => ({
                                    ...prev,
                                    [metric.code]: { ...draft, is_unlimited: checked },
                                  }))
                                }
                              />
                              {t("companies.approval.unlimited")}
                            </label>
                          </td>
                          <td className="px-3 py-2">
                            <Switch
                              checked={draft.overage_allowed}
                              onCheckedChange={(checked) =>
                                setLimitDraft((prev) => ({
                                  ...prev,
                                  [metric.code]: { ...draft, overage_allowed: checked },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20"
                              value={draft.overage_unit_size ?? ""}
                              onChange={(event) =>
                                setLimitDraft((prev) => ({
                                  ...prev,
                                  [metric.code]: {
                                    ...draft,
                                    overage_unit_size: event.target.value ? Number(event.target.value) : null,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20"
                              value={draft.overage_unit_price ?? ""}
                              onChange={(event) =>
                                setLimitDraft((prev) => ({
                                  ...prev,
                                  [metric.code]: {
                                    ...draft,
                                    overage_unit_price: event.target.value ? Number(event.target.value) : null,
                                  },
                                }))
                              }
                            />
                            {preview?.chargeable ? (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {t("companies.approval.overagePreview", {
                                  qty: preview.overageQuantity,
                                  units: preview.billableUnits,
                                  charge: preview.charge,
                                })}{" "}
                                ({t("companies.approval.overageNotCharged")})
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {wizardStep === 5 && commercialPath !== "reject" ? (
            <div className="space-y-6">
              {commercialPath === "trial" ? (
                <section>
                  <h4 className="text-sm font-semibold">{t("companies.approval.wizard.trialPricingTitle")}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{t("companies.approval.wizard.trialPricingHint")}</p>
                </section>
              ) : (
                <>
                  <ReviewSection title={t("companies.approval.pricingTitle")}>
                    <Field label={t("companies.approval.wizard.selectionType")} value={commercialPathLabel(t, commercialPath)} />
                    <Field label={t("companies.approval.wizard.packageName")} value={packageDisplayName} />
                    <Field label={t("companies.approval.wizard.billingCycle")} value={billingCycleLabel} />
                    <Field
                      label={t("companies.approval.listPrice")}
                      value={payable.listAmount == null ? "—" : formatBillingCurrency(payable.listAmount)}
                    />
                    <Field
                      label={t("companies.approval.companyPrice")}
                      value={payable.payableAmount == null ? "—" : formatBillingCurrency(payable.payableAmount)}
                    />
                    {commercialPath === "custom" ? (
                      <Field
                        label={t("companies.approval.wizard.customPrice")}
                        value={payable.payableAmount == null ? "—" : formatBillingCurrency(payable.payableAmount)}
                      />
                    ) : null}
                  </ReviewSection>
                  {commercialPath === "custom" ? (
                    <p className="text-xs text-muted-foreground">{t("companies.approval.wizard.customPriceNote")}</p>
                  ) : null}

                  {commercialPath === "custom" || commercialPath === "package" ? (
                    <div className="space-y-3">
                      {commercialPath === "custom" ? (
                        <div className="flex flex-wrap gap-2">
                          {(["list", "discount", "custom"] as const).map((source) => (
                            <Button
                              key={source}
                              type="button"
                              size="sm"
                              variant={pricingSource === source ? "default" : "outline"}
                              onClick={() => setPricingSource(source)}
                            >
                              {t(`companies.approval.pricingSource.${source}`)}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {pricingSource === "discount" ? (
                        <div className="max-w-xs space-y-1.5">
                          <Label>{t("companies.approval.discountPercent")}</Label>
                          <Input value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} />
                        </div>
                      ) : null}
                      {pricingSource === "custom" ? (
                        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>{t("companies.approval.customMonthly")}</Label>
                            <Input value={customMonthly} onChange={(event) => setCustomMonthly(event.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t("companies.approval.customYearly")}</Label>
                            <Input value={customYearly} onChange={(event) => setCustomYearly(event.target.value)} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!payable.onlineCheckoutAllowed ? (
                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {t("companies.approval.checkoutLimitation")}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("companies.approval.checkoutUsesCompanyPrice")}</p>
                  )}
                </>
              )}
            </div>
          ) : null}

          {wizardStep === 6 ? (
            <div className="space-y-6">
              {commercialPath === "reject" ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="size-5" aria-hidden="true" />
                    <h4 className="font-semibold">{t("companies.approval.wizard.rejectConfirmTitle")}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("companies.approval.wizard.rejectConfirmHint")}</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reject-reason">{t("companies.approval.reason")}</Label>
                    <Textarea
                      id="reject-reason"
                      rows={3}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder={t("companies.approval.reasonRequired")}
                    />
                  </div>
                </section>
              ) : (
                <ReviewSection title={t("companies.approval.summaryTitle")}>
                  <Field label={t("companies.approval.wizard.summaryCompany")} value={company.name} />
                  <Field label={t("companies.details.approvalStatus")} value={approvalStatusLabel} />
                  <Field label={t("companies.approval.wizard.operationalStatus")} value={operationalStatusLabel} />
                  <Field
                    label={t("companies.approval.wizard.summaryCommercialModel")}
                    value={commercialPathLabel(t, commercialPath)}
                  />
                  <Field label={t("companies.approval.wizard.packageName")} value={packageDisplayName} />
                  <Field
                    label={t("companies.approval.wizard.summaryBilling")}
                    value={
                      commercialPath === "trial"
                        ? t("companies.approval.wizard.trialBillingLabel")
                        : billingCycleLabel
                    }
                  />
                  <Field
                    label={t("companies.approval.wizard.summaryPrice")}
                    value={
                      commercialPath === "trial"
                        ? t("companies.approval.wizard.trialPricingHint")
                        : payable.payableAmount == null
                          ? "—"
                          : `${formatBillingCurrency(payable.payableAmount)} / ${billingCycle === "yearly" ? t("companies.approval.wizard.year") : t("companies.approval.wizard.month")}`
                    }
                  />
                  <Field
                    label={t("companies.approval.wizard.summaryTrial")}
                    value={commercialPath === "trial" ? t("companies.approval.wizard.yes") : t("companies.approval.wizard.no")}
                  />
                  <Field
                    label={t("companies.approval.wizard.summaryFeatures")}
                    value={t("companies.approval.wizard.featureCount", { count: enabledFeatureCount })}
                  />
                  <Field
                    label={t("companies.details.users")}
                    value={
                      occupancyQuery.data
                        ? occupancyRatioLabel(
                            occupancyDisplayRow(occupancyQuery.data.users),
                            t("companies.details.unlimited"),
                          )
                        : "—"
                    }
                  />
                  <Field
                    label={t("companies.details.branches")}
                    value={
                      occupancyQuery.data
                        ? occupancyRatioLabel(
                            occupancyDisplayRow(occupancyQuery.data.branches),
                            t("companies.details.unlimited"),
                          )
                        : "—"
                    }
                  />
                  <Field
                    label={t("companies.approval.wizard.summaryLimits")}
                    value={
                      limitsConfiguredCount > 0
                        ? t("companies.approval.wizard.configured")
                        : t("companies.approval.wizard.notConfigured")
                    }
                  />
                  <Field
                    label={t("companies.approval.wizard.summaryOverage")}
                    value={
                      overageConfiguredCount > 0
                        ? t("companies.approval.wizard.configured")
                        : t("companies.approval.wizard.notConfigured")
                    }
                  />
                </ReviewSection>
              )}

              {commercialPath !== "reject" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="approval-notes">{t("companies.approval.notes")}</Label>
                  <Textarea id="approval-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}
        </StepPanel>
      </div>

      <footer className="sticky bottom-0 shrink-0 border-t border-border bg-background px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {wizardStep === 1 && pending ? (
              <Button type="button" variant="destructive" onClick={openRejectConfirmation}>
                {t("companies.approval.reject")}
              </Button>
            ) : wizardStep > 1 ? (
              <Button type="button" variant="outline" onClick={prevStep}>
                {t("companies.approval.wizard.back")}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {wizardStep < 6 ? (
              <Button type="button" onClick={nextStep}>
                {t("companies.approval.wizard.next")}
              </Button>
            ) : pending && commercialPath === "reject" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!rejectReason.trim() || reject.isPending}
                  onClick={openRejectConfirmation}
                >
                  {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : t("companies.approval.reject")}
                </Button>
            ) : wizardStep === 6 && pending ? (
              <>
                <Button type="button" variant="outline" disabled={saving} onClick={() => void persistConfiguration()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : t("companies.approval.saveConfiguration")}
                </Button>
                <Button
                  type="button"
                  disabled={!commercialPath || commercialPath === "reject" || approve.isPending}
                  onClick={() =>
                    void persistConfiguration()
                      .then(() => approve.mutateAsync({ companyId, mode: approveMode(), notes: notes.trim() || null }))
                      .then(onApproved)
                      .catch((error: unknown) =>
                        toast({
                          title: t("companies.approval.approveFailed"),
                          description: error instanceof Error ? error.message : undefined,
                          variant: "destructive",
                        }),
                      )
                  }
                >
                  {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : t("companies.approval.wizard.confirmDecision")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" disabled={saving} onClick={() => void persistConfiguration()}>
                {t("companies.approval.saveConfiguration")}
              </Button>
            )}
          </div>
        </div>
      </footer>

      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.approval.confirmRejectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.approval.confirmRejectDescription", { name: company.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason-confirm">{t("companies.approval.reason")}</Label>
            <Textarea
              id="reject-reason-confirm"
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t("companies.approval.reasonRequired")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reject.isPending}>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleRejectCompany();
              }}
            >
              {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : t("companies.approval.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
