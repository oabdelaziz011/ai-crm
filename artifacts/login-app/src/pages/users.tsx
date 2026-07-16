import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  Filter,
  Loader2,
  Mail,
  Plus,
  Search,
  Shield,
  UserRound,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCompanies } from "@/hooks/use-companies";
import {
  useCreateManagedUser,
  useManagedUsers,
  useResetManagedUserPassword,
  useUpdateManagedUser,
} from "@/hooks/use-users-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const PAGE_SIZE = 8;

type StatusFilter = "all" | "active" | "inactive";

type CreateUserForm = {
  email: string;
  fullName: string;
  companyId: string | null;
  isActive: boolean;
};

function getRoleNames(roles: Array<{ name: string | null }>) {
  return roles
    .map((role) => (role.name ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function UsersPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, roles, hasPermission } = useAuthUser();
  const { company } = useAuth();

  const roleNames = getRoleNames(roles);
  const isCompanyAdmin =
    roleNames.includes("admin") ||
    roleNames.includes("company admin") ||
    roleNames.includes("company_admin") ||
    roleNames.includes("owner") ||
    hasPermission("users.edit");

  const canManageUsers = isSuperAdmin || isCompanyAdmin;

  const { data: users = [], isLoading, error } = useManagedUsers();
  const { data: companies = [] } = useCompanies(isSuperAdmin);
  const createUser = useCreateManagedUser();
  const updateUser = useUpdateManagedUser();
  const resetPassword = useResetManagedUserPassword();
  const [companyDrafts, setCompanyDrafts] = useState<Record<string, string | null>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    fullName: "",
    companyId: company?.id ?? null,
    isActive: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    userId: string | null;
    nextStatus: boolean;
    userName: string;
  }>({ open: false, userId: null, nextStatus: true, userName: "" });

  const companyOptions = useMemo(() => {
    if (isSuperAdmin) return companies;
    return company ? [company] : [];
  }, [isSuperAdmin, companies, company]);

  const visibleUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        (user.full_name ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.is_active : !user.is_active);

      const matchesCompany =
        companyFilter === "all" || user.company_id === companyFilter;

      if (isSuperAdmin) {
        return matchesSearch && matchesStatus && matchesCompany;
      }

      return (
        user.company_id === (company?.id ?? null) &&
        matchesSearch &&
        matchesStatus &&
        matchesCompany
      );
    });
  }, [users, search, statusFilter, companyFilter, isSuperAdmin, company]);

  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = visibleUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCount = visibleUsers.filter((user) => user.is_active).length;
  const inactiveCount = visibleUsers.length - activeCount;

  const companyById = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((entry) => map.set(entry.id, entry.name));
    return map;
  }, [companies]);

  const handleCreateUser = () => {
    setCreateError(null);

    if (!createForm.email.trim()) {
      setCreateError(t("users.form.emailRequired"));
      return;
    }
    if (!createForm.fullName.trim()) {
      setCreateError(t("users.form.nameRequired"));
      return;
    }

    const fallbackCompanyId = isSuperAdmin ? createForm.companyId : (company?.id ?? null);

    createUser.mutate(
      {
        email: createForm.email,
        fullName: createForm.fullName,
        companyId: fallbackCompanyId,
        isActive: createForm.isActive,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setCreateForm({
            email: "",
            fullName: "",
            companyId: company?.id ?? null,
            isActive: true,
          });
        },
        onError: (mutationError) => setCreateError(mutationError.message),
      },
    );
  };

  if (!canManageUsers) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("users.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("users.noPermission")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("users.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("users.subtitle")}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2"
        >
          <Plus className="w-4 h-4" /> {t("users.addUser")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("users.stats.total")}</span>
            <UserRound className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{visibleUsers.length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("users.stats.active")}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{activeCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("users.stats.inactive")}</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{inactiveCount}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("users.stats.adminMode")}</span>
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <p className="text-sm font-medium mt-3">
            {isSuperAdmin ? t("users.superAdmin") : t("users.companyAdmin")}
          </p>
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
              placeholder={t("users.searchPlaceholder")}
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[170px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as StatusFilter);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("users.filters.allStatuses")}</option>
              <option value="active">{t("users.status.active")}</option>
              <option value="inactive">{t("users.status.inactive")}</option>
            </select>
          </div>

          <div className="min-w-[170px]">
            <select
              value={companyFilter}
              onChange={(event) => {
                setPage(1);
                setCompanyFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
              disabled={!isSuperAdmin}
            >
              <option value="all">{t("users.filters.allCompanies")}</option>
              {companyOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
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
            {t("users.empty")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {paginated.map((user) => {
                const companyName = user.company_id
                  ? (companyById.get(user.company_id) ?? t("users.noCompany"))
                  : t("users.noCompany");
                const selectedCompany =
                  companyDrafts[user.id] !== undefined
                    ? companyDrafts[user.id]
                    : user.company_id;

                return (
                  <div
                    key={user.id}
                    className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {(user.full_name ?? user.email).charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.full_name ?? t("users.unnamed")}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>

                    {isSuperAdmin ? (
                      <div className="hidden lg:flex items-center gap-2">
                        <select
                          value={selectedCompany ?? ""}
                          onChange={(event) =>
                            setCompanyDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value || null,
                            }))
                          }
                          className="rounded-lg bg-background/50 border border-white/10 px-2 py-1 text-xs outline-none"
                        >
                          <option value="">{t("users.form.noCompany")}</option>
                          {companyOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/10 text-xs"
                          disabled={updateUser.isPending || selectedCompany === user.company_id}
                          onClick={() =>
                            updateUser.mutate({
                              id: user.id,
                              company_id: selectedCompany,
                            })
                          }
                        >
                          {t("users.actions.saveCompany")}
                        </Button>
                      </div>
                    ) : (
                      <p className="hidden lg:block text-xs text-muted-foreground truncate max-w-36">
                        {companyName}
                      </p>
                    )}

                    <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {user.created_at ? (
                        <span dir="ltr">{format(new Date(user.created_at), "MMM dd, yyyy")}</span>
                      ) : (
                        "-"
                      )}
                    </div>

                    <span
                      className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                        user.is_active
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {user.is_active ? t("users.status.active") : t("users.status.inactive")}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-xs"
                        disabled={resetPassword.isPending}
                        onClick={() => resetPassword.mutate(user.email)}
                      >
                        {resetPassword.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Mail className="w-3.5 h-3.5" />
                        )}
                        {t("users.actions.resetPassword")}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-xs"
                        disabled={updateUser.isPending}
                        onClick={() =>
                          setStatusDialog({
                            open: true,
                            userId: user.id,
                            nextStatus: !user.is_active,
                            userName: user.full_name ?? user.email,
                          })
                        }
                      >
                        {user.is_active
                          ? t("users.actions.deactivate")
                          : t("users.actions.activate")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("users.pagination.pageInfo", {
                  page: safePage,
                  totalPages,
                  total: visibleUsers.length,
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
                  {t("users.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {t("users.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-white/10 text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>{t("users.createTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {createError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {createError}
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.fullName")}</label>
              <Input
                value={createForm.fullName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder={t("users.form.fullNamePlaceholder")}
                className="bg-background/50 border-white/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.email")}</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder={t("users.form.emailPlaceholder")}
                className="bg-background/50 border-white/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.company")}</label>
              <select
                value={createForm.companyId ?? ""}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    companyId: event.target.value || null,
                  }))
                }
                disabled={!isSuperAdmin}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
              >
                <option value="">{t("users.form.noCompany")}</option>
                {companyOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              {t("users.form.activeOnCreate")}
            </label>

            <p className="text-xs text-muted-foreground">{t("users.form.inviteNote")}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => setCreateOpen(false)}
            >
              {t("buttons.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30"
              onClick={handleCreateUser}
              disabled={createUser.isPending}
            >
              {createUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("users.actions.create")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={statusDialog.open}
        onOpenChange={(open) =>
          setStatusDialog((current) => ({ ...current, open }))
        }
      >
        <AlertDialogContent className="bg-card border-white/10 text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDialog.nextStatus
                ? t("users.confirm.activateTitle", { user: statusDialog.userName })
                : t("users.confirm.deactivateTitle", { user: statusDialog.userName })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {statusDialog.nextStatus
                ? t("users.confirm.activateDescription")
                : t("users.confirm.deactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">
              {t("buttons.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30"
              onClick={() => {
                if (!statusDialog.userId) return;
                updateUser.mutate({
                  id: statusDialog.userId,
                  is_active: statusDialog.nextStatus,
                });
                setStatusDialog({ open: false, userId: null, nextStatus: true, userName: "" });
              }}
            >
              {statusDialog.nextStatus
                ? t("users.actions.activate")
                : t("users.actions.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
