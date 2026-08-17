import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Code2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RoleFormDialog } from "@/components/roles/role-form-dialog";
import type { RoleFormValues } from "@/components/roles/role-form-fields";
import { PermissionBadge } from "@/components/rbac/permission-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
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
import { usePermissionCatalogLanguageVersion } from "@/lib/rbac/permission-display-i18n";
import {
  filterDelegablePermissionRecords,
  filterRolesForTenantManagement,
} from "@/lib/rbac/tenant-role-management";
import { filterPermissionsAvailableForCompany } from "@/lib/billing/feature-definition-permissions";
import { useCompanyFeaturePermissionGate } from "@/hooks/billing/use-feature-definition-permissions";

const EMPTY_FORM: RoleFormValues = {
  name: "",
  description: "",
  permissions: [],
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function RolePermissionDetails({
  roleId,
  expanded,
  permissionCatalog,
}: {
  roleId: string;
  expanded: boolean;
  permissionCatalog: ReturnType<typeof usePermissionCatalog>["data"];
}) {
  const { t } = useTranslation("common");
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  usePermissionCatalogLanguageVersion();

  const permissionByCode = useMemo(() => {
    const map = new Map<string, NonNullable<typeof permissionCatalog>[number]>();
    (permissionCatalog ?? []).forEach((p) => {
      if (p.code) map.set(p.code, p);
    });
    return map;
  }, [permissionCatalog]);

  useEffect(() => {
    if (!expanded || loaded) return;
    let cancelled = false;
    setLoading(true);
    void fetchRolePermissionCodes(roleId)
      .then((result) => {
        if (!cancelled) {
          setCodes(result);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, loaded, roleId]);

  if (!expanded) return null;

  if (loading) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">{t("permissions.loading")}</p>
    );
  }

  if (codes.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">{t("roles.roleDetails.noPermissions")}</p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
      {codes.map((code) => (
        <PermissionBadge
          key={code}
          code={code}
          permission={permissionByCode.get(code) ?? null}
          title
        />
      ))}
    </div>
  );
}


export function RolesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { isSuperAdmin, hasPermission, profile } = useAuthUser();
  const companyGate = useCompanyFeaturePermissionGate(profile?.company_id ?? null);
  const { developerMode, setDeveloperMode } = useRbacDeveloperMode();
  const { data: roles = [], isLoading } = useRoles();
  const { data: permissionsCatalog = [] } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const canCreateRoles = useHasPermission("roles.create");
  const canEditRoles = useHasPermission("roles.edit");
  const canDeleteRoles = useHasPermission("roles.delete");

  // Non-Super-Admins: actor-delegable ∩ company-available feature permissions.
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

  // Tenant Role Management lists CUSTOM roles only (no fixed Admin/Manager/Employee catalog).
  const managedRoles = useMemo(
    () => filterRolesForTenantManagement(roles, { includeProtected: isSuperAdmin }),
    [roles, isSuperAdmin],
  );

  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormValues>(EMPTY_FORM);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<RoleFormValues | null>(null);
  const [editPermissionsLoading, setEditPermissionsLoading] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    roleId: string | null;
    roleName: string;
  }>({ open: false, roleId: null, roleName: "" });

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setCreateForm(EMPTY_FORM);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditForm(null);
    setEditPermissionsLoading(false);
  };

  const openCreateDialog = () => {
    setCreateForm(EMPTY_FORM);
    setCreateDialogOpen(true);
  };

  const openEditDialog = async (role: RoleRecord) => {
    setEditDialogOpen(true);
    setEditPermissionsLoading(true);
    setEditForm({
      id: role.id,
      name: role.name ?? "",
      description: role.description ?? "",
      permissions: [],
    });

    try {
      const permissionCodes = await fetchRolePermissionCodes(role.id);
      setEditForm({
        id: role.id,
        name: role.name ?? "",
        description: role.description ?? "",
        // Keep only permissions this actor may still delegate (DB also enforces).
        permissions: isSuperAdmin
          ? permissionCodes
          : permissionCodes.filter((code) => hasPermission(code)),
      });
    } finally {
      setEditPermissionsLoading(false);
    }
  };

  const handleCreate = () => {
    createRole.mutate(
      {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        permissions: createForm.permissions,
      },
      {
        onSuccess: () => {
          closeCreateDialog();
          toast({
            title: t("roles.toast.createSuccessTitle"),
            description: t("roles.toast.createSuccessDescription", { name: createForm.name.trim() }),
          });
        },
        onError: (error) => {
          toast({
            title: t("roles.toast.createFailedTitle"),
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleEdit = () => {
    if (!editForm?.id) return;
    updateRole.mutate(
      {
        id: editForm.id,
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        permissions: editForm.permissions,
      },
      {
        onSuccess: () => {
          closeEditDialog();
          toast({
            title: t("roles.toast.updateSuccessTitle"),
            description: t("roles.toast.updateSuccessDescription", { name: editForm.name.trim() }),
          });
        },
        onError: (error) => {
          toast({
            title: t("roles.toast.updateFailedTitle"),
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteDialog.roleId) return;
    deleteRole.mutate(deleteDialog.roleId, {
      onSuccess: () => {
        toast({
          title: t("roles.toast.deleteSuccessTitle"),
          description: t("roles.toast.deleteSuccessDescription", { name: deleteDialog.roleName }),
        });
      },
    });
    setDeleteDialog({ open: false, roleId: null, roleName: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-row-reverse items-start justify-between gap-4 rtl:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("roles.subtitle")}</p>
        </div>
        {canCreateRoles && (
          <Button
            onClick={openCreateDialog}
            className="shrink-0 bg-primary/20 text-primary hover:bg-primary/30 gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("roles.createRole")}
          </Button>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Code2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("roles.permissions.developerMode")}</p>
              <p className="text-xs text-muted-foreground">{t("roles.permissions.developerModeDescription")}</p>
            </div>
          </div>
          <Switch checked={developerMode} onCheckedChange={setDeveloperMode} aria-label={t("roles.permissions.developerMode")} />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/5 px-5 py-4 text-sm font-semibold">
          {t("roles.customRolesHeading")}
        </div>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : managedRoles.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">{t("roles.emptyCustomTitle")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("roles.emptyCustomDescription")}</p>
            {canCreateRoles ? (
              <Button
                onClick={openCreateDialog}
                className="mt-6 bg-primary/20 text-primary hover:bg-primary/30 gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("roles.createRole")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {managedRoles.map((role) => {
              const isProtectedRole =
                role.role_type === "DEFAULT" || role.role_type === "PLATFORM";
              const canEditThisRole = canEditRoles && (!isProtectedRole || isSuperAdmin);
              const canDeleteThisRole = canDeleteRoles && role.role_type === "CUSTOM";
              const isExpanded = expandedRoleId === role.id;

              return (
              <div key={role.id} className="px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{role.name}</p>
                    <p className="text-xs text-muted-foreground">{role.description || t("roles.noDescription")}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="me-1 h-3.5 w-3.5" />
                          {t("roles.roleDetails.hidePermissions")}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="me-1 h-3.5 w-3.5" />
                          {t("roles.roleDetails.showPermissions")}
                        </>
                      )}
                    </Button>
                    <RolePermissionDetails
                      roleId={role.id}
                      expanded={isExpanded}
                      permissionCatalog={permissions}
                    />
                  </div>
                  <div className="flex gap-2">
                    {canEditThisRole && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10"
                        onClick={() => void openEditDialog(role)}
                      >
                        {t("roles.edit")}
                      </Button>
                    )}
                    {canDeleteThisRole && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10"
                        onClick={() =>
                          setDeleteDialog({
                            open: true,
                            roleId: role.id,
                            roleName: role.name ?? t("roles.noDescription"),
                          })
                        }
                      >
                        {t("roles.delete")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>

      <RoleFormDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
          else setCreateDialogOpen(true);
        }}
        mode="create"
        values={createForm}
        onChange={setCreateForm}
        permissions={permissions}
        submitting={createRole.isPending}
        onSubmit={handleCreate}
      />

      {editForm && (
        <RoleFormDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeEditDialog();
            else setEditDialogOpen(true);
          }}
          mode="edit"
          values={editForm}
          onChange={setEditForm}
          permissions={permissions}
          permissionsLoading={editPermissionsLoading}
          submitting={updateRole.isPending}
          onSubmit={handleEdit}
        />
      )}

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((current) => ({ ...current, open }))}
      >
        <AlertDialogContent className="border-white/10 bg-card text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.confirm.deleteTitle", { role: deleteDialog.roleName })}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("roles.confirm.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">{t("buttons.cancel")}</AlertDialogCancel>
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
