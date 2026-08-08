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
import { useCompanyAssignableRoles } from "@/hooks/use-company-assignable-roles";
import { useToast } from "@/hooks/use-toast";
import {
  useUpdateManagedUser,
  type ManagedUser,
  type ManagedUserRole,
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  user: ManagedUser | null;
  role: ManagedUserRole | null;
  branchIds: string[];
  departments?: DepartmentOption[];
  /** Distinct job titles from company employees (autocomplete). */
  jobTitleSuggestions?: string[];
  onSuccess?: () => void;
};

type EditForm = {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  branchIds: string[];
  jobTitle: string;
  department: string;
  phone: string;
  preferredLanguage: string;
  timezone: string;
};

export function EditManagedUserDialog({
  open,
  onOpenChange,
  companyId,
  user,
  role,
  branchIds,
  departments,
  jobTitleSuggestions = [],
  onSuccess,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const updateUser = useUpdateManagedUser();
  const createBranch = useCreateBranch(companyId);
  const [form, setForm] = useState<EditForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);

  const { data: branches = [], isLoading: branchesLoading } = useBranches(companyId);
  const {
    data: roles = [],
    isLoading: rolesLoading,
    refetch: refetchRoles,
  } = useCompanyAssignableRoles(companyId, open);

  const tenantRoles = useMemo(
    () => roles.filter((r) => r.company_id === companyId),
    [roles, companyId],
  );
  const companyHasNoRoles = Boolean(companyId) && !rolesLoading && tenantRoles.length === 0;

  const roleOptions = useMemo(
    () =>
      tenantRoles.map((r) => ({
        value: r.id,
        label: r.name ?? t("users.noRole"),
        description: r.description ?? undefined,
      })),
    [tenantRoles, t],
  );

  useEffect(() => {
    if (!open || !user) return;
    setError(null);
    setBranchCreateOpen(false);
    setForm({
      id: user.id,
      email: user.email,
      fullName: user.full_name ?? "",
      roleId: role?.roleId ?? "",
      isActive: user.is_active,
      branchIds: [...branchIds],
      jobTitle: user.job_title ?? "",
      department: user.department ?? "",
      phone: user.phone ?? "",
      preferredLanguage: user.preferred_language ?? "en",
      timezone: user.timezone ?? "UTC",
    });
    void refetchRoles();
  }, [open, user, role, branchIds, refetchRoles]);

  useEffect(() => {
    if (!open || !form?.roleId) return;
    const stillValid = tenantRoles.some((r) => r.id === form.roleId);
    if (!stillValid && tenantRoles.length > 0) {
      setForm((current) => (current ? { ...current, roleId: "" } : current));
    }
  }, [open, form?.roleId, tenantRoles]);

  const handleCreateBranchSubmit = async (values: BranchFormSchema) => {
    try {
      const created = await createBranch.mutateAsync(values as BranchFormValues);
      setForm((current) =>
        current
          ? {
              ...current,
              branchIds: [...new Set([...current.branchIds, created.id])],
            }
          : current,
      );
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

  const handleSubmit = () => {
    if (!form) return;
    setError(null);
    if (!form.fullName.trim()) {
      setError(t("users.form.nameRequired"));
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

    updateUser.mutate(
      {
        id: form.id,
        full_name: form.fullName,
        company_id: companyId,
        is_active: form.isActive,
        roleId: form.roleId,
        branchIds: form.branchIds,
        job_title: form.jobTitle.trim() || null,
        department: form.department.trim() || null,
        phone: form.phone.trim() || null,
        preferred_language: form.preferredLanguage || "en",
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
            <DialogTitle>{t("companyWorkspace.employees.editTitle")}</DialogTitle>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              {error ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.fullName")}</label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm((c) => (c ? { ...c, fullName: e.target.value } : c))}
                  placeholder={t("users.form.fullNamePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.email")}</label>
                <Input type="email" value={form.email} readOnly className="opacity-70" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{t("users.form.jobTitle")}</label>
                  <JobTitleAutocomplete
                    value={form.jobTitle}
                    onChange={(jobTitle) => setForm((c) => (c ? { ...c, jobTitle } : c))}
                    suggestions={jobTitleSuggestions}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{t("users.form.department")}</label>
                  <DepartmentSearchableSelect
                    companyId={companyId}
                    value={form.department}
                    departments={departments}
                    onChange={(department) =>
                      setForm((c) => (c ? { ...c, department } : c))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t("users.form.phone")}</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((c) => (c ? { ...c, phone: e.target.value } : c))}
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
                    onValueChange={(roleId) => setForm((c) => (c ? { ...c, roleId } : c))}
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
                onChange={(next) => setForm((c) => (c ? { ...c, branchIds: next } : c))}
                isLoading={branchesLoading}
                emptyMessage={t("branches.users.noBranchesAvailable")}
                onCreateBranch={() => setBranchCreateOpen(true)}
              />

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((c) => (c ? { ...c, isActive: e.target.checked } : c))
                  }
                />
                {t("users.form.activeOnCreate")}
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("buttons.cancel")}
            </Button>
            <Button type="button" onClick={handleSubmit}>
              {updateUser.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("users.actions.save")
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
