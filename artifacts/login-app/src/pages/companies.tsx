import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { CompanyModal } from "@/components/dashboard/company-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  useCompanies,
  useDeleteCompany,
} from "@/hooks/use-companies";
import type { Company, CompanyStatus } from "@/lib/types";

const PAGE_SIZE = 8;

function StatusBadge({ status }: { status: CompanyStatus }) {
  const { t } = useTranslation("common");
  const classes =
    status === "Active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status === "Suspended"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
        : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  return (
    <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${classes}`}>
      {t(`status.${status.toLowerCase()}`)}
    </span>
  );
}

export function CompaniesPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin } = useAuth();
  const { data: companies = [], isLoading, error } = useCompanies();
  const deleteCompany = useDeleteCompany();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; company?: Company | null }>({
    open: false,
  });
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);

  const planOptions = useMemo(
    () =>
      Array.from(
        new Set(companies.map((company) => company.subscription_plan).filter(Boolean)),
      ),
    [companies],
  );

  const filtered = useMemo(() => {
    return companies.filter((company) => {
      const matchesSearch =
        company.name.toLowerCase().includes(search.toLowerCase()) ||
        company.subscription_plan.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || company.status === statusFilter;
      const matchesPlan = planFilter === "all" || company.subscription_plan === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [companies, search, statusFilter, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCount = companies.filter((company) => company.status === "Active").length;
  const trialCount = companies.filter((company) => company.status === "Trial").length;
  const suspendedCount = companies.filter((company) => company.status === "Suspended").length;

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("companies.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("companies.noPermission")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("companies.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("companies.subtitle")}</p>
        </div>
        <Button
          onClick={() => setModal({ open: true, company: null })}
          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2"
        >
          <Plus className="w-4 h-4" /> {t("buttons.addCompany")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("companies.stats.total")}</span>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{companies.length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("companies.stats.active")}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{activeCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("companies.stats.trial")}</span>
            <Clock3 className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{trialCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("companies.stats.suspended")}</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{suspendedCount}</p>
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
              placeholder={t("companies.searchPlaceholder")}
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[170px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as "all" | CompanyStatus);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("companies.filters.allStatuses")}</option>
              <option value="Active">{t("status.active")}</option>
              <option value="Suspended">{t("status.suspended")}</option>
              <option value="Trial">{t("status.trial")}</option>
            </select>
          </div>

          <div className="min-w-[170px]">
            <select
              value={planFilter}
              onChange={(event) => {
                setPage(1);
                setPlanFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
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
            {companies.length === 0
              ? t("companies.emptyAll")
              : t("companies.emptySearch")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {paginated.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {company.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{company.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{company.subscription_plan}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {company.subscription_expires_at ? (
                      <span dir="ltr">
                        {format(new Date(company.subscription_expires_at), "MMM dd, yyyy")}
                      </span>
                    ) : (
                      t("companies.neverExpires")
                    )}
                  </div>
                  <StatusBadge status={company.status} />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => setModal({ open: true, company })}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => setPendingDelete(company)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
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
                  className="border-white/10"
                  disabled={safePage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  {t("companies.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {t("companies.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <CompanyModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        company={modal.company}
      />

      <DeleteDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteCompany.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
        isPending={deleteCompany.isPending}
        itemName={t("companies.item")}
      />
    </div>
  );
}
