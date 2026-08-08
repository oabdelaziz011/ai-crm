import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { useManagedUsers } from "@/hooks/use-users-management";
import { summarizeBranchHours, readBranchWeeklyHours } from "@/lib/company/branches/branch-weekly-hours";
import {
  BranchFormDialog,
  BranchHolidaysDialog,
  BranchHoursDialog,
} from "@/lib/company/branches/components";
import { getBranchServices } from "@/lib/company/branches";
import {
  useBranches,
  useCreateBranch,
  useDeactivateBranch,
  useDeleteBranch,
  useUpdateBranch,
  formatBranchError,
} from "@/lib/company/branches/hooks";
import { BranchManagementError } from "@/lib/company/branches/services";
import type { BranchFormValues, BranchWithStats } from "@/lib/company/branches/types";
import type { BranchFormSchema } from "@/lib/company/branches/validators";
import { invalidateBranchQueries } from "@/lib/company/branches/cache";

const PAGE_SIZE = 9;

type StatusFilter = "all" | "active" | "inactive" | "archived";

export function CompanyBranchesTab() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { bundle, permissions } = useCompanyWorkspace();
  const companyId = bundle?.companyId ?? null;

  const { data: branches = [], isLoading, error } = useBranches(companyId);
  const { data: employees = [] } = useManagedUsers({ companyId });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BranchWithStats | null>(null);
  const [hoursBranch, setHoursBranch] = useState<BranchWithStats | null>(null);
  const [holidaysBranch, setHolidaysBranch] = useState<BranchWithStats | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    kind: "disable" | "delete";
    branch: BranchWithStats | null;
  }>({ open: false, kind: "disable", branch: null });
  const [dependencyMessage, setDependencyMessage] = useState<string | null>(null);

  const createBranch = useCreateBranch(companyId);
  const updateBranch = useUpdateBranch(companyId, editing?.id ?? null);
  const deactivateBranch = useDeactivateBranch(companyId);
  const deleteBranch = useDeleteBranch(companyId);

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

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of employees) {
      map.set(user.id, user.full_name?.trim() || user.email);
    }
    return map;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((branch) => {
      if (statusFilter !== "all" && branch.status !== statusFilter) return false;
      if (!q) return true;
      const managerLabel = branch.manager_user_id
        ? employeeNameById.get(branch.manager_user_id) ?? ""
        : "";
      const haystack = [
        branch.name,
        branch.code,
        branch.city,
        branch.phone,
        branch.email,
        managerLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [branches, employeeNameById, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const refresh = () => {
    // invalidateBranchQueries already invalidates company-workspace + branch lists.
    if (companyId) invalidateBranchQueries(qc, companyId);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (branch: BranchWithStats) => {
    setEditing(branch);
    setFormOpen(true);
  };

  const handleSubmit = async (values: BranchFormSchema) => {
    try {
      const payload = values as BranchFormValues;
      if (editing) {
        await updateBranch.mutateAsync(payload);
        toast({ title: t("branches.updated") });
      } else {
        await createBranch.mutateAsync(payload);
        toast({ title: t("branches.created") });
      }
      setFormOpen(false);
      setEditing(null);
      refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(err),
      });
      throw err;
    }
  };

  const handleEnable = async (branch: BranchWithStats) => {
    if (!companyId) return;
    try {
      await getBranchServices().repositories.branches.update(branch.id, companyId, {
        status: "active",
      });
      toast({ title: t("companyWorkspace.branches.toasts.enabled") });
      refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(err),
      });
    }
  };

  const runConfirm = () => {
    const branch = confirm.branch;
    if (!branch) return;

    if (confirm.kind === "disable") {
      deactivateBranch.mutate(branch.id, {
        onSuccess: () => {
          toast({ title: t("branches.deactivated") });
          setConfirm({ open: false, kind: "disable", branch: null });
          refresh();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("branches.errors.title"),
            description: formatBranchError(err),
          }),
      });
      return;
    }

    setDependencyMessage(null);
    deleteBranch.mutate(branch.id, {
      onSuccess: () => {
        toast({ title: t("branches.deleted") });
        setConfirm({ open: false, kind: "delete", branch: null });
        refresh();
      },
      onError: (err) => {
        if (err instanceof BranchManagementError && err.code === "has_dependencies") {
          setDependencyMessage(t("companyWorkspace.branches.confirm.hasDependencies"));
          return;
        }
        toast({
          variant: "destructive",
          title: t("branches.errors.title"),
          description: formatBranchError(err),
        });
      },
    });
  };

  const formatAddress = (branch: BranchWithStats) => {
    const parts = [branch.address_line1, branch.city, branch.country].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
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
            placeholder={t("companyWorkspace.branches.searchPlaceholder")}
            className="h-9 ps-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder={t("companyWorkspace.branches.filters.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("companyWorkspace.branches.filters.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("branches.statuses.active")}</SelectItem>
            <SelectItem value="inactive">{t("branches.statuses.inactive")}</SelectItem>
            <SelectItem value="archived">{t("branches.statuses.archived")}</SelectItem>
          </SelectContent>
        </Select>
        {permissions.canManageBranches ? (
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t("companyWorkspace.actions.addBranch")}
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
          {t("companyWorkspace.branches.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((branch) => {
            const address = formatAddress(branch);
            const hoursSummary = summarizeBranchHours(
              readBranchWeeklyHours(branch.settings ?? null),
            );
            return (
              <article
                key={branch.id}
                className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{branch.name}</h3>
                    {branch.code ? (
                      <p className="font-mono text-[11px] text-muted-foreground">{branch.code}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t(`branches.statuses.${branch.status}`)}
                    </span>
                    {permissions.canManageBranches ? (
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
                          <DropdownMenuItem onClick={() => openEdit(branch)}>
                            {t("companyWorkspace.branches.actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHoursBranch(branch)}>
                            {t("companyWorkspace.branches.actions.workingHours")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHolidaysBranch(branch)}>
                            {t("companyWorkspace.branches.actions.holidays")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {branch.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirm({ open: true, kind: "disable", branch })
                              }
                            >
                              {t("companyWorkspace.branches.actions.disable")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void handleEnable(branch)}>
                              {t("companyWorkspace.branches.actions.enable")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setDependencyMessage(null);
                              setConfirm({ open: true, kind: "delete", branch });
                            }}
                          >
                            {t("companyWorkspace.branches.actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {branch.manager_user_id ? (
                    <EmployeeIdentityCard
                      userId={branch.manager_user_id}
                      fallbackName={employeeNameById.get(branch.manager_user_id)}
                      showEmail={false}
                      showJobTitle
                      size="sm"
                    />
                  ) : (
                    <p>{t("companyWorkspace.branches.noManager")}</p>
                  )}
                  {branch.phone ? <p>{branch.phone}</p> : null}
                  {address ? <p>{address}</p> : null}
                  {hoursSummary ? (
                    <p>
                      {t("companyWorkspace.branches.workingHours")}: {hoursSummary}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-muted-foreground">
                      {t("companyWorkspace.branches.stats.employees")}
                    </p>
                    <p className="font-semibold text-foreground">{branch.users_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-muted-foreground">
                      {t("companyWorkspace.branches.stats.customers")}
                    </p>
                    <p className="font-semibold text-foreground">{branch.customers_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-muted-foreground">
                      {t("companyWorkspace.branches.stats.operations")}
                    </p>
                    <p className="font-semibold text-foreground">{branch.operations_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-muted-foreground">
                      {t("companyWorkspace.branches.stats.resources")}
                    </p>
                    <p className="font-semibold text-foreground">{branch.resources_count ?? 0}</p>
                  </div>
                </div>
              </article>
            );
          })}
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

      {permissions.canManageBranches ? (
        <>
          <BranchFormDialog
            open={formOpen}
            onClose={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            branch={editing}
            onSubmit={handleSubmit}
            isSaving={createBranch.isPending || updateBranch.isPending}
            managerOptions={managerOptions}
          />

          <BranchHoursDialog
            open={Boolean(hoursBranch)}
            onClose={() => setHoursBranch(null)}
            companyId={companyId}
            branch={hoursBranch}
            onSaved={() => {
              toast({ title: t("companyWorkspace.branches.toasts.hoursSaved") });
              refresh();
            }}
          />

          <BranchHolidaysDialog
            open={Boolean(holidaysBranch)}
            onClose={() => setHolidaysBranch(null)}
            companyId={companyId}
            branch={holidaysBranch}
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
                ? t("companyWorkspace.branches.confirm.deleteTitle", {
                    name: confirm.branch?.name,
                  })
                : t("companyWorkspace.branches.confirm.disableTitle", {
                    name: confirm.branch?.name,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm.kind === "delete"
                ? t("companyWorkspace.branches.confirm.deleteDescription")
                : t("companyWorkspace.branches.confirm.disableDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dependencyMessage ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {dependencyMessage}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDependencyMessage(null);
              }}
            >
              {t("buttons.cancel")}
            </AlertDialogCancel>
            {dependencyMessage && confirm.kind === "delete" && confirm.branch ? (
              <AlertDialogAction
                onClick={() => {
                  const branch = confirm.branch;
                  if (!branch) return;
                  setDependencyMessage(null);
                  deactivateBranch.mutate(branch.id, {
                    onSuccess: () => {
                      toast({ title: t("branches.deactivated") });
                      setConfirm({ open: false, kind: "disable", branch: null });
                      refresh();
                    },
                    onError: (err) =>
                      toast({
                        variant: "destructive",
                        title: t("branches.errors.title"),
                        description: formatBranchError(err),
                      }),
                  });
                }}
              >
                {t("companyWorkspace.branches.actions.disable")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={runConfirm}>
                {confirm.kind === "delete"
                  ? t("companyWorkspace.branches.actions.delete")
                  : t("companyWorkspace.branches.actions.disable")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
