import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  canCreateCompanies,
  canDeleteCompanies,
  canEditCompanies,
  canManageCompanyCommercialAccess,
  canViewCompanies,
} from "@/lib/companies/company-permissions";
import { countCompaniesByWorkspaceTab, type CompanyWorkspaceTab } from "@/lib/companies/company-list-filters";
import { canEditBilling, canViewBilling } from "@/lib/billing/billing-permissions";
import {
  applyCompanyTableQuery,
  companyPackageDisplaySource,
  countActiveCompanyTableFilters,
  DEFAULT_COMPANY_TABLE_SORT,
  EMPTY_COMPANY_TABLE_FILTERS,
  paginateCompanyTable,
  resolveCompanyDisplayStatus,
  uniqueCompanyFilterValues,
  type CompanyDisplayStatus,
  type CompanyTableFilters,
  type CompanyTableSort,
  type CompanyTableSortKey,
} from "@/lib/companies/company-table-query";
import type { CompanyRowActionId } from "@/lib/companies/company-row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyModal } from "@/components/dashboard/company-modal";
import {
  CompanyOnboardingWizard,
  formatCompanyLocation,
} from "@/components/companies/company-onboarding-wizard";
import { CompanyApprovalReviewDialog } from "@/components/companies/company-approval-review-dialog";
import { CompanyDetailsDialog } from "@/components/companies/details/company-details-dialog";
import { CompanyStatusReasonDialog } from "@/components/companies/company-status-reason-dialog";
import { CompanyFeaturesAccessDialog } from "@/components/companies/company-features-access-dialog";
import {
  CompanySubscriptionActionLoader,
  CompanySubscriptionManageDialog,
} from "@/components/companies/company-subscription-manage-dialog";
import { BillingChangePackageDialog } from "@/components/billing/dialogs/billing-change-package-dialog";
import { BillingConvertTrialDialog } from "@/components/billing/dialogs/billing-convert-trial-dialog";
import { BillingSubscriptionStatusDialog } from "@/components/billing/dialogs/billing-subscription-status-dialog";
import type { CompanySubscription } from "@/lib/billing/types";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { CompanyColumnFilter } from "@/components/companies/table/company-column-filter";
import { CompanyRowActionsMenu } from "@/components/companies/table/company-row-actions-menu";
import { ResetCompanyAdminPasswordDialog } from "@/components/companies/reset-company-admin-password-dialog";
import {
  useCompanies,
  useDeleteCompany,
  useRetryTenantProvisioning,
} from "@/hooks/use-companies";
import { useRejectCompany } from "@/hooks/companies/use-company-approval";
import { useSuspendBillingSubscription } from "@/hooks/billing/use-billing-edit";
import { useToast } from "@/hooks/use-toast";
import { companyInternalFlag } from "@/lib/companies/company-access-state";
import {
  sanitizeCompanyCommercialError,
  sanitizeCompanyLifecycleError,
} from "@/lib/companies/company-lifecycle-errors";
import { cn } from "@/lib/utils";
import type { Company, TenantProvisioningStatus } from "@/lib/types";

const PAGE_SIZE = 8;
const CANONICAL_PACKAGES = ["basic", "pro", "enterprise", "trial", "custom", "contract"] as const;

function ProvisioningBadge({ status }: { status?: TenantProvisioningStatus }) {
  const { t } = useTranslation("common");
  if (!status || status === "completed") return null;
  const classes =
    status === "failed"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "provisioning"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", classes)}>
      {t(`companies.provisioning.${status}`)}
    </span>
  );
}

function DisplayStatusBadge({ company }: { company: Company }) {
  const { t } = useTranslation("common");
  const status = resolveCompanyDisplayStatus(company);
  const classes =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "suspended" || status === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", classes)}>
      {t(`companies.displayStatus.${status}`)}
    </span>
  );
}

function labelOrDash(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function CompanyAvatar({ company }: { company: Company }) {
  if (company.logo_url) {
    return (
      <img
        src={company.logo_url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full border border-border/60 object-cover bg-background"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
      {company.name.charAt(0).toUpperCase()}
    </div>
  );
}

function SortMark({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" />;
  return direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

export function CompaniesPage() {
  const { t, i18n } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canView = canViewCompanies(hasPermission, isSuperAdmin);
  const canCreate = canCreateCompanies(hasPermission, isSuperAdmin);
  const canEdit = canEditCompanies(hasPermission, isSuperAdmin);
  const canDelete = canDeleteCompanies(hasPermission, isSuperAdmin);
  const canCommercial = canManageCompanyCommercialAccess(isSuperAdmin);
  const canViewBillingAccess = canViewBilling(hasPermission, isSuperAdmin);
  const canEditBillingAccess = canEditBilling(hasPermission, isSuperAdmin);
  const { data: companies = [], isLoading, error } = useCompanies();
  const deleteCompany = useDeleteCompany();
  const retryProvisioning = useRetryTenantProvisioning();
  const rejectCompany = useRejectCompany();
  const suspendCompany = useSuspendBillingSubscription();
  const { toast } = useToast();

  const [filters, setFilters] = useState<CompanyTableFilters>(EMPTY_COMPANY_TABLE_FILTERS);
  const [sort, setSort] = useState<CompanyTableSort>(DEFAULT_COMPANY_TABLE_SORT);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);
  const [detailsCompany, setDetailsCompany] = useState<Company | null>(null);
  const [reviewCompany, setReviewCompany] = useState<Company | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    company: Company;
    mode: "suspend" | "reject";
  } | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [featuresCompany, setFeaturesCompany] = useState<Company | null>(null);
  const [billingCompany, setBillingCompany] = useState<Company | null>(null);
  const [billingMode, setBillingMode] = useState<"suspend" | "restore">("suspend");
  const [subscriptionCompany, setSubscriptionCompany] = useState<Company | null>(null);
  const [packageCompany, setPackageCompany] = useState<Company | null>(null);
  const [convertCompany, setConvertCompany] = useState<Company | null>(null);
  const [packageSubscription, setPackageSubscription] = useState<CompanySubscription | null>(null);
  const [convertSubscription, setConvertSubscription] = useState<CompanySubscription | null>(null);
  const [resetAdminPasswordCompany, setResetAdminPasswordCompany] = useState<Company | null>(null);

  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;
  const dash = t("companies.table.dash");
  const capabilities = {
    canView,
    canEdit,
    canDelete,
    canCommercial,
    canViewBilling: canViewBillingAccess,
    canEditBilling: canEditBillingAccess,
    canResetAdminPassword: Boolean(isSuperAdmin),
  };

  const workspaceRows = useMemo(
    () => companies.filter((company) => company.company_type !== "platform"),
    [companies],
  );
  const tabCounts = useMemo(() => countCompaniesByWorkspaceTab(workspaceRows), [workspaceRows]);
  const optionLists = useMemo(() => uniqueCompanyFilterValues(workspaceRows), [workspaceRows]);
  const filtered = useMemo(
    () => applyCompanyTableQuery(workspaceRows, filters, sort),
    [workspaceRows, filters, sort],
  );
  const activeFilterCount = countActiveCompanyTableFilters(filters);
  const pagination = paginateCompanyTable(filtered, page, PAGE_SIZE);
  const paginated = pagination.rows;

  const updateFilters = (patch: Partial<CompanyTableFilters>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(EMPTY_COMPANY_TABLE_FILTERS);
    setSort(DEFAULT_COMPANY_TABLE_SORT);
  };

  const toggleSort = (key: CompanyTableSortKey) => {
    setPage(1);
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );
  };

  const formatDate = (value: string) =>
    format(new Date(value), i18n.language?.startsWith("ar") ? "d MMM yyyy" : "MMM dd, yyyy", {
      locale: dateLocale,
    });

  const packageLabel = (company: Company) => {
    const source = companyPackageDisplaySource(company);
    if (!source.key) return t("companies.packages.none");
    if ((CANONICAL_PACKAGES as readonly string[]).includes(source.key)) {
      return t(`companies.packages.${source.key}`);
    }
    return source.rawLabel || t("companies.packages.none");
  };

  const handlePackageReady = useCallback((subscription: CompanySubscription) => {
    setPackageCompany(null);
    setPackageSubscription(subscription);
  }, []);

  const handleConvertReady = useCallback((subscription: CompanySubscription) => {
    setConvertCompany(null);
    setConvertSubscription(subscription);
  }, []);

  const handlePackageBlocked = useCallback(
    (reason: "load" | "trial" | "state" | "cancelled" | "missing") => {
      const company = packageCompany;
      setPackageCompany(null);
      if (reason === "cancelled") return;
      if (reason === "missing" && company) {
        setSubscriptionCompany(company);
        return;
      }
      if (reason === "trial" && company) {
        setConvertCompany(company);
        return;
      }
      toast({
        title:
          reason === "load"
            ? t("companies.commercial.operationFailed")
            : t("companies.commercial.changeBlockedState"),
        variant: "destructive",
      });
    },
    [packageCompany, t, toast],
  );

  const handleConvertBlocked = useCallback(
    (reason: "load" | "trial" | "state" | "cancelled" | "missing") => {
      setConvertCompany(null);
      if (reason === "cancelled") return;
      toast({
        title:
          reason === "missing"
            ? t("companies.commercial.noSubscription")
            : reason === "load"
              ? t("companies.commercial.operationFailed")
              : t("companies.commercial.changeBlockedState"),
        variant: "destructive",
      });
    },
    [t, toast],
  );

  const handleAction = (company: Company, id: CompanyRowActionId) => {
    switch (id) {
      case "view":
        setDetailsCompany(company);
        break;
      case "review":
        setReviewCompany(company);
        break;
      case "reject":
        setLifecycleError(null);
        setReasonDialog({ company, mode: "reject" });
        break;
      case "edit":
        setEditCompany(company);
        break;
      case "features":
      case "extendTrial":
        setFeaturesCompany(company);
        break;
      case "subscription":
        setSubscriptionCompany(company);
        break;
      case "changePackage":
        setPackageCompany(company);
        break;
      case "convertTrial":
        setConvertCompany(company);
        break;
      case "retryProvisioning":
        retryProvisioning.mutate(company.id, {
          onError: (retryError) => console.error(retryError.message),
        });
        break;
      case "suspend":
        setDetailsCompany(null);
        setLifecycleError(null);
        setReasonDialog({ company, mode: "suspend" });
        break;
      case "restore":
        setBillingMode("restore");
        setBillingCompany(company);
        break;
      case "delete":
        setPendingDelete(company);
        break;
      case "resetAdminPassword":
        setResetAdminPasswordCompany(company);
        break;
      default:
        break;
    }
  };

  if (!canView) {
    return (
      <div className="space-y-6" dir={i18n.dir()}>
        <div>
          <h1 className="text-[1.35rem] font-semibold tracking-tight">{t("companies.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("companies.noPermission")}</p>
        </div>
      </div>
    );
  }

  const stats: Array<{
    key: CompanyWorkspaceTab;
    status: CompanyDisplayStatus;
    label: string;
    value: number;
    icon: typeof Building2;
    tone: string;
  }> = [
    { key: "pending", status: "pending", label: t("companies.stats.pending"), value: tabCounts.pending, icon: ShieldCheck, tone: "text-amber-600" },
    { key: "active", status: "active", label: t("companies.stats.active"), value: tabCounts.active, icon: CheckCircle2, tone: "text-emerald-600" },
    { key: "trial", status: "trial", label: t("companies.stats.trial"), value: tabCounts.trial, icon: Clock3, tone: "text-amber-600" },
    { key: "suspended", status: "suspended", label: t("companies.stats.suspended"), value: tabCounts.suspended, icon: XCircle, tone: "text-rose-600" },
    { key: "all", status: "all", label: t("companies.stats.total"), value: tabCounts.all, icon: Building2, tone: "text-primary" },
  ];

  return (
    <div className="space-y-5" dir={i18n.dir()}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.35rem] font-semibold tracking-tight">{t("companies.title")}</h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">{t("companies.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button type="button" className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("buttons.addCompany")}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() => updateFilters({ displayStatus: stat.status })}
            className={cn(
              "rounded-xl border bg-background px-4 py-3.5 text-start transition-colors",
              filters.displayStatus === stat.status
                ? "border-primary/40 ring-1 ring-primary/20"
                : "border-border/60 hover:bg-muted/20",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
              <stat.icon className={cn("size-4", stat.tone)} aria-hidden />
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{stat.value}</p>
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        <div className="flex flex-wrap items-end gap-2 border-b border-border/60 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder={t("companies.searchPlaceholder")}
              className="h-10 rounded-xl ps-9"
            />
          </div>
          <Select value={filters.displayStatus} onValueChange={(value) => updateFilters({ displayStatus: value as CompanyDisplayStatus })}>
            <SelectTrigger className="h-10 w-[160px] rounded-xl"><SelectValue placeholder={t("companies.filters.status")} /></SelectTrigger>
            <SelectContent>
              {(["all", "pending", "active", "trial", "suspended", "rejected"] as const).map((value) => (
                <SelectItem key={value} value={value}>{t(`companies.displayStatus.${value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.packageKey} onValueChange={(value) => updateFilters({ packageKey: value })}>
            <SelectTrigger className="h-10 w-[170px] rounded-xl"><SelectValue placeholder={t("companies.filters.package")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
              <SelectItem value="none">{t("companies.packages.none")}</SelectItem>
              {CANONICAL_PACKAGES.map((value) => (
                <SelectItem key={value} value={value}>{t(`companies.packages.${value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.industry} onValueChange={(value) => updateFilters({ industry: value })}>
            <SelectTrigger className="h-10 w-[160px] rounded-xl"><SelectValue placeholder={t("companies.filters.industry")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
              {optionLists.industries.map((value) => (
                <SelectItem key={value} value={value}>{t(`companyOnboarding.industries.${value}`, { defaultValue: value })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.businessType} onValueChange={(value) => updateFilters({ businessType: value })}>
            <SelectTrigger className="h-10 w-[160px] rounded-xl"><SelectValue placeholder={t("companies.filters.businessType")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
              {optionLists.businessTypes.map((value) => (
                <SelectItem key={value} value={value}>{t(`companyOnboarding.businessTypes.${value}`, { defaultValue: value })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeFilterCount > 0 ? (
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={clearFilters}>
              {t("companies.filters.clear")}
              <span className="ms-1.5 tabular-nums opacity-70">{activeFilterCount}</span>
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-28 animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="space-y-3 py-16 text-center text-sm text-muted-foreground">
            <p>
              {workspaceRows.length === 0
                ? t("companies.emptyAll")
                : t("companies.emptyFiltered")}
            </p>
            {workspaceRows.length > 0 ? (
              <Button type="button" variant="outline" className="rounded-xl" onClick={clearFilters}>
                {t("companies.filters.clear")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("name")}>
                          {t("companies.table.name")}
                          <SortMark active={sort.key === "name"} direction={sort.direction} />
                        </button>
                        <CompanyColumnFilter label={t("companies.table.name")} active={Boolean(filters.name.value.trim())}>
                          <Select value={filters.name.mode} onValueChange={(value) => updateFilters({ name: { ...filters.name, mode: value as "contains" | "startsWith" } })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contains">{t("companies.filters.contains")}</SelectItem>
                              <SelectItem value="startsWith">{t("companies.filters.startsWith")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input value={filters.name.value} onChange={(event) => updateFilters({ name: { ...filters.name, value: event.target.value } })} />
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.businessType")}
                        <CompanyColumnFilter label={t("companies.filters.businessType")} active={filters.businessType !== "all"}>
                          <Select value={filters.businessType} onValueChange={(value) => updateFilters({ businessType: value })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
                              {optionLists.businessTypes.map((value) => (
                                <SelectItem key={value} value={value}>{t(`companyOnboarding.businessTypes.${value}`, { defaultValue: value })}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.industry")}
                        <CompanyColumnFilter label={t("companies.filters.industry")} active={filters.industry !== "all"}>
                          <Select value={filters.industry} onValueChange={(value) => updateFilters({ industry: value })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
                              {optionLists.industries.map((value) => (
                                <SelectItem key={value} value={value}>{t(`companyOnboarding.industries.${value}`, { defaultValue: value })}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                          {t("companies.table.status")}
                          <SortMark active={sort.key === "status"} direction={sort.direction} />
                        </button>
                        <CompanyColumnFilter label={t("companies.filters.status")} active={filters.displayStatus !== "all"}>
                          <Select value={filters.displayStatus} onValueChange={(value) => updateFilters({ displayStatus: value as CompanyDisplayStatus })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(["all", "pending", "active", "trial", "suspended", "rejected"] as const).map((value) => (
                                <SelectItem key={value} value={value}>{t(`companies.displayStatus.${value}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("package")}>
                          {t("companies.table.plan")}
                          <SortMark active={sort.key === "package"} direction={sort.direction} />
                        </button>
                        <CompanyColumnFilter label={t("companies.filters.package")} active={filters.packageKey !== "all"}>
                          <Select value={filters.packageKey} onValueChange={(value) => updateFilters({ packageKey: value })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("companies.filters.all")}</SelectItem>
                              <SelectItem value="none">{t("companies.packages.none")}</SelectItem>
                              {CANONICAL_PACKAGES.map((value) => (
                                <SelectItem key={value} value={value}>{t(`companies.packages.${value}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.owner")}
                        <CompanyColumnFilter label={t("companies.filters.owner")} active={Boolean(filters.owner.trim())}>
                          <Input value={filters.owner} onChange={(event) => updateFilters({ owner: event.target.value })} />
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.email")}
                        <CompanyColumnFilter label={t("companies.table.email")} active={Boolean(filters.email.value.trim())}>
                          <Input value={filters.email.value} onChange={(event) => updateFilters({ email: { ...filters.email, value: event.target.value } })} dir="ltr" />
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.phone")}
                        <CompanyColumnFilter label={t("companies.table.phone")} active={Boolean(filters.phone.value.trim())}>
                          <Input value={filters.phone.value} onChange={(event) => updateFilters({ phone: { ...filters.phone, value: event.target.value } })} dir="ltr" />
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        {t("companies.table.location")}
                        <CompanyColumnFilter label={t("companies.filters.location")} active={Boolean(filters.location.trim())}>
                          <Input value={filters.location} onChange={(event) => updateFilters({ location: event.target.value })} />
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("created_at")}>
                          {t("companies.table.created")}
                          <SortMark active={sort.key === "created_at"} direction={sort.direction} />
                        </button>
                        <CompanyColumnFilter label={t("companies.filters.created")} active={Boolean(filters.createdFrom || filters.createdTo)}>
                          <div className="space-y-1">
                            <Label>{t("companies.filters.from")}</Label>
                            <Input type="date" value={filters.createdFrom ?? ""} onChange={(event) => updateFilters({ createdFrom: event.target.value || null })} />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("companies.filters.to")}</Label>
                            <Input type="date" value={filters.createdTo ?? ""} onChange={(event) => updateFilters({ createdTo: event.target.value || null })} />
                          </div>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-start font-medium">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("updated_at")}>
                          {t("companies.table.updated")}
                          <SortMark active={sort.key === "updated_at"} direction={sort.direction} />
                        </button>
                        <CompanyColumnFilter label={t("companies.filters.updated")} active={Boolean(filters.updatedFrom || filters.updatedTo)}>
                          <div className="space-y-1">
                            <Label>{t("companies.filters.from")}</Label>
                            <Input type="date" value={filters.updatedFrom ?? ""} onChange={(event) => updateFilters({ updatedFrom: event.target.value || null })} />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("companies.filters.to")}</Label>
                            <Input type="date" value={filters.updatedTo ?? ""} onChange={(event) => updateFilters({ updatedTo: event.target.value || null })} />
                          </div>
                        </CompanyColumnFilter>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-end font-medium">{t("companies.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginated.map((company) => (
                    <tr key={company.id} className="bg-background transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <CompanyAvatar company={company} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{company.name}</p>
                            {companyInternalFlag(company) ? (
                              <span className="mt-1 inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                                {companyInternalFlag(company) === "suspended"
                                  ? t("companies.flags.suspended")
                                  : t("companies.flags.rejected")}
                              </span>
                            ) : (
                              <ProvisioningBadge status={company.tenant_provisioning_status} />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {company.business_type
                          ? t(`companyOnboarding.businessTypes.${company.business_type}`, { defaultValue: company.business_type })
                          : dash}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {company.industry
                          ? t(`companyOnboarding.industries.${company.industry}`, { defaultValue: company.industry })
                          : dash}
                      </td>
                      <td className="px-4 py-3"><DisplayStatusBadge company={company} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{packageLabel(company)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{labelOrDash(company.contact_person, dash)}</td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">{labelOrDash(company.contact_email, dash)}</td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">{labelOrDash(company.contact_phone, dash)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{labelOrDash(formatCompanyLocation(company), dash)}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {formatDate(company.approval_requested_at ?? company.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{formatDate(company.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <CompanyRowActionsMenu
                            company={company}
                            capabilities={capabilities}
                            onAction={(id) => handleAction(company, id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("companies.pagination.pageInfo", {
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                  total: filtered.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pagination.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  {t("companies.pagination.previous")}
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>
                  {t("companies.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <CompanyOnboardingWizard open={createOpen} mode="admin_add" onOpenChange={setCreateOpen} />
      {editCompany ? <CompanyModal open={Boolean(editCompany)} company={editCompany} onClose={() => setEditCompany(null)} /> : null}
      <CompanyDetailsDialog
        company={detailsCompany}
        open={Boolean(detailsCompany)}
        capabilities={capabilities}
        onOpenChange={(open) => {
          if (!open) setDetailsCompany(null);
        }}
        onAction={(id) => {
          if (!detailsCompany) return;
          if (id === "review") setDetailsCompany(null);
          handleAction(detailsCompany, id);
        }}
      />
      <CompanyStatusReasonDialog
        open={Boolean(reasonDialog)}
        mode={reasonDialog?.mode ?? "suspend"}
        companyName={reasonDialog?.company.name ?? ""}
        pending={suspendCompany.isPending || rejectCompany.isPending}
        errorMessage={lifecycleError}
        onOpenChange={(open) => {
          if (!open) {
            setReasonDialog(null);
            setLifecycleError(null);
          }
        }}
        onConfirm={(reason) => {
          if (!reasonDialog) return;
          setLifecycleError(null);
          if (reasonDialog.mode === "suspend") {
            suspendCompany.mutate(
              { companyId: reasonDialog.company.id, reason },
              {
                onSuccess: () => {
                  setReasonDialog(null);
                  setDetailsCompany(null);
                  toast({ title: t("companies.lifecycle.suspendSuccess") });
                },
                onError: (error) => {
                  setLifecycleError(
                    sanitizeCompanyLifecycleError(error, t("companies.lifecycle.suspendFailed")),
                  );
                },
              },
            );
            return;
          }
          rejectCompany.mutate(
            { companyId: reasonDialog.company.id, reason },
            {
              onSuccess: () => {
                setReasonDialog(null);
                setDetailsCompany(null);
                setReviewCompany(null);
                toast({ title: t("companies.lifecycle.rejectSuccess") });
              },
              onError: (error) => {
                setLifecycleError(
                  sanitizeCompanyLifecycleError(error, t("companies.lifecycle.rejectFailed")),
                );
              },
            },
          );
        }}
      />
      <CompanyApprovalReviewDialog
        company={reviewCompany}
        open={Boolean(reviewCompany)}
        onOpenChange={(open) => {
          if (!open) setReviewCompany(null);
        }}
      />
      <CompanyFeaturesAccessDialog
        company={featuresCompany}
        open={Boolean(featuresCompany)}
        onOpenChange={(open) => {
          if (!open) setFeaturesCompany(null);
        }}
      />
      {billingCompany ? (
        <BillingSubscriptionStatusDialog
          open={Boolean(billingCompany)}
          onOpenChange={(open) => {
            if (!open) setBillingCompany(null);
          }}
          companyId={billingCompany.id}
          mode={billingMode}
          onSuccess={() => {
            toast({ title: t("companies.lifecycle.restoreSuccess") });
          }}
        />
      ) : null}
      <DeleteDialog
        open={Boolean(pendingDelete)}
        title={t("companies.deleteTitle", { name: pendingDelete?.name })}
        description={t("companies.deleteDescription")}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteCompany.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
        }}
        isPending={deleteCompany.isPending}
      />
      <ResetCompanyAdminPasswordDialog
        company={resetAdminPasswordCompany}
        open={Boolean(resetAdminPasswordCompany)}
        onOpenChange={(open) => {
          if (!open) setResetAdminPasswordCompany(null);
        }}
      />
      <CompanySubscriptionManageDialog
        company={subscriptionCompany}
        open={Boolean(subscriptionCompany)}
        canChangePackage={canEditBillingAccess}
        onOpenChange={(open) => {
          if (!open) setSubscriptionCompany(null);
        }}
        onChangePackage={(subscription) => {
          setSubscriptionCompany(null);
          setPackageSubscription(subscription);
        }}
        onConvertTrial={(subscription) => {
          setSubscriptionCompany(null);
          setConvertSubscription(subscription);
        }}
      />
      {packageCompany ? (
        <CompanySubscriptionActionLoader
          company={packageCompany}
          mode="changePackage"
          onReady={handlePackageReady}
          onBlocked={handlePackageBlocked}
        />
      ) : null}
      {convertCompany ? (
        <CompanySubscriptionActionLoader
          company={convertCompany}
          mode="convertTrial"
          onReady={handleConvertReady}
          onBlocked={handleConvertBlocked}
        />
      ) : null}
      {packageSubscription ? (
        <BillingChangePackageDialog
          open
          subscription={packageSubscription}
          onOpenChange={(open) => {
            if (!open) setPackageSubscription(null);
          }}
          onSuccess={() => {
            setPackageSubscription(null);
            toast({ title: t("companies.commercial.changeSuccess") });
          }}
          onError={(message) => {
            toast({
              title: t("companies.commercial.changeFailed"),
              description: sanitizeCompanyCommercialError(message, t("companies.commercial.changeFailed")),
              variant: "destructive",
            });
          }}
        />
      ) : null}
      {convertSubscription ? (
        <BillingConvertTrialDialog
          open
          subscription={convertSubscription}
          onOpenChange={(open) => {
            if (!open) setConvertSubscription(null);
          }}
          onSuccess={() => {
            setConvertSubscription(null);
            toast({ title: t("companies.commercial.convertSuccess") });
          }}
          onError={(message) => {
            toast({
              title: t("companies.commercial.convertFailed"),
              description: sanitizeCompanyCommercialError(message, t("companies.commercial.convertFailed")),
              variant: "destructive",
            });
          }}
        />
      ) : null}
    </div>
  );
}
