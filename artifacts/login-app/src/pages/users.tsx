import { useAuth } from "@/context/auth-context";
import { useAssignUserRoles, useAssignUserPermissions } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function UsersPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, permissions, roles } = useAuth();
  const assignRoles = useAssignUserRoles();
  const assignPermissions = useAssignUserPermissions();

  // Super Admin bypass - show full UI
  if (!isSuperAdmin) {
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
      <div>
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("users.subtitle")}</p>
      </div>
      
      <div className="rounded-lg border border-white/10 bg-card/40 p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">{t("users.availableRoles")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {roles.map((role) => (
                <div key={role.id} className="px-3 py-2 rounded border border-white/10 bg-white/5 text-sm">
                  {role.name}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">{t("users.availablePermissions")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {permissions.map((perm) => (
                <div key={perm.id} className="px-3 py-2 rounded border border-white/10 bg-white/5 text-xs">
                  {perm.code}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("users.placeholder")}</p>
        </div>
      </div>
    </div>
  );
}
