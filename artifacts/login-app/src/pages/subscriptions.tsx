import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, CreditCard, Filter, Save, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { useCompanies, useUpdateCompany } from "@/hooks/use-companies";
import { usePlans } from "@/hooks/use-plans";
import type { BillingCycle, Company, SubscriptionStatus } from "@/lib/types";

const PAGE_SIZE = 8;

type SubscriptionDraft = {
  planId: string;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  expiresAt: string;
};

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const { t } = useTranslation("common");
  const classes =
    status === "active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status === "trialing"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : status === "past_due"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
          : "border-slate-500/30 bg-slate-500/10 text-slate-300";

  return (
    <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${classes}`}>
      {t(`subscriptions.status.${status}`)}
    </span>
  );
}

export function SubscriptionsPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin } = useAuth();
  const { data: companies = [], isLoading, error } = useCompanies();
  const { data: plans = [] } = usePlans(isSuperAdmin);
  const updateCompany = useUpdateCompany();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriptionStatus>("all");
  const [cycleFilter, setCycleFilter] = useState<"all" | BillingCycle>("all");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, SubscriptionDraft>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const nextDrafts: Record<string, SubscriptionDraft> = {};
    companies.forEach((company) => {
      nextDrafts[company.id] = {
        planId: company.plan_id ?? "",
        subscriptionStatus: company.subscription_status ?? "trialing",
        billingCycle: company.billing_cycle ?? "monthly",
        expiresAt: company.subscription_expires_at
          ? company.subscription_expires_at.slice(0, 10)
          : "",
      };
    });
    setDrafts(nextDrafts);
    setDirty({});
  }, [companies]);

  const filtered = useMemo(() => {
    return companies.filter((company) => {
      const planName = company.plan?.name ?? company.subscription_plan ?? "";
      const matchesSearch =
        company.name.toLowerCase().includes(search.toLowerCase()) ||
        planName.toLowerCase().includes(search.toLowerCase());
      const statusValue = company.subscription_status ?? "trialing";
      const cycleValue = company.billing_cycle ?? "monthly";
      const matchesStatus = statusFilter === "all" || statusValue === statusFilter;
      const matchesCycle = cycleFilter === "all" || cycleValue === cycleFilter;
      return matchesSearch && matchesStatus && matchesCycle;
    });
  }, [companies, search, statusFilter, cycleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCount = companies.filter((c) => (c.subscription_status ?? "trialing") === "active").length;
  const trialingCount = companies.filter((c) => (c.subscription_status ?? "trialing") === "trialing").length;
  const dueCount = companies.filter((c) => (c.subscription_status ?? "trialing") === "past_due").length;

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("subscriptions.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subscriptions.noPermission")}</p>
        </div>
      </div>
    );
  }

  const onDraftChange = (companyId: string, next: Partial<SubscriptionDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [companyId]: {
        ...prev[companyId],
        ...next,
      },
    }));
    setDirty((prev) => ({ ...prev, [companyId]: true }));
  };

  const saveCompanySubscription = (company: Company) => {
    const draft = drafts[company.id];
    if (!draft) return;

    const selectedPlan = plans.find((plan) => plan.id === draft.planId);
    updateCompany.mutate({
      id: company.id,
      values: {
        plan_id: draft.planId || null,
        subscription_plan: selectedPlan?.name ?? company.subscription_plan,
        subscription_status: draft.subscriptionStatus,
        billing_cycle: draft.billingCycle,
        subscription_expires_at: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
      },
    }, {
      onSuccess: () => {
        setDirty((prev) => ({ ...prev, [company.id]: false }));
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("subscriptions.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subscriptions.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("subscriptions.stats.total")}</span>
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{companies.length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("subscriptions.stats.active")}</span>
            <CreditCard className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{activeCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("subscriptions.stats.trialing")}</span>
            <CalendarDays className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{trialingCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("subscriptions.stats.pastDue")}</span>
            <CalendarDays className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{dueCount}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error.message}
        </div>
      )}

      <div className="bg-card/40 border border-white/5 rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="p-5 border-b border-white/5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder={t("subscriptions.searchPlaceholder")}
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[170px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as "all" | SubscriptionStatus);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("subscriptions.filters.allStatuses")}</option>
              <option value="active">{t("subscriptions.status.active")}</option>
              <option value="trialing">{t("subscriptions.status.trialing")}</option>
              <option value="past_due">{t("subscriptions.status.past_due")}</option>
              <option value="canceled">{t("subscriptions.status.canceled")}</option>
              <option value="expired">{t("subscriptions.status.expired")}</option>
            </select>
          </div>

          <div className="min-w-[170px]">
            <select
              value={cycleFilter}
              onChange={(event) => {
                setPage(1);
                setCycleFilter(event.target.value as "all" | BillingCycle);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("subscriptions.filters.allCycles")}</option>
              <option value="monthly">{t("subscriptions.billingCycle.monthly")}</option>
              <option value="yearly">{t("subscriptions.billingCycle.yearly")}</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center px-6 py-4 gap-4">
                <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
                  <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {t("subscriptions.empty")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {paginated.map((company) => {
                const draft = drafts[company.id];
                const currentPlanName = company.plan?.name ?? company.subscription_plan;

                return (
                  <div
                    key={company.id}
                    className="grid grid-cols-1 lg:grid-cols-12 px-6 py-4 hover:bg-white/[0.02] transition-colors gap-3 lg:items-center"
                  >
                    <div className="lg:col-span-3 min-w-0">
                      <p className="text-sm font-medium truncate">{company.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{currentPlanName}</p>
                    </div>

                    <div className="lg:col-span-2">
                      <select
                        value={draft?.planId ?? ""}
                        onChange={(event) => onDraftChange(company.id, { planId: event.target.value })}
                        className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
                      >
                        <option value="">{t("subscriptions.plan.unassigned")}</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-2">
                      <select
                        value={draft?.subscriptionStatus ?? "trialing"}
                        onChange={(event) => onDraftChange(company.id, { subscriptionStatus: event.target.value as SubscriptionStatus })}
                        className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
                      >
                        <option value="active">{t("subscriptions.status.active")}</option>
                        <option value="trialing">{t("subscriptions.status.trialing")}</option>
                        <option value="past_due">{t("subscriptions.status.past_due")}</option>
                        <option value="canceled">{t("subscriptions.status.canceled")}</option>
                        <option value="expired">{t("subscriptions.status.expired")}</option>
                      </select>
                    </div>

                    <div className="lg:col-span-2">
                      <select
                        value={draft?.billingCycle ?? "monthly"}
                        onChange={(event) => onDraftChange(company.id, { billingCycle: event.target.value as BillingCycle })}
                        className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
                      >
                        <option value="monthly">{t("subscriptions.billingCycle.monthly")}</option>
                        <option value="yearly">{t("subscriptions.billingCycle.yearly")}</option>
                      </select>
                    </div>

                    <div className="lg:col-span-2">
                      <input
                        type="date"
                        value={draft?.expiresAt ?? ""}
                        onChange={(event) => onDraftChange(company.id, { expiresAt: event.target.value })}
                        className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>

                    <div className="lg:col-span-1 flex lg:justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 gap-1"
                        disabled={!dirty[company.id] || updateCompany.isPending}
                        onClick={() => saveCompanySubscription(company)}
                      >
                        <Save className="w-3.5 h-3.5" />
                        {t("subscriptions.actions.save")}
                      </Button>
                    </div>

                    <div className="lg:col-span-12 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">
                        {company.subscription_expires_at
                          ? format(new Date(company.subscription_expires_at), "MMM dd, yyyy")
                          : t("subscriptions.neverExpires")}
                      </span>
                      <StatusBadge status={draft?.subscriptionStatus ?? "trialing"} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("subscriptions.pagination.pageInfo", {
                  page: safePage,
                  totalPages,
                  total: filtered.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  {t("subscriptions.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {t("subscriptions.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
