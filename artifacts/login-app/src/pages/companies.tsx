import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Filter,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
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
import {
  countCompaniesByWorkspaceTab,
  matchesCompanyWorkspaceTab,
  resolveCompanyApprovalStatus,
  type CompanyWorkspaceTab,
} from "@/lib/companies/company-list-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyModal } from "@/components/dashboard/company-modal";
import {
  CompanyOnboardingWizard,
  formatCompanyLocation,
} from "@/components/companies/company-onboarding-wizard";
import { CompanyApprovalReviewDialog } from "@/components/companies/company-approval-review-dialog";
import { CompanyFeaturesAccessDialog } from "@/components/companies/company-features-access-dialog";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  useCompanies,
  useDeleteCompany,
  useRetryTenantProvisioning,
} from "@/hooks/use-companies";
import { cn } from "@/lib/utils";
import type { Company, CompanyStatus, TenantProvisioningStatus } from "@/lib/types";

const PAGE_SIZE = 8;

const WORKSPACE_TABS: CompanyWorkspaceTab[] = [
  "pending",
  "active",
  "trial",
  "suspended",
  "all",
];

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
    <span className={cn("mt-1 inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border", classes)}>
      {t(`companies.provisioning.${status}`)}
    </span>
  );
}

function ApprovalBadge({ company }: { company: Company }) {
  const { t } = useTranslation("common");
  const approval = resolveCompanyApprovalStatus(company);

  if (approval === "pending") {
    return (
      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
        {t("companies.approval.awaitingApproval")}
      </span>
    );
  }

  if (approval === "rejected") {
    return (
      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700">
        {t("companies.approval.rejected")}
      </span>
    );
  }

  return <StatusBadge status={company.status} />;
}

function StatusBadge({ status }: { status: CompanyStatus }) {
  const { t } = useTranslation("common");
  const classes =
    status === "Active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Suspended"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={cn("inline-flex text-xs font-medium px-2.5 py-1 rounded-full border", classes)}>
      {t(`status.${status.toLowerCase()}`, { defaultValue: status })}
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

export function CompaniesPage() {
  const { t, i18n } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canView = canViewCompanies(hasPermission, isSuperAdmin);
  const canCreate = canCreateCompanies(hasPermission, isSuperAdmin);
  const canEdit = canEditCompanies(hasPermission, isSuperAdmin);
  const canDelete = canDeleteCompanies(hasPermission, isSuperAdmin);
  const canCommercial = canManageCompanyCommercialAccess(isSuperAdmin);
  const { data: companies = [], isLoading, error } = useCompanies();
  const deleteCompany = useDeleteCompany();
  const retryProvisioning = useRetryTenantProvisioning();

  const [search, setSearch] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<CompanyWorkspaceTab>("pending");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);
  const [reviewCompany, setReviewCompany] = useState<Company | null>(null);
  const [featuresCompany, setFeaturesCompany] = useState<Company | null>(null);

  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;

  const planOptions = useMemo(
    () =>
      Array.from(
        new Set(companies.map((company) => company.subscription_plan).filter(Boolean)),
      ),
    [companies],
  );

  const tabCounts = useMemo(() => countCompaniesByWorkspaceTab(companies), [companies]);

  const filtered = useMemo(() => {
    return companies.filter((company) => {
      const haystack = [
        company.name,
        company.subscription_plan,
        company.business_type,
        company.industry,
        company.contact_email,
        company.contact_phone,
        company.contact_person,
        company.approval_status,
        formatCompanyLocation(company),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesTab = matchesCompanyWorkspaceTab(company, workspaceTab);
      const matchesPlan = planFilter === "all" || company.subscription_plan === planFilter;
      return matchesSearch && matchesTab && matchesPlan;
    });
  }, [companies, search, workspaceTab, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const dash = t("companies.table.dash");

  const formatDate = (value: string) =>
    format(new Date(value), i18n.language?.startsWith("ar") ? "d MMM yyyy" : "MMM dd, yyyy", {
      locale: dateLocale,
    });

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
        {[
          {
            key: "pending" as const,
            label: t("companies.stats.pending"),
            value: tabCounts.pending,
            icon: ShieldCheck,
            tone: "text-amber-600",
          },
          {
            key: "active" as const,
            label: t("companies.stats.active"),
            value: tabCounts.active,
            icon: CheckCircle2,
            tone: "text-emerald-600",
          },
          {
            key: "trial" as const,
            label: t("companies.stats.trial"),
            value: tabCounts.trial,
            icon: Clock3,
            tone: "text-amber-600",
          },
          {
            key: "suspended" as const,
            label: t("companies.stats.suspended"),
            value: tabCounts.suspended,
            icon: XCircle,
            tone: "text-rose-600",
          },
          {
            key: "all" as const,
            label: t("companies.stats.total"),
            value: tabCounts.all,
            icon: Building2,
            tone: "text-primary",
          },
        ].map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() => {
              setPage(1);
              setWorkspaceTab(stat.key);
            }}
            className={cn(
              "rounded-xl border bg-background px-4 py-3.5 text-start transition-colors",
              workspaceTab === stat.key
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
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
            {WORKSPACE_TABS.map((tab) => (
              <Button
                key={tab}
                type="button"
                size="sm"
                variant={workspaceTab === tab ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => {
                  setPage(1);
                  setWorkspaceTab(tab);
                }}
              >
                {t(`companies.tabs.${tab}`)}
                <span className="ms-1.5 tabular-nums opacity-70">{tabCounts[tab]}</span>
              </Button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder={t("companies.searchPlaceholder")}
              className="h-10 rounded-xl ps-9"
            />
          </div>

          <div className="flex min-w-[160px] items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" aria-hidden />
            <select
              value={planFilter}
              onChange={(event) => {
                setPage(1);
                setPlanFilter(event.target.value);
              }}
              className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="all">{t("companies.filters.allPlans")}</option>
              {planOptions.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </div>
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
          <div className="py-16 text-center text-sm text-muted-foreground">
            {companies.length === 0
              ? t("companies.emptyAll")
              : workspaceTab === "pending"
                ? t("companies.emptyPending")
                : t("companies.emptySearch")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.name")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.businessType")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.industry")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.status")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.plan")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.owner")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.email")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.phone")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.location")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.created")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("companies.table.updated")}</th>
                    <th className="px-4 py-3 text-end font-medium">{t("companies.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginated.map((company) => {
                    const approval = resolveCompanyApprovalStatus(company);
                    return (
                      <tr key={company.id} className="bg-background transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CompanyAvatar company={company} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{company.name}</p>
                              <ProvisioningBadge status={company.tenant_provisioning_status} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {company.business_type
                            ? t(`companyOnboarding.businessTypes.${company.business_type}`, {
                                defaultValue: company.business_type,
                              })
                            : dash}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {company.industry
                            ? t(`companyOnboarding.industries.${company.industry}`, {
                                defaultValue: company.industry,
                              })
                            : dash}
                        </td>
                        <td className="px-4 py-3">
                          <ApprovalBadge company={company} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {labelOrDash(company.subscription_plan, dash)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {labelOrDash(company.contact_person, dash)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                          {labelOrDash(company.contact_email, dash)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                          {labelOrDash(company.contact_phone, dash)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {labelOrDash(formatCompanyLocation(company), dash)}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                          {formatDate(company.approval_requested_at ?? company.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                          {formatDate(company.updated_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canCommercial && (approval === "pending" || approval === "rejected") ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={t("companies.approval.review")}
                                onClick={() => setReviewCompany(company)}
                              >
                                <ShieldCheck className="size-3.5 text-amber-700" />
                              </Button>
                            ) : null}
                            {canCommercial && approval === "approved" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={t("companies.features.title")}
                                onClick={() => setFeaturesCompany(company)}
                              >
                                <KeyRound className="size-3.5 text-primary" />
                              </Button>
                            ) : null}
                            {canEdit && company.tenant_provisioning_status === "failed" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={retryProvisioning.isPending}
                                title={t("companies.provisioning.retry")}
                                onClick={() =>
                                  retryProvisioning.mutate(company.id, {
                                    onError: (retryError) => {
                                      console.error(retryError.message);
                                    },
                                  })
                                }
                              >
                                <RefreshCw
                                  className={cn(
                                    "size-3.5 text-amber-600",
                                    retryProvisioning.isPending && "animate-spin",
                                  )}
                                />
                              </Button>
                            ) : null}
                            {canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditCompany(company)}
                                title={t("buttons.edit")}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setPendingDelete(company)}
                                title={t("buttons.delete")}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("companies.pagination.pageInfo", {
                  page: safePage,
                  totalPages,
                  total: filtered.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={safePage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {t("companies.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  {t("companies.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <CompanyOnboardingWizard
        open={createOpen}
        mode="admin_add"
        onOpenChange={setCreateOpen}
      />

      {editCompany ? (
        <CompanyModal
          open={Boolean(editCompany)}
          company={editCompany}
          onClose={() => setEditCompany(null)}
        />
      ) : null}

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

      <DeleteDialog
        open={Boolean(pendingDelete)}
        title={t("companies.deleteTitle", { name: pendingDelete?.name })}
        description={t("companies.deleteDescription")}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteCompany.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
        isPending={deleteCompany.isPending}
      />
    </div>
  );
}
