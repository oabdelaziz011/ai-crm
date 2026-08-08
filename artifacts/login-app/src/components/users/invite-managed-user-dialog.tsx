import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DepartmentSearchableSelect,
  type DepartmentOption,
} from "@/components/users/department-searchable-select";
import { JobTitleAutocomplete } from "@/components/users/job-title-autocomplete";
import { BranchAssignmentMultiSelect, BranchFormDialog } from "@/lib/company/branches/components";
import { useBranches, useCreateBranch, formatBranchError } from "@/lib/company/branches/hooks";
import type { BranchFormValues } from "@/lib/company/branches/types";
import type { BranchFormSchema } from "@/lib/company/branches/validators";
import { useOrganizationDepartments } from "@/hooks/organization/use-organization-departments";
import { useCompanyAssignableRoles } from "@/hooks/use-company-assignable-roles";
import { useCreateManagedUser } from "@/hooks/use-users-management";
import { useToast } from "@/hooks/use-toast";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  departments?: DepartmentOption[];
  jobTitleSuggestions?: string[];
  onSuccess?: () => void;
  /** Navigate to Branches tab (dependency gate / empty state). */
  onNavigateToBranches?: () => void;
  /** Navigate to Departments tab (dependency gate / empty state). */
  onNavigateToDepartments?: () => void;
};

const emptyForm = {
  email: "",
  fullName: "",
  roleId: "",
  isActive: true,
  branchIds: [] as string[],
  jobTitle: "",
  department: "",
  phone: "",
  preferredLanguage: "en",
  timezone: "UTC",
};

export function InviteManagedUserDialog({
  open,
  onOpenChange,
  companyId,
  departments: providedDepartments,
  jobTitleSuggestions = [],
  onSuccess,
  onNavigateToBranches,
  onNavigateToDepartments,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const createUser = useCreateManagedUser();
  const createBranch = useCreateBranch(companyId);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);

  const { data: branches = [], isLoading: branchesLoading } = useBranches(companyId);
  const shouldFetchDepartments = providedDepartments === undefined;
  const { data: fetchedDepartments = [], isLoading: departmentsLoading } =
    useOrganizationDepartments(shouldFetchDepartments && open ? companyId : null, false);

  const departmentOptions = useMemo<DepartmentOption[]>(() => {
    if (providedDepartments) return providedDepartments;
    return fetchedDepartments
      .filter((d) => d.isActive !== false)
      .map((d) => ({ id: d.id, name: d.name }));
  }, [fetchedDepartments, providedDepartments]);

  const {
    data: roles = [],
    isLoading: rolesLoading,
    refetch: refetchRoles,
  } = useCompanyAssignableRoles(companyId, open);

  const tenantRoles = useMemo(
    () => roles.filter((role) => role.company_id === companyId),
    [roles, companyId],
  );
  const companyHasNoRoles = Boolean(companyId) && !rolesLoading && tenantRoles.length === 0;

  const roleOptions = useMemo(
    () =>
      tenantRoles.map((role) => ({
        value: role.id,
        label: role.name ?? t("users.noRole"),
        description: role.description ?? undefined,
      })),
    [tenantRoles, t],
  );

  const structureLoading =
    branchesLoading || (shouldFetchDepartments && departmentsLoading && open);
  const hasBranch = branches.length > 0;
  const hasDepartment = departmentOptions.length > 0;
  const setupBlocked = !structureLoading && (!hasBranch || !hasDepartment);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError(null);
      setBranchCreateOpen(false);
      void refetchRoles();
    }
  }, [open, refetchRoles]);

  const handleCreateBranchSubmit = async (values: BranchFormSchema) => {
    try {
      const created = await createBranch.mutateAsync(values as BranchFormValues);
      setForm((current) => ({
        ...current,
        branchIds: [...new Set([...current.branchIds, created.id])],
      }));
      setBranchCreateOpen(false);
      toast({ title: t("branches.created") });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(err),
      });
      throw err;
    }
  };

  const goCreateBranch = () => {
    if (onNavigateToBranches) {
      onOpenChange(false);
      onNavigateToBranches();
      return;
    }
    setBranchCreateOpen(true);
  };

  const goCreateDepartment = () => {
    if (!onNavigateToDepartments) return;
    onOpenChange(false);
    onNavigateToDepartments();
  };

  const handleSubmit = () => {
    setError(null);
    if (setupBlocked) {
      setError(t("users.form.setupRequiresBranchAndDepartment"));
      return;
    }
    if (!form.fullName.trim()) {
      setError(t("users.form.nameRequired"));
      return;
    }
    if (!form.email.trim()) {
      setError(t("users.form.emailRequired"));
      return;
    }
    if (companyHasNoRoles) {
      setError(t("users.errors.company_has_no_roles"));
      return;
    }
    if (!form.roleId) {
      setError(t("users.form.roleRequired"));
      return;
    }

    createUser.mutate(
      {
        email: form.email,
        fullName: form.fullName,
        companyId,
        roleId: form.roleId,
        isActive: form.isActive,
        branchIds: form.branchIds,
        jobTitle: form.jobTitle.trim() || null,
        department: form.department.trim() || null,
        phone: form.phone.trim() || null,
        preferredLanguage: form.preferredLanguage || "en",
        timezone: form.timezone || "UTC",
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/60 bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>{t("companyWorkspace.employees.inviteTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {setupBlocked ? (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
                <p className="text-sm text-foreground">
                  {t("users.form.setupRequiresBranchAndDepartment")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!hasBranch ? (
                    <Button type="button" size="sm" variant="outline" onClick={goCreateBranch}>
                      {t("users.form.createBranch")}
                    </Button>
                  ) : null}
                  {!hasDepartment ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={goCreateDepartment}
                      disabled={!onNavigateToDepartments}
                    >
                      {t("users.form.createDepartment")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.fullName")}</label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))}
                placeholder={t("users.form.fullNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.email")}</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                placeholder={t("users.form.emailPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.jobTitle")}</label>
                <JobTitleAutocomplete
                  value={form.jobTitle}
                  onChange={(jobTitle) => setForm((c) => ({ ...c, jobTitle }))}
                  suggestions={jobTitleSuggestions}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.department")}</label>
                <DepartmentSearchableSelect
                  companyId={companyId}
                  value={form.department}
                  departments={departmentOptions}
                  onChange={(department) => setForm((c) => ({ ...c, department }))}
                  onCreateDepartment={
                    onNavigateToDepartments
                      ? () => {
                          onOpenChange(false);
                          onNavigateToDepartments();
                        }
                      : undefined
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.phone")}</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                placeholder={t("users.form.phonePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("users.form.role")}</label>
              {companyHasNoRoles ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t("users.errors.company_has_no_roles")}
                </p>
              ) : (
                <SearchableSelect
                  value={form.roleId}
                  onValueChange={(roleId) => setForm((c) => ({ ...c, roleId }))}
                  options={roleOptions}
                  placeholder={t("users.form.rolePlaceholder")}
                  searchPlaceholder={t("users.form.roleSearchPlaceholder")}
                  emptyLabel={t("users.form.noRolesAvailable")}
                />
              )}
            </div>

            <BranchAssignmentMultiSelect
              label={t("branches.users.assignmentLabel")}
              branches={branches}
              selectedIds={form.branchIds}
              onChange={(branchIds) => setForm((c) => ({ ...c, branchIds }))}
              isLoading={branchesLoading}
              emptyMessage={t("users.form.noBranchesFound")}
              onCreateBranch={() => setBranchCreateOpen(true)}
            />

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((c) => ({ ...c, isActive: e.target.checked }))}
              />
              {t("users.form.activeOnCreate")}
            </label>

            <p className="text-xs text-muted-foreground">{t("users.form.inviteNote")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("buttons.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={setupBlocked || createUser.isPending || companyHasNoRoles}
            >
              {createUser.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("companyWorkspace.actions.inviteEmployee")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BranchFormDialog
        open={branchCreateOpen}
        onClose={() => setBranchCreateOpen(false)}
        onSubmit={handleCreateBranchSubmit}
        isSaving={createBranch.isPending}
      />
    </>
  );
}
