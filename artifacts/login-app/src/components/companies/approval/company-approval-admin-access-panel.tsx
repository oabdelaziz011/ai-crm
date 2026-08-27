import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RolePermissionSelector } from "@/components/roles/role-form-fields";
import { useToast } from "@/hooks/use-toast";
import {
  useCompanyReviewAdminAccess,
  useCompanyReviewRolePermissions,
} from "@/hooks/companies/use-company-review-admin-access";
import { useFeaturePermissionMap } from "@/hooks/billing/use-feature-definition-permissions";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { usePermissionCatalog, useAssignUserRoles, useUpdateRole } from "@/hooks/use-rbac";
import { filterPermissionsForCompanyEntitlements } from "@/lib/companies/company-review-permission-filter";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  companyId: string;
};

export function CompanyApprovalAdminAccessPanel({ companyId }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const adminAccessQuery = useCompanyReviewAdminAccess(companyId);
  const permissionCatalogQuery = usePermissionCatalog();
  const entitlementsQuery = useCompanyEntitlements(companyId);
  const permissionMapQuery = useFeaturePermissionMap();
  const assignRoles = useAssignUserRoles();
  const updateRole = useUpdateRole();

  const owner = adminAccessQuery.data?.owners[0] ?? null;
  const assignableRoles = adminAccessQuery.data?.assignableRoles ?? [];

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [permissionsDirty, setPermissionsDirty] = useState(false);

  const selectedRole = useMemo(
    () => assignableRoles.find((role) => role.id === selectedRoleId) ?? null,
    [assignableRoles, selectedRoleId],
  );

  const rolePermissionsQuery = useCompanyReviewRolePermissions(selectedRoleId, Boolean(selectedRoleId));

  useEffect(() => {
    if (!adminAccessQuery.data) return;
    const nextRoleId =
      adminAccessQuery.data.ownerRoleId ??
      adminAccessQuery.data.adminRole?.id ??
      adminAccessQuery.data.assignableRoles[0]?.id ??
      "";
    setSelectedRoleId(nextRoleId);
    setPermissionsDirty(false);
  }, [adminAccessQuery.data]);

  useEffect(() => {
    if (permissionsDirty || rolePermissionsQuery.isLoading) return;
    setPermissionCodes(rolePermissionsQuery.data ?? []);
  }, [permissionsDirty, rolePermissionsQuery.data, rolePermissionsQuery.isLoading, selectedRoleId]);

  const assignablePermissions = useMemo(() => {
    const catalog = permissionCatalogQuery.data ?? [];
    const entitlements = entitlementsQuery.data ?? [];
    const map = permissionMapQuery.map ?? new Map<string, readonly string[]>();
    return filterPermissionsForCompanyEntitlements(catalog, entitlements, map);
  }, [permissionCatalogQuery.data, entitlementsQuery.data, permissionMapQuery.map]);

  const isSaving = assignRoles.isPending || updateRole.isPending;
  const isLoading =
    adminAccessQuery.isLoading ||
    permissionCatalogQuery.isLoading ||
    entitlementsQuery.isLoading ||
    permissionMapQuery.isLoading ||
    rolePermissionsQuery.isLoading;

  async function saveAdminAccess() {
    if (!owner?.id) {
      toast({
        title: t("companies.approval.wizard.adminAccess.noOwner"),
        variant: "destructive",
      });
      return;
    }
    if (!selectedRoleId || !selectedRole) {
      toast({
        title: t("companies.approval.wizard.adminAccess.roleRequired"),
        variant: "destructive",
      });
      return;
    }

    try {
      await assignRoles.mutateAsync({ userId: owner.id, roleIds: [selectedRoleId] });
      await updateRole.mutateAsync({
        id: selectedRoleId,
        name: selectedRole.name ?? t("roles.defaults.admin", { defaultValue: "Admin" }),
        description: "",
        permissions: permissionCodes,
      });
      await qc.invalidateQueries({ queryKey: ["company-review", "admin-access", companyId] });
      await qc.invalidateQueries({ queryKey: ["company-review", "role-permissions", selectedRoleId] });
      setPermissionsDirty(false);
      toast({ title: t("companies.approval.wizard.adminAccess.saveSuccess") });
    } catch (error) {
      toast({
        title: t("companies.approval.wizard.adminAccess.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-sm font-semibold">{t("companies.approval.wizard.adminAccess.title")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("companies.approval.wizard.adminAccess.description")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading", { defaultValue: "Loading…" })}
        </div>
      ) : !owner ? (
        <p className="text-sm text-muted-foreground">{t("companies.approval.wizard.adminAccess.noOwner")}</p>
      ) : assignableRoles.length === 0 ? (
        <p className="text-sm text-destructive">{t("companies.approval.wizard.adminAccess.noAdminRole")}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {t("companies.approval.wizard.adminAccess.ownerLabel")}
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{owner.full_name || owner.email || owner.id}</p>
                  {owner.email ? (
                    <div className="mt-0.5 min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {t("companies.approval.wizard.adminAccess.loginEmail")}
                      </p>
                      <p dir="ltr" className="truncate text-xs text-muted-foreground">
                        {owner.email}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {t("companies.approval.wizard.adminAccess.roleLabel")}
              </Label>
              <Select
                value={selectedRoleId}
                onValueChange={(value) => {
                  setSelectedRoleId(value);
                  setPermissionsDirty(false);
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={t("companies.approval.wizard.adminAccess.rolePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name ?? role.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {t("companies.approval.wizard.adminAccess.roleHint")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t("companies.approval.wizard.adminAccess.permissionsLabel", {
                role: selectedRole?.name ?? t("roles.defaults.admin", { defaultValue: "Admin" }),
              })}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {t("companies.approval.wizard.adminAccess.permissionsHint")}
            </p>
            {/*
              Do NOT nest max-height + overflow-hidden here.
              Step 3 uses the workspace's single overflow-y-auto scroller.
              A nested max-h-[22rem] overflow-hidden clips expanded groups
              and makes the permission matrix unreachable.
            */}
            <div className="rounded-xl border border-border/60 bg-background p-3">
              <RolePermissionSelector
                permissions={assignablePermissions}
                selected={permissionCodes}
                onChange={(codes) => {
                  setPermissionCodes(codes);
                  setPermissionsDirty(true);
                }}
                disabled={isSaving}
                scrollMode="parent"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void saveAdminAccess()} disabled={isSaving}>
              {isSaving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
              {t("companies.approval.wizard.adminAccess.save")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
