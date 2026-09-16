import { useEffect, useMemo, useState } from "react";
import { Code2, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RoleFormDialog, type RoleDialogMode } from "@/components/roles/role-form-dialog";
import type { RoleFormValues } from "@/components/roles/role-form-fields";
import { RolesListSkeleton, RolesListTable } from "@/components/roles/roles-list-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
import { useRoleListCounts } from "@/hooks/use-role-list-counts";
import {
  fetchRolePermissionCodes,
  useAuthUser,
  useCreateRole,
  useDeleteRole,
  useHasPermission,
  usePermissionCatalog,
  useRoles,
  useUpdateRole,
  type RoleRecord,
} from "@/hooks/use-rbac";
import { filterPermissionsAvailableForCompany } from "@/lib/billing/feature-definition-permissions";
import { useDebouncedValue } from "@/lib/customers-list/use-debounced-value";
import { filterDelegablePermissionRecords } from "@/lib/rbac/tenant-role-management";
import {
  applyRolesListQuery,
  canMutateRoleFromList,
  isPlatformSuperAdminRole,
  listActionsForRole,
  presentRoleTypeFilters,
  scopeRolesToWorkspace,
  summarizeWorkspaceRoles,
  type RoleSortKey,
  type RoleTypeFilter,
} from "@/lib/rbac/roles-list";
import { useCompanyFeaturePermissionGate } from "@/hooks/billing/use-feature-definition-permissions";

const EMPTY_FORM: RoleFormValues = {
  name: "",
  description: "",
  permissions: [],
};

export function RolesPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { isSuperAdmin, hasPermission, profile } = useAuthUser();
  const companyGate = useCompanyFeaturePermissionGate(profile?.company_id ?? null);
  const { developerMode, setDeveloperMode } = useRbacDeveloperMode();
  const rolesQuery = useRoles();
  const { data: roles = [], isLoading, isError, refetch, isFetching } = rolesQuery;
  const { data: permissionsCatalog = [] } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const canCreateRoles = useHasPermission("roles.create");
  const canEditRoles = useHasPermission("roles.edit");
  const canDeleteRoles = useHasPermission("roles.delete");
  const canViewRoles = useHasPermission("roles.view");
  const direction = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("ar") ? "rtl" : "ltr";

  const permissions = useMemo(() => {
    const delegable = filterDelegablePermissionRecords(
      permissionsCatalog,
      hasPermission,
      isSuperAdmin,
    );
    return filterPermissionsAvailableForCompany(delegable, {
      isSuperAdmin,
      featurePermissions: companyGate.featurePermissions,
      isFeatureEnabled: companyGate.isFeatureEnabled,
    });
  }, [
    permissionsCatalog,
    hasPermission,
    isSuperAdmin,
    companyGate.featurePermissions,
    companyGate.isFeatureEnabled,
  ]);

  const workspaceRoles = useMemo(
    () => scopeRolesToWorkspace(roles, profile?.company_id ?? null),
    [roles, profile?.company_id],
  );
  const summary = useMemo(() => summarizeWorkspaceRoles(workspaceRoles), [workspaceRoles]);
  const typeFilterOptions = useMemo(
    () => presentRoleTypeFilters(workspaceRoles),
    [workspaceRoles],
  );
  const workspaceRoleIds = useMemo(
    () => workspaceRoles.map((role) => role.id),
    [workspaceRoles],
  );
  const countsQuery = useRoleListCounts(workspaceRoleIds);
  const counts = countsQuery.data;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<RoleTypeFilter>("ALL");
  const [sortKey, setSortKey] = useState<RoleSortKey>("updated_at");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, sortKey]);

  useEffect(() => {
    if (!typeFilterOptions.includes(typeFilter)) {
      setTypeFilter("ALL");
    }
  }, [typeFilter, typeFilterOptions]);

  const listQuery = useMemo(
    () =>
      applyRolesListQuery(workspaceRoles, {
        search: debouncedSearch,
        typeFilter,
        sortKey,
        sortDirection: sortKey === "name" ? "asc" : "desc",
        page,
        counts: {
          permissionCountByRoleId: counts?.permissionCountByRoleId,
          userCountByRoleId: counts?.userCountByRoleId,
        },
      }),
    [workspaceRoles, debouncedSearch, typeFilter, sortKey, page, counts],
  );

  useEffect(() => {
    if (page !== listQuery.page) setPage(listQuery.page);
  }, [page, listQuery.page]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<RoleDialogMode>("create");
  const [dialogForm, setDialogForm] = useState<RoleFormValues>(EMPTY_FORM);
  const [dialogPermissionsLoading, setDialogPermissionsLoading] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    roleId: string | null;
    roleName: string;
    userCount: number | null;
  }>({ open: false, roleId: null, roleName: "", userCount: null });

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogForm(EMPTY_FORM);
    setDialogPermissionsLoading(false);
    setDialogMode("create");
  };

  const loadRoleCodes = async (role: RoleRecord, mode: Exclude<RoleDialogMode, "create">) => {
    setDialogMode(mode);
    setDialogOpen(true);
    setDialogPermissionsLoading(true);
    setDialogForm({
      id: role.id,
      name: role.name ?? "",
      description: role.description ?? "",
      permissions: [],
    });
    try {
      const permissionCodes = await fetchRolePermissionCodes(role.id);
      const nextCodes =
        mode === "view" || isSuperAdmin
          ? permissionCodes
          : permissionCodes.filter((code) => hasPermission(code));
      setDialogForm({
        id: role.id,
        name: role.name ?? "",
        description: role.description ?? "",
        permissions: nextCodes,
      });
    } finally {
      setDialogPermissionsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openViewDialog = (role: RoleRecord) => {
    void loadRoleCodes(role, "view");
  };

  const openEditDialog = (role: RoleRecord) => {
    if (!canMutateRoleFromList(role) || isPlatformSuperAdminRole(role)) {
      void loadRoleCodes(role, "view");
      return;
    }
    void loadRoleCodes(role, "edit");
  };

  const resolveRoleMutationError = (message: string) => {
    switch (message) {
      case "ROLE_NAME_ALREADY_EXISTS":
        return t("roles.toast.nameAlreadyExists");
      case "ROLE_PROTECTED_READ_ONLY":
        return t("roles.toast.protectedReadOnly");
      case "ROLE_NOT_FOUND":
        return t("roles.toast.notFound");
      case "ROLE_NAME_REQUIRED":
      case "ROLE_ID_REQUIRED":
        return t("roles.toast.invalidRequest");
      default:
        return message;
    }
  };

  const handleCreate = () => {
    createRole.mutate(
      {
        name: dialogForm.name.trim(),
        description: dialogForm.description.trim(),
        permissions: dialogForm.permissions,
      },
      {
        onSuccess: () => {
          closeDialog();
          toast({
            title: t("roles.toast.createSuccessTitle"),
            description: t("roles.toast.createSuccessDescription", { name: dialogForm.name.trim() }),
          });
        },
        onError: (error) => {
          toast({
            title: t("roles.toast.createFailedTitle"),
            description: resolveRoleMutationError(error.message),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleEdit = () => {
    if (!dialogForm?.id || dialogMode !== "edit") return;
    const existing = workspaceRoles.find((role) => role.id === dialogForm.id);
    if (!existing || !canMutateRoleFromList(existing) || isPlatformSuperAdminRole(existing)) {
      return;
    }
    updateRole.mutate(
      {
        id: dialogForm.id,
        name: dialogForm.name.trim(),
        description: dialogForm.description.trim(),
        permissions: dialogForm.permissions,
      },
      {
        onSuccess: () => {
          closeDialog();
          toast({
            title: t("roles.toast.updateSuccessTitle"),
            description: t("roles.toast.updateSuccessDescription", { name: dialogForm.name.trim() }),
          });
        },
        onError: (error) => {
          toast({
            title: t("roles.toast.updateFailedTitle"),
            description: resolveRoleMutationError(error.message),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteDialog.roleId) return;
    const roleId = deleteDialog.roleId;
    const roleName = deleteDialog.roleName;
    deleteRole.mutate(roleId, {
      onSuccess: () => {
        toast({
          title: t("roles.toast.deleteSuccessTitle"),
          description: t("roles.toast.deleteSuccessDescription", { name: roleName }),
        });
      },
      onError: (error) => {
        toast({
          title: t("roles.toast.deleteFailedTitle"),
          description: resolveRoleMutationError(error.message),
          variant: "destructive",
        });
      },
    });
    setDeleteDialog({ open: false, roleId: null, roleName: "", userCount: null });
  };

  const tableRows = listQuery.items.map((role) => ({
    role,
    permissionCount: counts?.permissionCountByRoleId[role.id] ?? null,
    userCount: counts?.userCountByRoleId[role.id] ?? null,
    actions: listActionsForRole(role, {
      canView: canViewRoles,
      canEdit: canEditRoles,
      canDelete: canDeleteRoles,
    }),
  }));

  const metrics = [
    summary.platform > 0
      ? { key: "system", label: t("roles.list.metrics.system"), value: summary.platform }
      : null,
    summary.default > 0
      ? { key: "default", label: t("roles.list.metrics.default"), value: summary.default }
      : null,
    { key: "custom", label: t("roles.list.metrics.custom"), value: summary.custom },
    counts?.assignedUserTotal != null
      ? {
          key: "assigned",
          label: t("roles.list.metrics.assignedUsers"),
          value: counts.assignedUserTotal,
        }
      : null,
  ].filter((card): card is { key: string; label: string; value: number } => card != null);

  const customFilterEmpty = typeFilter === "CUSTOM" && listQuery.total === 0 && !debouncedSearch.trim();
  const searchEmpty = listQuery.total === 0 && Boolean(debouncedSearch.trim() || typeFilter !== "ALL");
  const dialogReadOnly = dialogMode === "view";
  const dialogPermissions = dialogReadOnly ? permissionsCatalog : permissions;

  return (
    <div className="space-y-4" data-testid="roles-list-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("roles.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("roles.subtitle")}</p>
        </div>
        {canCreateRoles ? (
          <Button onClick={openCreateDialog} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            {t("roles.createRole")}
          </Button>
        ) : null}
      </div>

      {metrics.length > 0 ? (
        <div className={`grid gap-2 sm:grid-cols-2 ${metrics.length > 2 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          {metrics.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm"
            >
              <p className="text-[11px] font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight" dir="ltr">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/60 p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="roles-list-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("roles.list.searchPlaceholder")}
              aria-label={t("roles.list.searchPlaceholder")}
              dir="auto"
              className="ps-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as RoleTypeFilter)}
            >
              <SelectTrigger className="w-[11.5rem]" data-testid="roles-list-type-filter" aria-label={t("roles.list.typeFilterLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeFilterOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "ALL"
                      ? t("roles.list.typeFilterAll")
                      : option === "PLATFORM"
                        ? t("roles.list.typeFilterPlatform")
                        : option === "DEFAULT"
                          ? t("roles.list.typeFilterDefault")
                          : t("roles.list.typeFilterCustom")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as RoleSortKey)}>
              <SelectTrigger className="w-[11.5rem]" data-testid="roles-list-sort" aria-label={t("roles.list.sortLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_at">{t("roles.list.sortUpdated")}</SelectItem>
                <SelectItem value="name">{t("roles.list.sortName")}</SelectItem>
                <SelectItem value="permission_count">{t("roles.list.sortPermissions")}</SelectItem>
                <SelectItem value="user_count">{t("roles.list.sortUsers")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1">
              <Code2 className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="text-xs text-muted-foreground">{t("roles.permissions.developerMode")}</span>
              <Switch
                checked={developerMode}
                onCheckedChange={setDeveloperMode}
                aria-label={t("roles.permissions.developerMode")}
              />
            </div>
          </div>
        </div>

        {isError ? (
          <div className="p-4" data-testid="roles-list-error">
            <Alert variant="destructive">
              <AlertTitle>{t("roles.list.loadError")}</AlertTitle>
              <AlertDescription className="mt-2 flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                  {t("roles.list.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <RolesListSkeleton />
        ) : customFilterEmpty || (summary.custom === 0 && typeFilter === "ALL" && listQuery.total === 0) ? (
          <div className="px-6 py-12 text-center" data-testid="roles-list-empty-custom">
            <p className="text-sm font-medium text-foreground">{t("roles.emptyCustomTitle")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("roles.emptyCustomDescription")}</p>
            {canCreateRoles ? (
              <Button onClick={openCreateDialog} className="mt-5 gap-2">
                <Plus className="h-4 w-4" />
                {t("roles.createRole")}
              </Button>
            ) : null}
          </div>
        ) : searchEmpty ? (
          <div className="px-6 py-12 text-center" data-testid="roles-list-empty-search">
            <p className="text-sm font-medium">{t("roles.list.noSearchResults")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("roles.list.noSearchResultsDescription")}</p>
          </div>
        ) : (
          <>
            {summary.custom === 0 && typeFilter === "ALL" ? (
              <div className="border-b border-border/60 bg-muted/20 px-4 py-3 text-sm">
                <p className="font-medium">{t("roles.emptyCustomTitle")}</p>
                <p className="mt-1 text-muted-foreground">{t("roles.emptyCustomDescription")}</p>
                {canCreateRoles ? (
                  <Button variant="outline" size="sm" onClick={openCreateDialog} className="mt-3 gap-2">
                    <Plus className="h-4 w-4" />
                    {t("roles.createRole")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <RolesListTable
              rows={tableRows}
              onView={openViewDialog}
              onEdit={openEditDialog}
              onDelete={(role) =>
                setDeleteDialog({
                  open: true,
                  roleId: role.id,
                  roleName: role.name ?? t("roles.noDescription"),
                  userCount: counts?.userCountByRoleId[role.id] ?? null,
                })
              }
              onOpenPermissions={(role) => {
                if (canEditRoles && canMutateRoleFromList(role)) openEditDialog(role);
                else openViewDialog(role);
              }}
            />
            <ListPagination
              className="border-t border-border/60 px-3 py-3"
              page={listQuery.page}
              totalPages={listQuery.totalPages}
              total={listQuery.total}
              summaryLabel={t("roles.list.summaryRange", {
                from: listQuery.from,
                to: listQuery.to,
                total: listQuery.total,
              })}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(listQuery.totalPages, current + 1))}
            />
          </>
        )}
      </div>

      <RoleFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
        mode={dialogMode}
        readOnly={dialogReadOnly}
        values={dialogForm}
        onChange={setDialogForm}
        permissions={dialogPermissions}
        permissionsLoading={dialogPermissionsLoading}
        submitting={createRole.isPending || updateRole.isPending}
        onSubmit={dialogMode === "create" ? handleCreate : handleEdit}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((current) => ({ ...current, open }))}
      >
        <AlertDialogContent dir={direction} className="border-border bg-card text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.confirm.deleteTitle", { role: deleteDialog.roleName })}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("roles.confirm.deleteDescription")}
              {deleteDialog.userCount != null ? (
                <span className="mt-2 block" dir="ltr">
                  {t("roles.confirm.deleteAssigned", { count: deleteDialog.userCount })}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {t("buttons.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default RolesPage;
