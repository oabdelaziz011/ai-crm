import { useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useAssignUserPermissions } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface PermissionGroup {
  module: string;
  permissions: Array<{
    id: string;
    code: string;
    action: string | null;
    description: string | null;
  }>;
}

export function UserPermissionsPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, permissions } = useAuth();
  const assignPermissions = useAssignUserPermissions();
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Super Admin bypass - show full UI
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("permissions.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("permissions.noPermission")}</p>
        </div>
      </div>
    );
  }

  const groupedPermissions = useMemo((): PermissionGroup[] => {
    const groups = new Map<string, PermissionGroup["permissions"]>();
    
    permissions.forEach((perm) => {
      const module = perm.module ?? t("permissions.general");
      if (!groups.has(module)) {
        groups.set(module, []);
      }
      groups.get(module)!.push({
        id: perm.id,
        code: perm.code ?? "",
        action: perm.action,
        description: perm.description,
      });
    });

    return Array.from(groups.entries()).map(([module, perms]) => ({
      module,
      permissions: perms,
    }));
  }, [permissions]);

  const handleToggle = (code: string) => {
    setSelectedPermissions((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("permissions.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("permissions.subtitle")}</p>
      </div>

      <div className="grid gap-6">
        {groupedPermissions.map(({ module, permissions: modulePerms }) => (
          <div key={module} className="rounded-lg border border-white/10 bg-card/40 p-6">
            <h3 className="text-sm font-semibold mb-3">{module}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {modulePerms.map((perm) => (
                <label key={perm.id} className="flex items-center gap-2 px-3 py-2 rounded border border-white/10 hover:bg-white/5 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(perm.code)}
                    onChange={() => handleToggle(perm.code)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-muted-foreground">{perm.action || perm.code}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button className="bg-primary/20 text-primary hover:bg-primary/30" onClick={() => setSelectedPermissions([])}>
            {t("buttons.clearSelection")}
          </Button>
          <Button variant="outline" className="border-white/10">
            {t("buttons.assignSelected")}
          </Button>
        </div>
      </div>
    </div>
  );
}
