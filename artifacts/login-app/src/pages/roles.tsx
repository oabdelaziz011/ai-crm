import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRole, useDeleteRole, usePermissionCatalog, useRoles, useUpdateRole, useHasPermission } from "@/hooks/use-rbac";
import type { PermissionRecord } from "@/hooks/use-rbac";
import { useTranslation } from "react-i18next";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm ${className}`}>{children}</div>;
}

function PermissionGroup({ title, permissions, selected, onToggle }: { title: string; permissions: PermissionRecord[]; selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/30 p-3">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {permissions.map((permission) => {
          const code = permission.code || "";
          const checked = selected.includes(code);
          return (
            <label key={permission.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={checked} onChange={() => onToggle(code)} />
              <span>{permission.action}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function RolesPage() {
  const { t } = useTranslation("common");
  const { data: roles = [], isLoading } = useRoles();
  const { data: permissions = [] } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const canManageRoles = useHasPermission("roles.create") || useHasPermission("roles.edit") || useHasPermission("roles.delete");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionRecord[]>();
    permissions.forEach((permission) => {
      const module = permission.module ?? "General";
      const group = groups.get(module) ?? [];
      group.push(permission);
      groups.set(module, group);
    });
    return Array.from(groups.entries());
  }, [permissions]);

  const handleToggle = (code: string) => {
    setSelectedPermissions((current) => (current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]));
  };

  const handleSave = () => {
    const payload = { name, description, permissions: selectedPermissions };
    if (editingRoleId) {
      updateRole.mutate({ id: editingRoleId, ...payload });
    } else {
      createRole.mutate(payload);
    }
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setEditingRoleId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("roles.subtitle")}</p>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4 text-sm font-semibold">{t("forms.roles.existing")}</div>
          {isLoading ? (
            <div className="space-y-3 p-6">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-white/5" />)}</div>
          ) : roles.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">{t("forms.roles.none")}</div>
          ) : (
            <div className="divide-y divide-white/5">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium">{role.name}</p>
                    <p className="text-xs text-muted-foreground">{role.description || t("roles.noDescription")}</p>
                  </div>
                  <div className="flex gap-2">
                    {canManageRoles && <Button variant="outline" size="sm" className="border-white/10" onClick={() => { setEditingRoleId(role.id); setName(role.name ?? ""); setDescription(role.description ?? ""); }}>{t("roles.edit")}</Button>}
                    {canManageRoles && <Button variant="outline" size="sm" className="border-white/10" onClick={() => deleteRole.mutate(role.id)}>{t("roles.delete")}</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-4 border-b border-white/5 pb-4 text-sm font-semibold">{editingRoleId ? t("forms.roles.edit") : t("forms.roles.create")}</div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">{t("common.name")}</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("forms.roles.namePlaceholder")} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">{t("common.description")}</label>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("forms.roles.descriptionPlaceholder")} />
            </div>
            <div className="space-y-3">
              {groupedPermissions.map(([module, modulePermissions]) => (
                <PermissionGroup key={module} title={module} permissions={modulePermissions} selected={selectedPermissions} onToggle={handleToggle} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="bg-primary/20 text-primary hover:bg-primary/30">{t("buttons.saveRole")}</Button>
              <Button variant="outline" className="border-white/10" onClick={() => { setName(""); setDescription(""); setSelectedPermissions([]); setEditingRoleId(null); }}>{t("buttons.reset")}</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default RolesPage;
