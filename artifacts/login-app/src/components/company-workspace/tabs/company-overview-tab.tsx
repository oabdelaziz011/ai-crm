import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AiCommandCenterCard } from "@/components/company-workspace/overview/ai-command-center-card";
import { CompanySetupProgressCard } from "@/components/company-workspace/overview/company-setup-progress-card";
import {
  BrandProgressRing,
  displayValue,
  LicenseMeter,
  OverviewSection,
  ResourceTile,
  StatusPill,
} from "@/components/company-workspace/overview/overview-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import {
  useAiAnalyticsAggregate,
  useAiAnalyticsRecords,
} from "@/hooks/ai-observability/use-ai-analytics";
import { useAiCostAggregate, useAiCostRecords } from "@/hooks/ai-observability/use-ai-costs";
import { useCompanyUsageSnapshot } from "@/hooks/billing/use-company-entitlements";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { useCompanyBrandCenter } from "@/hooks/company-workspace/use-company-brand-center";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { useAuthUser } from "@/hooks/use-rbac";
import { useSidebarBadgeCounts } from "@/hooks/use-sidebar-badge-counts";
import { useWorkspaceBillingSummary } from "@/hooks/workspace/use-workspace-billing-summary";
import { translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import { formatBillingDate } from "@/lib/billing/format";
import type { CompanySubscription } from "@/lib/billing/types";
import { computeBrandHealth } from "@/lib/company-workspace/brand-center/brand-health";
import { computeCompanySetupProgress } from "@/lib/company-workspace/company-setup-progress";
import { computeExecutiveAiUsage } from "@/lib/company-workspace/executive-ai-usage";
import {
  buildExecutiveInsights,
  splitWindowTokenTotals,
} from "@/lib/company-workspace/executive-insights";
import {
  computeExecutiveCompanyHealth,
  isSubscriptionActiveStatus,
  type HealthCheckState,
} from "@/lib/company-workspace/executive-overview-health";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import { canOpenWorkspaceBilling } from "@/lib/company-workspace/permissions";
import type { CompanyWorkspaceTabId } from "@/lib/company-workspace/types";
import { schedulingResourcesKey } from "@/lib/scheduling/cache/query-keys";
import { cn } from "@/lib/utils";

type ConnectionState = "connected" | "disconnected" | "pending";

const CHANNEL_SERVICES = [
  { id: "whatsapp", channelKey: "whatsapp" },
  { id: "facebook", channelKey: "messenger" },
  { id: "instagram", channelKey: "instagram" },
  { id: "email", channelKey: "email" },
  { id: "sms", channelKey: "sms" },
  { id: "voice", channelKey: "voice" },
] as const;

function healthTone(state: HealthCheckState): "success" | "warning" | "danger" {
  if (state === "healthy") return "success";
  if (state === "warning") return "warning";
  return "danger";
}

function connectionTone(state: ConnectionState): "success" | "warning" | "muted" {
  if (state === "connected") return "success";
  if (state === "pending") return "warning";
  return "muted";
}

function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

export function CompanyOverviewTab() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { company: authCompany } = useAuth();
  const { bundle, permissions } = useCompanyWorkspace();
  const companyId = bundle?.companyId ?? null;
  const { identity, displayName } = useCompanyIdentity(Boolean(companyId));
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const canBilling = canOpenWorkspaceBilling({ hasPermission, isSuperAdmin });
  const canAiCosts = isSuperAdmin || hasPermission("ai.costs.view");
  const canAiAnalytics = isSuperAdmin || hasPermission("ai.analytics.view");
  const canKnowledge = isSuperAdmin || hasPermission("knowledge.view");
  const canChannels = isSuperAdmin || hasPermission("channels.view");
  const canCustomers = isSuperAdmin || hasPermission("customers.view");
  const canBookings = isSuperAdmin || hasPermission("bookings.view");
  const canInvoices = isSuperAdmin || hasPermission("invoices.view");

  const billing = useWorkspaceBillingSummary(permissions.canSubscription);
  const usageSnapshot = useCompanyUsageSnapshot(
    companyId,
    Boolean(companyId && permissions.canSubscription),
  );
  const channels = useCompanyChannelsAdmin(canChannels);
  const brandCenter = useCompanyBrandCenter(companyId, Boolean(companyId));
  const aiProviders = useAiProviderConnectionsAdmin(companyId);
  const aiAggregate = useAiCostAggregate(undefined, canAiCosts);
  const aiRecords = useAiCostRecords(200, canAiCosts);
  const aiAnalytics = useAiAnalyticsAggregate(200, canAiAnalytics);
  const aiAnalyticsRecords = useAiAnalyticsRecords(200, canAiAnalytics);
  const knowledge = useKnowledgeDocuments(companyId, undefined, canKnowledge);
  const badges = useSidebarBadgeCounts({
    customers: canCustomers,
    bookings: canBookings,
    invoices: canInvoices,
  });

  const profile = bundle?.profile;
  const counts = bundle?.counts;

  const subscription = billing.data?.subscription as CompanySubscription | null | undefined;
  const plan = (billing.data?.plan ?? subscription?.plan) as
    | CompanySubscription["plan"]
    | null
    | undefined;

  const companyName = displayValue(identity?.name ?? profile?.name ?? displayName);
  const industry = displayValue(profile?.companyType);
  const status = displayValue(profile?.status);
  const logoUrl = identity?.logoUrl ?? profile?.logoUrl ?? brandCenter.data?.logos.main ?? null;
  const planName = displayValue(
    plan?.display_name || plan?.name || profile?.subscriptionStatus || null,
  );
  const renewal =
    subscription?.next_renewal_at ||
    subscription?.current_period_end ||
    profile?.subscriptionExpiresAt ||
    null;
  const createdAt = displayValue(authCompany?.created_at ?? null);
  const billingContact = billing.data?.billing_contact as
    | { name?: string | null; email?: string | null }
    | null
    | undefined;
  const owner = displayValue(
    billingContact?.name || profile?.contactPerson || billingContact?.email || null,
  );
  const billingCycleRaw = displayValue(
    subscription?.billing_cycle ?? profile?.billingCycle ?? null,
  );
  const billingCycle = billingCycleRaw
    ? translateBillingCycle(t, billingCycleRaw) || billingCycleRaw
    : null;
  const subscriptionStatus = displayValue(
    subscription?.status ?? profile?.subscriptionStatus ?? null,
  );

  const seatsLimit = plan?.max_users ?? null;
  const storageLimitGb = plan?.storage_gb ?? null;
  const aiTokenLimit = plan?.ai_tokens_monthly ?? null;

  const storageUsedBytes = Number(usageSnapshot.data?.metrics?.storage_bytes ?? NaN);
  const storageUsedGb = Number.isFinite(storageUsedBytes)
    ? storageUsedBytes / (1024 * 1024 * 1024)
    : null;

  const brandReport = brandCenter.data ? computeBrandHealth(brandCenter.data) : null;
  const hasPrimaryLogo = Boolean(
    brandCenter.data?.logos.main ?? identity?.logoUrl ?? profile?.logoUrl,
  );
  const hasPrimaryColor = Boolean(brandCenter.data?.colors.primary?.trim());
  /** Setup branding rule: primary logo + primary color (shared with health brand check). */
  const setupBrandingComplete = hasPrimaryLogo && hasPrimaryColor;

  const renewalDays = daysUntil(renewal);

  const channelCards = useMemo(() => {
    if (!channels.isSuccess) return [];
    const list = channels.data ?? [];
    return CHANNEL_SERVICES.map((svc) => {
      const matches = list.filter(
        (ch) => ch.communication_channel?.key === svc.channelKey,
      );
      if (!matches.length) return null;
      const primary =
        matches.find((ch) => ch.is_enabled && ch.status === "active") ?? matches[0];
      let state: ConnectionState = "disconnected";
      if (
        matches.some(
          (ch) =>
            ch.health_status === "connected" ||
            (ch.is_enabled && ch.status === "active"),
        )
      ) {
        state = "connected";
      } else if (
        matches.some(
          (ch) =>
            ch.status === "pending" ||
            ch.health_status === "warning" ||
            ch.health_status === "unknown",
        )
      ) {
        state = "pending";
      }
      return {
        id: svc.id,
        state,
        account:
          displayValue(primary?.external_account_id) ||
          displayValue(primary?.display_name),
        lastSync: primary?.last_health_check || primary?.updated_at || null,
        webhook: displayValue(primary?.webhook_url),
        provider: displayValue(primary?.provider),
      };
    }).filter(Boolean) as Array<{
      id: string;
      state: ConnectionState;
      account: string | null;
      lastSync: string | null;
      webhook: string | null;
      provider: string | null;
    }>;
  }, [channels.data, channels.isSuccess]);

  const openaiProvider = useMemo(() => {
    const byCost = aiAggregate.data?.byProvider ?? {};
    const byAnalytics = aiAnalytics.data?.byProvider ?? {};
    const key =
      Object.keys(byCost).find((k) => k.toLowerCase().includes("openai")) ??
      Object.keys(byAnalytics).find((k) => k.toLowerCase().includes("openai"));
    if (!key) return null;
    const latest = (aiRecords.data ?? []).find((r) =>
      (r.provider_key ?? "").toLowerCase().includes("openai"),
    );
    return {
      provider: key,
      model: latest?.model ?? null,
      latency:
        byAnalytics[key]?.averageLatencyMs ??
        aiAnalytics.data?.averageLatencyMs ??
        null,
      lastSuccess:
        (aiRecords.data ?? []).find(
          (r) =>
            (r.provider_key ?? "").toLowerCase().includes("openai") && r.recorded_at,
        )?.recorded_at ?? null,
      connected: true,
    };
  }, [aiAggregate.data, aiAnalytics.data, aiRecords.data]);

  const messagingConnectedCount = channelCards.filter((c) => c.state === "connected").length;
  const connectedChannelCount = messagingConnectedCount + (openaiProvider ? 1 : 0);

  const aiProviderConnected = aiProviders.isSuccess
    ? (aiProviders.data ?? []).some((connection) => connection.is_enabled)
    : null;

  const aiNearQuota =
    aiTokenLimit != null &&
    aiAggregate.data != null &&
    aiTokenLimit > 0 &&
    aiAggregate.data.totalTokens / aiTokenLimit >= 0.85;

  const canOpenBillingHealth = permissions.canSubscription || canBilling;

  const setupProgress = useMemo(
    () =>
      computeCompanySetupProgress({
        companyExists: Boolean(companyId && profile),
        hasPrimaryLogo,
        hasPrimaryColor,
        subscriptionStatus,
        branchesCount: counts?.branches ?? 0,
        departmentsCount: counts?.departments ?? 0,
        employeesCount: counts?.employees ?? 0,
        aiProviderConnected,
        connectedChannels: canChannels && channels.isSuccess ? messagingConnectedCount : null,
      }),
    [
      aiProviderConnected,
      canChannels,
      channels.isSuccess,
      companyId,
      counts?.branches,
      counts?.departments,
      counts?.employees,
      hasPrimaryColor,
      hasPrimaryLogo,
      messagingConnectedCount,
      profile,
      subscriptionStatus,
    ],
  );

  const health = useMemo(
    () =>
      computeExecutiveCompanyHealth({
        includeIdentity: permissions.canBranding,
        hasName: Boolean(companyName),
        hasLegalName: Boolean(identity?.legalName ?? profile?.legalName),
        hasSupportEmail: Boolean(identity?.contactEmail ?? profile?.contactEmail),
        hasLogo: permissions.canBranding ? hasPrimaryLogo : false,
        brandComplete: permissions.canBranding ? setupBrandingComplete : null,
        brandScore: permissions.canBranding ? (brandReport?.score ?? null) : null,
        includeBilling: canOpenBillingHealth,
        subscriptionActive: isSubscriptionActiveStatus(subscriptionStatus),
        subscriptionExpiringSoon: renewalDays != null && renewalDays >= 0 && renewalDays <= 14,
        employeesCount: counts?.employees ?? 0,
        seatsLimit,
        branchesCount: counts?.branches ?? 0,
        departmentsCount: counts?.departments ?? 0,
        hasAiUsage:
          aiProviderConnected != null
            ? aiProviderConnected
            : canAiCosts
              ? Boolean(
                  aiAggregate.data &&
                    (aiAggregate.data.totalTokens > 0 || aiAggregate.data.recordCount > 0),
                )
              : null,
        aiNearQuota: canAiCosts ? aiNearQuota : null,
        connectedChannels: canChannels && channels.isSuccess ? messagingConnectedCount : null,
        knowledgeDocs: canKnowledge && knowledge.isSuccess ? (knowledge.data?.length ?? 0) : null,
      }),
    [
      aiAggregate.data,
      aiNearQuota,
      aiProviderConnected,
      brandReport?.score,
      canAiCosts,
      canChannels,
      canKnowledge,
      canOpenBillingHealth,
      channels.isSuccess,
      companyName,
      counts?.branches,
      counts?.departments,
      counts?.employees,
      hasPrimaryLogo,
      identity?.contactEmail,
      identity?.legalName,
      knowledge.data?.length,
      knowledge.isSuccess,
      messagingConnectedCount,
      permissions.canBranding,
      profile?.contactEmail,
      profile?.legalName,
      renewalDays,
      seatsLimit,
      setupBrandingComplete,
      subscriptionStatus,
    ],
  );

  const aiMetrics = useMemo(
    () =>
      computeExecutiveAiUsage({
        aggregate: aiAggregate.data ?? null,
        records: aiRecords.data ?? [],
        analytics: aiAnalytics.data ?? null,
        analyticsRecords: aiAnalyticsRecords.data ?? [],
        monthlyQuota: aiTokenLimit,
      }),
    [
      aiAggregate.data,
      aiAnalytics.data,
      aiAnalyticsRecords.data,
      aiRecords.data,
      aiTokenLimit,
    ],
  );

  const windowTotals = useMemo(
    () => splitWindowTokenTotals(aiMetrics.dailySeries),
    [aiMetrics.dailySeries],
  );

  const insights = useMemo(
    () =>
      buildExecutiveInsights(
        {
          aiTokensUsed: windowTotals.recent,
          aiTokensPreviousWindow: windowTotals.previous,
          storageUsedGb,
          storageLimitGb,
          renewalAt: renewal,
          employeesCount: counts?.employees ?? 0,
          seatsLimit,
          knowledgeDocs: canKnowledge && knowledge.isSuccess ? (knowledge.data?.length ?? 0) : null,
          openInvoices: badges.invoices ?? null,
          connectedChannels: channels.isSuccess ? connectedChannelCount : null,
          aiQuotaPct:
            aiTokenLimit != null && aiAggregate.data
              ? (aiAggregate.data.totalTokens / aiTokenLimit) * 100
              : null,
        },
        {
          canAiCosts,
          canSubscription: permissions.canSubscription,
          canBilling,
          canManageEmployees: permissions.canManageEmployees,
          canKnowledge,
          canInvoices,
          canChannels,
        },
      ),
    [
      aiAggregate.data,
      aiTokenLimit,
      badges.invoices,
      canAiCosts,
      canBilling,
      canChannels,
      canInvoices,
      canKnowledge,
      channels.isSuccess,
      connectedChannelCount,
      counts?.employees,
      knowledge.data?.length,
      knowledge.isSuccess,
      permissions.canManageEmployees,
      permissions.canSubscription,
      renewal,
      seatsLimit,
      storageLimitGb,
      storageUsedGb,
      windowTotals.previous,
      windowTotals.recent,
    ],
  );

  if (!profile || !counts) return null;

  const cachedResources = companyId
    ? qc.getQueryData<unknown[]>(schedulingResourcesKey(companyId))
    : undefined;

  const initials =
    (companyName ?? "C")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "C";

  const resourceItems = [
    {
      id: "employees",
      label: t("companyWorkspace.overview.resources.employees"),
      value: counts.employees,
      show: permissions.canView,
    },
    {
      id: "customers",
      label: t("companyWorkspace.overview.resources.customers"),
      value: badges.customers,
      show: canCustomers && badges.customers != null,
    },
    {
      id: "branches",
      label: t("companyWorkspace.overview.resources.branches"),
      value: counts.branches,
      show: permissions.canView,
    },
    {
      id: "departments",
      label: t("companyWorkspace.overview.resources.departments"),
      value: counts.departments,
      show: permissions.canView,
    },
    {
      id: "resources",
      label: t("companyWorkspace.overview.resources.resources"),
      value: Array.isArray(cachedResources) ? cachedResources.length : null,
      show: canBookings && Array.isArray(cachedResources),
    },
    {
      id: "knowledge",
      label: t("companyWorkspace.overview.resources.knowledge"),
      value: knowledge.data?.length,
      show: canKnowledge && knowledge.isSuccess && knowledge.data != null,
    },
    {
      id: "bookings",
      label: t("companyWorkspace.overview.resources.bookingsPending"),
      value: badges.bookings,
      show: canBookings && badges.bookings != null,
    },
    {
      id: "invoices",
      label: t("companyWorkspace.overview.resources.invoicesOpen"),
      value: badges.invoices,
      show: canInvoices && badges.invoices != null,
    },
  ].filter((item) => item.show && item.value != null);

  const licenseMeters: Array<{
    id: string;
    label: string;
    used: number;
    limit: number;
    formatValue?: (n: number) => string;
  }> = [];
  if (seatsLimit != null) {
    licenseMeters.push({
      id: "seats",
      label: t("companyWorkspace.overview.license.employees"),
      used: counts.employees,
      limit: seatsLimit,
    });
  }
  if (storageLimitGb != null && storageUsedGb != null) {
    licenseMeters.push({
      id: "storage",
      label: t("companyWorkspace.overview.license.storage"),
      used: Number(storageUsedGb.toFixed(2)),
      limit: storageLimitGb,
      formatValue: (n) => t("companyWorkspace.overview.storageCapacityValue", { gb: n }),
    });
  }
  if (canAiCosts && aiTokenLimit != null && aiAggregate.data) {
    licenseMeters.push({
      id: "ai",
      label: t("companyWorkspace.overview.license.aiCredits"),
      used: aiAggregate.data.totalTokens,
      limit: aiTokenLimit,
    });
  }

  const goCompany = (tab: CompanyWorkspaceTabId) => {
    setLocation(companyWorkspaceHref(tab));
  };

  const openSetupItem = (item: (typeof setupProgress.items)[number]) => {
    if (item.destination.kind === "tab") {
      goCompany(item.destination.tab);
      return;
    }
    setLocation(item.destination.path);
  };

  /** Fix destinations — used only when a health check needs attention. */
  const healthFixDestinations: Partial<Record<string, () => void>> = {
    identity: permissions.canBranding ? () => goCompany("branding") : undefined,
    brand: permissions.canBranding ? () => goCompany("branding") : undefined,
    billing: canOpenBillingHealth
      ? () => goCompany("subscription")
      : undefined,
    employees: () => goCompany("employees"),
    branches: () => goCompany("branches"),
    departments: () => goCompany("departments"),
    ai: () => setLocation("~/dashboard/ai-assistant"),
    channels: canChannels ? () => setLocation("~/dashboard/channels") : undefined,
    knowledge: canKnowledge ? () => setLocation("~/dashboard/knowledge") : undefined,
  };

  const healthLevelTone =
    health.level === "excellent"
      ? "success"
      : health.level === "good"
        ? "info"
        : "warning";

  const serviceCardInteractiveClass =
    "rounded-xl border border-border/50 bg-muted/15 px-3 py-3 text-start transition-colors hover:border-primary/30 hover:bg-primary/5";

  return (
    <div className="space-y-3">
      {/* SECTION 1 — Executive Header (informational) */}
      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="size-16 rounded-2xl border border-border/50">
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={companyName ?? ""} className="object-cover" />
            ) : null}
            <AvatarFallback className="rounded-2xl bg-primary/10 text-base font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {companyName ? (
                <h1 className="truncate text-xl font-semibold tracking-tight">{companyName}</h1>
              ) : null}
              {planName ? <StatusPill tone="info">{planName}</StatusPill> : null}
              {status ? <StatusPill tone="muted">{status}</StatusPill> : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {industry ? (
                <span>
                  {t("companyWorkspace.overview.industry")}:{" "}
                  <span className="font-medium text-foreground">{industry}</span>
                </span>
              ) : null}
              {renewal ? (
                <span>
                  {t("companyWorkspace.overview.renewalDate")}:{" "}
                  <span className="font-medium text-foreground">
                    {formatBillingDate(renewal)}
                  </span>
                </span>
              ) : null}
              {createdAt ? (
                <span>
                  {t("companyWorkspace.overview.createdDate")}:{" "}
                  <span className="font-medium text-foreground">
                    {formatBillingDate(createdAt)}
                  </span>
                </span>
              ) : null}
              {owner ? (
                <span>
                  {t("companyWorkspace.overview.owner")}:{" "}
                  <span className="font-medium text-foreground">{owner}</span>
                </span>
              ) : null}
              {billingCycle ? (
                <span>
                  {t("companyWorkspace.overview.billingCycle")}:{" "}
                  <span className="font-medium text-foreground">{billingCycle}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1b — Company Setup Progress */}
      <CompanySetupProgressCard progress={setupProgress} onOpenItem={openSetupItem} />

      {/* SECTION 2 — AI Command Center */}
      {canAiCosts ? (
        <AiCommandCenterCard metrics={aiMetrics} isLoading={aiAggregate.isLoading} />
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {/* SECTION 3 — Company Health */}
        <OverviewSection title={t("companyWorkspace.overview.health.title")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <BrandProgressRing
                value={health.score}
                tone={
                  health.level === "excellent"
                    ? "ok"
                    : health.level === "good"
                      ? "neutral"
                      : "high"
                }
                size={120}
                stroke={10}
              >
                <span className="text-2xl font-semibold tabular-nums">{health.score}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("companyWorkspace.overview.health.score")}
                </span>
              </BrandProgressRing>
              <StatusPill tone={healthLevelTone}>
                {t(`companyWorkspace.overview.health.levels.${health.level}`)}
              </StatusPill>
            </div>
            <ul className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
              {health.checks.map((check) => {
                const fix =
                  check.state !== "healthy" ? healthFixDestinations[check.id] : undefined;
                const content = (
                  <>
                    <span>{t(`companyWorkspace.overview.health.checks.${check.id}`)}</span>
                    <StatusPill tone={healthTone(check.state)}>
                      {t(`companyWorkspace.overview.health.states.${check.state}`)}
                    </StatusPill>
                  </>
                );
                return (
                  <li key={check.id}>
                    {fix ? (
                      <button
                        type="button"
                        onClick={fix}
                        className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/15 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/15 px-2.5 py-1.5 text-xs">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </OverviewSection>

        {/* SECTION 4 — License & Subscription */}
        <OverviewSection
          title={t("companyWorkspace.overview.license.title")}
          empty={
            (!permissions.canSubscription && !canBilling) ||
            (licenseMeters.length === 0 && !planName && !subscriptionStatus)
          }
        >
          {(planName || subscriptionStatus) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {planName ? <StatusPill tone="info">{planName}</StatusPill> : null}
              {subscriptionStatus ? (
                <StatusPill
                  tone={
                    isSubscriptionActiveStatus(subscriptionStatus) ? "success" : "warning"
                  }
                >
                  {subscriptionStatus}
                </StatusPill>
              ) : null}
            </div>
          )}
          {licenseMeters.length > 0 ? (
            <div className="grid gap-3">
              {licenseMeters.map((meter) => (
                <LicenseMeter
                  key={meter.id}
                  label={meter.label}
                  used={meter.used}
                  limit={meter.limit}
                  formatValue={meter.formatValue}
                />
              ))}
            </div>
          ) : null}
        </OverviewSection>

        {/* SECTION 5 — Business Resources */}
        <OverviewSection
          title={t("companyWorkspace.overview.resources.title")}
          empty={resourceItems.length === 0}
          className="xl:col-span-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {resourceItems.map((item) => (
              <ResourceTile
                key={item.id}
                label={item.label}
                value={item.value as string | number}
              />
            ))}
          </div>
        </OverviewSection>

        {/* SECTION 6 — Connected Services */}
        <OverviewSection
          title={t("companyWorkspace.overview.connectedServices.title")}
          empty={
            (!canAiCosts || !openaiProvider) &&
            (!canChannels || channelCards.length === 0)
          }
          className="xl:col-span-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {canAiCosts && openaiProvider ? (
              <button
                type="button"
                onClick={() => setLocation("~/dashboard/ai-usage")}
                className={serviceCardInteractiveClass}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t("companyWorkspace.overview.connectedServices.openai")}
                  </span>
                  <StatusPill tone="success">
                    {t("companyWorkspace.overview.connectedServices.states.connected")}
                  </StatusPill>
                </div>
                {openaiProvider.model ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("companyWorkspace.overview.aiUsage.model")}: {openaiProvider.model}
                  </p>
                ) : null}
                {openaiProvider.latency != null ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("companyWorkspace.overview.aiUsage.responseTime")}:{" "}
                    {t("companyWorkspace.overview.aiUsage.ms", {
                      value: Math.round(openaiProvider.latency),
                    })}
                  </p>
                ) : null}
                {openaiProvider.lastSuccess ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("companyWorkspace.overview.connectedServices.lastSuccess")}:{" "}
                    {formatBillingDate(openaiProvider.lastSuccess)}
                  </p>
                ) : null}
              </button>
            ) : null}

            {canChannels
              ? channelCards.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => setLocation("~/dashboard/channels")}
                    className={serviceCardInteractiveClass}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t(`companyWorkspace.overview.connectedServices.${svc.id}`)}
                      </span>
                      <StatusPill tone={connectionTone(svc.state)}>
                        {t(`companyWorkspace.overview.connectedServices.states.${svc.state}`)}
                      </StatusPill>
                    </div>
                    {svc.account ? (
                      <p className="mt-1.5 truncate text-xs text-muted-foreground">
                        {t("companyWorkspace.overview.connectedServices.account")}: {svc.account}
                      </p>
                    ) : null}
                    {svc.webhook ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t("companyWorkspace.overview.connectedServices.webhook")}: {svc.webhook}
                      </p>
                    ) : null}
                    {svc.lastSync ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t("companyWorkspace.overview.connectedServices.lastSync")}:{" "}
                        {formatBillingDate(svc.lastSync)}
                      </p>
                    ) : null}
                  </button>
                ))
              : null}
          </div>
        </OverviewSection>

        {/* SECTION 7 — Business Insights (warnings only — not navigation) */}
        <OverviewSection
          title={t("companyWorkspace.overview.insights.title")}
          empty={insights.length === 0}
          className="xl:col-span-2"
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {insights.map((insight) => (
              <li key={insight.id}>
                <div
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-start text-sm",
                    insight.tone === "danger"
                      ? "border-destructive/30 bg-destructive/5"
                      : insight.tone === "warning"
                        ? "border-warning/30 bg-warning/5"
                        : insight.tone === "success"
                          ? "border-success/30 bg-success/5"
                          : "border-border/50 bg-muted/15",
                  )}
                >
                  {t(
                    `companyWorkspace.overview.insights.items.${insight.messageKey}`,
                    insight.params,
                  )}
                </div>
              </li>
            ))}
          </ul>
        </OverviewSection>
      </div>
    </div>
  );
}
