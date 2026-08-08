import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DepartmentFormDialog } from "@/components/company-workspace/dialogs/department-form-dialog";
import { DepartmentMergeDialog } from "@/components/company-workspace/dialogs/department-merge-dialog";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateOrganizationDepartment,
  useDeleteOrganizationDepartment,
  useMergeOrganizationDepartments,
  useOrganizationDepartments,
  useSetOrganizationDepartmentActive,
  useUpdateOrganizationDepartment,
} from "@/hooks/organization/use-organization-departments";
import { useManagedUsers } from "@/hooks/use-users-management";
import { useBranches } from "@/lib/company/branches/hooks";
import type {
  OrganizationDepartmentInput,
  OrganizationDepartmentWithStats,
} from "@/lib/organization/types";

const PAGE_SIZE = 9;

type StatusFilter = "all" | "active" | "inactive";

export function CompanyDepartmentsTab() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { bundle, permissions } = useCompanyWorkspace();
  const companyId = bundle?.companyId ?? null;

  const { data: departments = [], isLoading, error } = useOrganizationDepartments(companyId, true);
  const { data: branches = [] } = useBranches(companyId);
  const { data: employees = [] } = useManagedUsers({ companyId });

  const createDepartment = useCreateOrganizationDepartment(companyId);
  const updateDepartment = useUpdateOrganizationDepartment(companyId);
  const setActive = useSetOrganizationDepartmentActive(companyId);
  const deleteDepartment = useDeleteOrganizationDepartment(companyId);
  const mergeDepartments = useMergeOrganizationDepartments(companyId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationDepartmentWithStats | null>(null);
  const [mergeSource, setMergeSource] = useState<OrganizationDepartmentWithStats | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    kind: "disable" | "enable" | "delete";
    department: OrganizationDepartmentWithStats | null;
  }>({ open: false, kind: "disable", department: null });
  const [dependencyMessage, setDependencyMessage] = useState<string | null>(null);

  const managerOptions = useMemo(
    () =>
      employees
        .filter((user) => user.is_active)
        .map((user) => ({
          id: user.id,
          label: user.full_name?.trim() || user.email,
        })),
    [employees],
  );

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) map.set(branch.id, branch.name);
    return map;
  }, [branches]);

  const parentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const dept of departments) map.set(dept.id, dept.name);
    return map;
  }, [departments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments.filter((dept) => {
      if (statusFilter === "active" && !dept.isActive) return false;
      if (statusFilter === "inactive" && dept.isActive) return false;
      if (branchFilter !== "all" && dept.branchId !== branchFilter) return false;
      if (!q) return true;
      const haystack = [
        dept.name,
        dept.code,
        dept.description,
        dept.departmentType,
        branchNameById.get(dept.branchId),
        dept.parentId ? parentNameById.get(dept.parentId) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [branchFilter, branchNameById, departments, parentNameById, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFormSubmit = async (
    values: OrganizationDepartmentInput & { previousName?: string | null },
  ) => {
    if (editing) {
      await updateDepartment.mutateAsync({ id: editing.id, ...values });
      toast({ title: t("companyWorkspace.departments.toasts.updated") });
    } else {
      await createDepartment.mutateAsync(values);
      toast({ title: t("companyWorkspace.departments.toasts.created") });
    }
  };

  const runConfirm = () => {
    const department = confirm.department;
    if (!department) return;

    if (confirm.kind === "delete") {
      setDependencyMessage(null);
      deleteDepartment.mutate(
        { id: department.id, name: department.name },
        {
          onSuccess: () => {
            toast({ title: t("companyWorkspace.departments.toasts.deleted") });
            setConfirm({ open: false, kind: "delete", department: null });
          },
          onError: (err) => {
            if (err.message === "DEP_HAS_DEPENDENCIES") {
              setDependencyMessage(t("companyWorkspace.departments.confirm.hasDependencies"));
              return;
            }
            toast({
              variant: "destructive",
              title: t("companyWorkspace.departments.toasts.errorTitle"),
              description: err.message,
            });
          },
        },
      );
      return;
    }

    setActive.mutate(
      { id: department.id, isActive: confirm.kind === "enable" },
      {
        onSuccess: () => {
          toast({
            title:
              confirm.kind === "enable"
                ? t("companyWorkspace.departments.toasts.enabled")
                : t("companyWorkspace.departments.toasts.disabled"),
          });
          setConfirm({ open: false, kind: "disable", department: null });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("companyWorkspace.departments.toasts.errorTitle"),
            description: err.message,
          }),
      },
    );
  };

  if (!companyId) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("companyWorkspace.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("companyWorkspace.departments.searchPlaceholder")}
            className="h-9 ps-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder={t("companyWorkspace.departments.filters.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("companyWorkspace.departments.filters.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("companyWorkspace.employees.status.active")}</SelectItem>
            <SelectItem value="inactive">{t("companyWorkspace.employees.status.inactive")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder={t("companyWorkspace.departments.filters.branch")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("companyWorkspace.departments.filters.allBranches")}</SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {permissions.canManageDepartments ? (
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            {t("companyWorkspace.actions.addDepartment")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
          {t("common.loading")}
        </div>
      ) : paginated.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
          {t("companyWorkspace.departments.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((dept) => (
            <article
              key={dept.id}
              className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{dept.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {branchNameById.get(dept.branchId) ?? "—"}
                    {dept.code ? ` · ${dept.code}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={
                      dept.isActive
                        ? "rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    }
                  >
                    {dept.isActive
                      ? t("companyWorkspace.employees.status.active")
                      : t("companyWorkspace.employees.status.inactive")}
                  </span>
                  {permissions.canManageDepartments ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">
                            {t("companyWorkspace.employees.columns.actions")}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(dept);
                            setFormOpen(true);
                          }}
                        >
                          {t("companyWorkspace.departments.actions.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMergeSource(dept)}>
                          {t("companyWorkspace.departments.actions.merge")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            setConfirm({
                              open: true,
                              kind: dept.isActive ? "disable" : "enable",
                              department: dept,
                            })
                          }
                        >
                          {dept.isActive
                            ? t("companyWorkspace.departments.actions.disable")
                            : t("companyWorkspace.departments.actions.enable")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setDependencyMessage(null);
                            setConfirm({ open: true, kind: "delete", department: dept });
                          }}
                        >
                          {t("companyWorkspace.departments.actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                {dept.managerUserId ? (
                  <EmployeeIdentityCard
                    userId={dept.managerUserId}
                    showEmail={false}
                    showJobTitle
                    size="sm"
                  />
                ) : (
                  <p>{t("companyWorkspace.departments.form.noManager")}</p>
                )}
                {dept.parentId ? (
                  <p>
                    {t("companyWorkspace.departments.parent")}:{" "}
                    {parentNameById.get(dept.parentId) ?? "—"}
                  </p>
                ) : null}
                {dept.description ? <p>{dept.description}</p> : null}
                <p>
                  {t("companyWorkspace.departments.type")}:{" "}
                  {t(`companyWorkspace.departments.types.${dept.departmentType}`)}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                  <p className="text-muted-foreground">
                    {t("companyWorkspace.departments.stats.employees")}
                  </p>
                  <p className="font-semibold text-foreground">{dept.employees}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                  <p className="text-muted-foreground">
                    {t("companyWorkspace.departments.stats.operations")}
                  </p>
                  <p className="font-semibold text-foreground">{dept.operations}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                  <p className="text-muted-foreground">
                    {t("companyWorkspace.departments.stats.resources")}
                  </p>
                  <p className="font-semibold text-foreground">{dept.resources}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("users.pagination.pageInfo", {
            page: safePage,
            totalPages,
            total: filtered.length,
          })}
        </p>
        <div className="flex items-center gap-2">
          {safePage > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("users.pagination.previous")}
            </Button>
          ) : null}
          {safePage < totalPages ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("users.pagination.next")}
            </Button>
          ) : null}
        </div>
      </div>

      {permissions.canManageDepartments ? (
        <>
          <DepartmentFormDialog
            open={formOpen}
            onClose={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            department={editing}
            branches={branches}
            departments={departments}
            managerOptions={managerOptions}
            isSaving={createDepartment.isPending || updateDepartment.isPending}
            onSubmit={handleFormSubmit}
          />

          <DepartmentMergeDialog
            open={Boolean(mergeSource)}
            onClose={() => setMergeSource(null)}
            source={mergeSource}
            departments={departments}
            isSaving={mergeDepartments.isPending}
            onSubmit={async (targetId) => {
              if (!mergeSource) return;
              await mergeDepartments.mutateAsync({
                sourceId: mergeSource.id,
                targetId,
              });
              toast({ title: t("companyWorkspace.departments.toasts.merged") });
            }}
          />
        </>
      ) : null}

      <AlertDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
      >
        <AlertDialogContent className="border-border/60 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm.kind === "delete"
                ? t("companyWorkspace.departments.confirm.deleteTitle", {
                    name: confirm.department?.name,
                  })
                : confirm.kind === "enable"
                  ? t("companyWorkspace.departments.confirm.enableTitle", {
                      name: confirm.department?.name,
                    })
                  : t("companyWorkspace.departments.confirm.disableTitle", {
                      name: confirm.department?.name,
                    })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm.kind === "delete"
                ? t("companyWorkspace.departments.confirm.deleteDescription")
                : confirm.kind === "enable"
                  ? t("companyWorkspace.departments.confirm.enableDescription")
                  : t("companyWorkspace.departments.confirm.disableDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dependencyMessage ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {dependencyMessage}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDependencyMessage(null)}>
              {t("buttons.cancel")}
            </AlertDialogCancel>
            {dependencyMessage && confirm.kind === "delete" && confirm.department ? (
              <AlertDialogAction
                onClick={() => {
                  const department = confirm.department;
                  if (!department) return;
                  setDependencyMessage(null);
                  setActive.mutate(
                    { id: department.id, isActive: false },
                    {
                      onSuccess: () => {
                        toast({ title: t("companyWorkspace.departments.toasts.disabled") });
                        setConfirm({ open: false, kind: "disable", department: null });
                      },
                    },
                  );
                }}
              >
                {t("companyWorkspace.departments.actions.disable")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={runConfirm}>
                {confirm.kind === "delete"
                  ? t("companyWorkspace.departments.actions.delete")
                  : confirm.kind === "enable"
                    ? t("companyWorkspace.departments.actions.enable")
                    : t("companyWorkspace.departments.actions.disable")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
