import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RoleFormDialog } from "@/components/roles/role-form-dialog";
import type { RoleFormValues } from "@/components/roles/role-form-fields";
import { Button } from "@/components/ui/button";
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

export function RolesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthUser();
  const { data: roles = [], isLoading } = useRoles();
  const { data: permissions = [] } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const canCreateRoles = useHasPermission("roles.create");
  const canEditRoles = useHasPermission("roles.edit");
  const canDeleteRoles = useHasPermission("roles.delete");

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
        permissions: permissionCodes,
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

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/5 px-5 py-4 text-sm font-semibold">{t("forms.roles.existing")}</div>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">{t("forms.roles.none")}</div>
        ) : (
          <div className="divide-y divide-white/5">
            {roles.map((role) => {
              const isProtectedRole =
                role.role_type === "DEFAULT" || role.role_type === "PLATFORM";
              const canEditThisRole = canEditRoles && (!isProtectedRole || isSuperAdmin);
              const canDeleteThisRole = canDeleteRoles && role.role_type === "CUSTOM";

              return (
              <div key={role.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{role.name}</p>
                  <p className="text-xs text-muted-foreground">{role.description || t("roles.noDescription")}</p>
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
