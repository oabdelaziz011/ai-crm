import { useMemo, useState, useEffect } from "react";
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
  Pencil,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCompanyAssignableRoles } from "@/hooks/use-company-assignable-roles";
import { canViewCompanies } from "@/lib/companies/company-permissions";
import { canManageUsers, canViewUsers } from "@/lib/users/user-permissions";
import { useCompanies } from "@/hooks/use-companies";
import {
  useCreateManagedUser,
  useManagedUserRoleMap,
  useManagedUsers,
  useResetManagedUserPassword,
  useUpdateManagedUser,
} from "@/hooks/use-users-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  roleId: string;
  isActive: boolean;
};

type EditUserForm = {
  id: string;
  email: string;
  fullName: string;
  companyId: string | null;
  roleId: string;
  isActive: boolean;
};

export function UsersPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const { company } = useAuth();

  const canView = canViewUsers(hasPermission, isSuperAdmin);
  const canManage = canManageUsers(hasPermission, isSuperAdmin);
  const canPickCompany = isSuperAdmin || canViewCompanies(hasPermission, isSuperAdmin);

  const resolveCompanyId = (formCompanyId: string | null) =>
    canPickCompany ? formCompanyId : (company?.id ?? null);

  const { data: users = [], isLoading, error } = useManagedUsers();
  const { data: userRoleMap = {} } = useManagedUserRoleMap();
  const { data: companies = [] } = useCompanies(canPickCompany);
  const createUser = useCreateManagedUser();
  const updateUser = useUpdateManagedUser();
  const resetPassword = useResetManagedUserPassword();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    fullName: "",
    companyId: company?.id ?? null,
    roleId: "",
    isActive: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditUserForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const createTargetCompanyId = resolveCompanyId(createForm.companyId);
  const {
    data: createRoles = [],
    isLoading: createRolesLoading,
    refetch: refetchCreateRoles,
  } = useCompanyAssignableRoles(createTargetCompanyId, createOpen);

  const editTargetCompanyId = editForm ? resolveCompanyId(editForm.companyId) : null;
  const {
    data: editRoles = [],
    isLoading: editRolesLoading,
    refetch: refetchEditRoles,
  } = useCompanyAssignableRoles(editTargetCompanyId, editOpen);

  const createTenantRoles = useMemo(
    () => createRoles.filter((role) => role.company_id === createTargetCompanyId),
    [createRoles, createTargetCompanyId],
  );
  const editTenantRoles = useMemo(
    () => editRoles.filter((role) => role.company_id === editTargetCompanyId),
    [editRoles, editTargetCompanyId],
  );
  const createCompanyHasNoRoles =
    Boolean(createTargetCompanyId) && !createRolesLoading && createTenantRoles.length === 0;
  const editCompanyHasNoRoles =
    Boolean(editTargetCompanyId) && !editRolesLoading && editTenantRoles.length === 0;

  useEffect(() => {
    if (createOpen) {
      void refetchCreateRoles();
    }
  }, [createOpen, createTargetCompanyId, refetchCreateRoles]);

  useEffect(() => {
    if (editOpen) {
      void refetchEditRoles();
    }
  }, [editOpen, editTargetCompanyId, refetchEditRoles]);

  useEffect(() => {
    if (!editOpen || !editForm?.roleId) {
      return;
    }
    const stillValid = editRoles.some((role) => role.id === editForm.roleId);
    if (!stillValid) {
      setEditForm((current) => (current ? { ...current, roleId: "" } : current));
    }
  }, [editOpen, editForm?.roleId, editRoles]);

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

  const createRoleSelectOptions = useMemo(
    () =>
      createRoles.map((role) => ({
        value: role.id,
        label: role.name ?? t("users.noRole"),
        description: role.description ?? undefined,
      })),
    [createRoles, t],
  );

  const editRoleSelectOptions = useMemo(
    () =>
      editRoles.map((role) => ({
        value: role.id,
        label: role.name ?? t("users.noRole"),
        description: role.description ?? undefined,
      })),
    [editRoles, t],
  );

  const openEditDialog = (user: (typeof users)[number]) => {
    const assignedRole = userRoleMap[user.id];
    setEditError(null);
    setEditForm({
      id: user.id,
      email: user.email,
      fullName: user.full_name ?? "",
      companyId: user.company_id,
      roleId: assignedRole?.roleId ?? "",
      isActive: user.is_active,
    });
    setEditOpen(true);
  };

  const handleCreateUser = () => {
    setCreateError(null);

    if (!createForm.fullName.trim()) {
      setCreateError(t("users.form.nameRequired"));
      return;
    }
    if (!createForm.email.trim()) {
      setCreateError(t("users.form.emailRequired"));
      return;
    }

    const companyId = resolveCompanyId(createForm.companyId);
    if (!companyId) {
      setCreateError(t("users.form.companyRequired"));
      return;
    }
    if (createCompanyHasNoRoles) {
      setCreateError(t("users.errors.company_has_no_roles"));
      return;
    }
    if (!createForm.roleId) {
      setCreateError(t("users.form.roleRequired"));
      return;
    }

    createUser.mutate(
      {
        email: createForm.email,
        fullName: createForm.fullName,
        companyId,
        roleId: createForm.roleId,
        isActive: createForm.isActive,
      },
      {
        onSuccess: () => {
          toast({
            title: t("users.success.inviteSentTitle"),
            description: t("users.success.inviteSentDescription"),
          });
          setCreateOpen(false);
          setCreateForm({
            email: "",
            fullName: "",
            companyId: company?.id ?? null,
            roleId: "",
            isActive: true,
          });
        },
        onError: (mutationError) => setCreateError(mutationError.message),
      },
    );
  };

  const handleEditUser = () => {
    if (!editForm) return;
    setEditError(null);

    if (!editForm.fullName.trim()) {
      setEditError(t("users.form.nameRequired"));
      return;
    }

    const companyId = resolveCompanyId(editForm.companyId);
    if (!companyId) {
      setEditError(t("users.form.companyRequired"));
      return;
    }
    if (editCompanyHasNoRoles) {
      setEditError(t("users.errors.company_has_no_roles"));
      return;
    }
    if (!editForm.roleId) {
      setEditError(t("users.form.roleRequired"));
      return;
    }

    updateUser.mutate(
      {
        id: editForm.id,
        full_name: editForm.fullName,
        company_id: companyId,
        is_active: editForm.isActive,
        roleId: editForm.roleId,
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          setEditForm(null);
        },
        onError: (mutationError) => setEditError(mutationError.message),
      },
    );
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("users.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("users.viewNoPermission")}</p>
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
        {canManage && (
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2"
        >
          <Plus className="w-4 h-4" /> {t("users.addUser")}
        </Button>
        )}
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
              disabled={!canPickCompany}
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
                const assignedRole = userRoleMap[user.id];

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

                    <p className="hidden lg:block text-xs text-muted-foreground truncate max-w-36">
                      {companyName}
                    </p>

                    <span className="hidden md:inline-flex text-xs font-mono px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary max-w-32 truncate">
                      {assignedRole?.roleName ?? t("users.noRole")}
                    </span>

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
                      {canManage && (
                      <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-xs"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {t("users.actions.edit")}
                      </Button>

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
                      </>
                      )}
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
                onChange={(event) => {
                  const nextCompanyId = event.target.value || null;
                  setCreateForm((current) => ({
                    ...current,
                    companyId: nextCompanyId,
                    roleId: "",
                  }));
                }}
                disabled={!canPickCompany}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
              >
                <option value="">{t("users.form.selectCompany")}</option>
                {companyOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.role")}</label>
              {createCompanyHasNoRoles && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {t("users.errors.company_has_no_roles")}
                </p>
              )}
              <SearchableSelect
                value={createForm.roleId}
                onValueChange={(roleId) =>
                  setCreateForm((current) => ({ ...current, roleId }))
                }
                options={createRoleSelectOptions}
                placeholder={t("users.form.rolePlaceholder")}
                searchPlaceholder={t("users.form.roleSearchPlaceholder")}
                emptyLabel={t("users.form.noRolesAvailable")}
                disabled={
                  !createTargetCompanyId ||
                  createRolesLoading ||
                  createCompanyHasNoRoles ||
                  createRoleSelectOptions.length === 0
                }
              />
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
              disabled={createUser.isPending || createCompanyHasNoRoles}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-white/10 text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>{t("users.editTitle")}</DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="space-y-4">
              {editError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {editError}
                </p>
              )}

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.fullName")}</label>
                <Input
                  value={editForm.fullName}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, fullName: event.target.value } : current,
                    )
                  }
                  placeholder={t("users.form.fullNamePlaceholder")}
                  className="bg-background/50 border-white/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.email")}</label>
                <Input
                  type="email"
                  value={editForm.email}
                  disabled
                  className="bg-background/50 border-white/10 opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.company")}</label>
                <select
                  value={editForm.companyId ?? ""}
                  onChange={(event) => {
                    const nextCompanyId = event.target.value || null;
                    setEditForm((current) =>
                      current
                        ? { ...current, companyId: nextCompanyId, roleId: "" }
                        : current,
                    );
                  }}
                  disabled={!canPickCompany}
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                >
                  <option value="">{t("users.form.selectCompany")}</option>
                  {companyOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.role")}</label>
                {editCompanyHasNoRoles && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    {t("users.errors.company_has_no_roles")}
                  </p>
                )}
                <SearchableSelect
                  value={editForm.roleId}
                  onValueChange={(roleId) =>
                    setEditForm((current) => (current ? { ...current, roleId } : current))
                  }
                  options={editRoleSelectOptions}
                  placeholder={t("users.form.rolePlaceholder")}
                  searchPlaceholder={t("users.form.roleSearchPlaceholder")}
                  emptyLabel={t("users.form.noRolesAvailable")}
                  disabled={
                    !editTargetCompanyId ||
                    editRolesLoading ||
                    editCompanyHasNoRoles ||
                    editRoleSelectOptions.length === 0
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, isActive: event.target.checked } : current,
                    )
                  }
                />
                {t("users.form.activeOnCreate")}
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => setEditOpen(false)}
            >
              {t("buttons.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30"
              onClick={handleEditUser}
              disabled={updateUser.isPending || !editForm || editCompanyHasNoRoles}
            >
              {updateUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("users.actions.save")
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
