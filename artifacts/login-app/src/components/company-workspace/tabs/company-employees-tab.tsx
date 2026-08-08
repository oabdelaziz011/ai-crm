import { useEffect, useMemo, useState } from "react";
import {
  Download,
  MoreHorizontal,
  Rows3,
  Search,
  UserPlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { EmployeeBulkAssignDialog, type BulkAssignKind } from "@/components/company-workspace/employees/employee-bulk-assign-dialog";
import { EmployeeBulkToolbar } from "@/components/company-workspace/employees/employee-bulk-toolbar";
import { EmployeeQuickProfileSheet } from "@/components/company-workspace/employees/employee-quick-profile-sheet";
import { EmployeeStatsStrip } from "@/components/company-workspace/employees/employee-stats-strip";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
import { EmployeeBranchBadges } from "@/components/users/employee-branch-badges";
import { EmployeeRoleBadge } from "@/components/users/employee-role-badge";
import { EditManagedUserDialog } from "@/components/users/edit-managed-user-dialog";
import { InviteManagedUserDialog } from "@/components/users/invite-managed-user-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import { useAuth } from "@/context/auth-context";
import { useCompanyEmployeesPreferences } from "@/hooks/company-workspace/use-company-employees-preferences";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationDepartments } from "@/hooks/organization/use-organization-departments";
import {
  useCompanyEmployeeAuthMeta,
  useManagedUserRoleMap,
  useManagedUsers,
  useRemoveManagedUser,
  useResendManagedUserInvitation,
  useResetManagedUserPassword,
  useUpdateManagedUser,
  type ManagedUser,
} from "@/hooks/use-users-management";
import { downloadCsv } from "@/lib/billing/export-csv";
import { resolveLastLogin } from "@/lib/company-workspace/employees/last-login-label";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import { useBranches, useUserBranchAssignmentMap } from "@/lib/company/branches/hooks";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type ConfirmKind = "suspend" | "activate" | "delete" | "bulk_suspend" | "bulk_activate" | "bulk_delete";

export function CompanyEmployeesTab() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user: authUser } = useAuth();
  const { bundle, permissions } = useCompanyWorkspace();
  const companyId = bundle?.companyId ?? null;
  const { density, setDensity } = useCompanyEmployeesPreferences();

  const scope = useMemo(() => ({ companyId }), [companyId]);
  const { data: employees = [], isLoading, error } = useManagedUsers(scope);
  const { data: roleMap = {} } = useManagedUserRoleMap(scope);
  const { data: branchAssignmentMap = {} } = useUserBranchAssignmentMap(companyId);
  const { data: branches = [] } = useBranches(companyId);
  const { data: orgDepartments = [] } = useOrganizationDepartments(companyId, false);
  const { data: authMeta = {} } = useCompanyEmployeeAuthMeta(companyId);

  const updateUser = useUpdateManagedUser();
  const resetPassword = useResetManagedUserPassword();
  const resendInvite = useResendManagedUserInvitation();
  const removeUser = useRemoveManagedUser();

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [profileUser, setProfileUser] = useState<ManagedUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAssign, setBulkAssign] = useState<{ open: boolean; kind: BulkAssignKind }>({
    open: false,
    kind: "branch",
  });
  const [bulkBusy, setBulkBusy] = useState(false);

  const [confirm, setConfirm] = useState<{
    open: boolean;
    kind: ConfirmKind;
    user: ManagedUser | null;
  }>({ open: false, kind: "suspend", user: null });

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) map.set(branch.id, branch.name);
    return map;
  }, [branches]);

  const branchManagerIds = useMemo(() => {
    const set = new Set<string>();
    for (const branch of branches) {
      if (branch.manager_user_id) set.add(branch.manager_user_id);
    }
    return set;
  }, [branches]);

  const departmentManagerIds = useMemo(() => {
    const set = new Set<string>();
    for (const dept of orgDepartments) {
      if (dept.managerUserId) set.add(dept.managerUserId);
    }
    return set;
  }, [orgDepartments]);

  const departmentOptions = useMemo(
    () =>
      [...orgDepartments]
        .filter((d) => d.isActive)
        .map((d) => ({ id: d.id, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgDepartments],
  );

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const user of employees) {
      const name = user.department?.trim();
      if (!name) {
        unassigned += 1;
        continue;
      }
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return { counts, unassigned };
  }, [employees]);

  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of employees) {
      const ids = branchAssignmentMap[user.id] ?? [];
      for (const id of ids) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [branchAssignmentMap, employees]);

  const jobTitleSuggestions = useMemo(() => {
    const titles: string[] = [];
    for (const user of employees) {
      if (user.job_title?.trim()) titles.push(user.job_title.trim());
    }
    return titles;
  }, [employees]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const user of employees) {
      const name = roleMap[user.id]?.roleName?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [employees, roleMap]);

  const quickStats = useMemo(() => {
    let active = 0;
    let invited = 0;
    let suspended = 0;
    for (const user of employees) {
      if (user.is_active) active += 1;
      else suspended += 1;
      const meta = authMeta[user.id];
      if (!meta?.lastSignInAt && !meta?.emailConfirmedAt) invited += 1;
    }
    return {
      total: employees.length,
      active,
      invited,
      suspended,
      branchManagers: branchManagerIds.size,
      departmentManagers: departmentManagerIds.size,
    };
  }, [authMeta, branchManagerIds.size, departmentManagerIds.size, employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((user) => {
      if (department === "__unassigned__") {
        if (user.department?.trim()) return false;
      } else if (department !== "all" && (user.department?.trim() || "") !== department) {
        return false;
      }
      if (status === "active" && !user.is_active) return false;
      if (status === "inactive" && user.is_active) return false;
      const roleName = roleMap[user.id]?.roleName?.trim() || "";
      if (role !== "all" && roleName !== role) return false;
      const userBranches = branchAssignmentMap[user.id] ?? [];
      if (branchFilter !== "all" && !userBranches.includes(branchFilter)) return false;
      if (!q) return true;
      const branchLabels = userBranches
        .map((id) => branchNameById.get(id) ?? "")
        .join(" ");
      const haystack = [
        user.full_name,
        user.email,
        user.job_title,
        user.department,
        user.phone,
        roleName,
        branchLabels,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    branchAssignmentMap,
    branchFilter,
    branchNameById,
    department,
    employees,
    role,
    roleMap,
    search,
    status,
  ]);

  useEffect(() => {
    setPage(1);
  }, [search, department, role, status, branchFilter]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(filtered.map((u) => u.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pageAllSelected =
    paginated.length > 0 && paginated.every((user) => selectedIds.has(user.id));
  const pageSomeSelected =
    paginated.some((user) => selectedIds.has(user.id)) && !pageAllSelected;

  const notAssigned = t("companyWorkspace.employees.notAssigned");
  const cellPad = density === "compact" ? "px-2.5 py-1" : "px-3 py-2";
  const headPad = density === "compact" ? "px-2.5 py-1" : "px-3 py-1.5";

  const branchLabelsFor = (userId: string) => {
    const ids = branchAssignmentMap[userId] ?? [];
    return ids.map((id) => branchNameById.get(id) ?? id);
  };

  const branchLabelFor = (userId: string) => {
    const labels = branchLabelsFor(userId);
    if (labels.length === 0) return notAssigned;
    return labels.join(", ");
  };

  const lastLoginLabel = (userId: string) => resolveLastLogin(authMeta[userId], t).label;

  const exportRows = (rows: ManagedUser[]) => {
    downloadCsv(
      "company-employees.csv",
      [
        t("companyWorkspace.employees.columns.name"),
        t("companyWorkspace.employees.columns.jobTitle"),
        t("companyWorkspace.employees.columns.department"),
        t("companyWorkspace.employees.columns.role"),
        t("companyWorkspace.employees.columns.branch"),
        t("companyWorkspace.employees.columns.status"),
        t("companyWorkspace.employees.columns.phone"),
        t("companyWorkspace.employees.columns.email"),
        t("companyWorkspace.employees.columns.lastLogin"),
      ],
      rows.map((user) => [
        user.full_name || "",
        user.job_title || "",
        user.department || "",
        roleMap[user.id]?.roleName || "",
        branchLabelFor(user.id),
        user.is_active
          ? t("companyWorkspace.employees.status.active")
          : t("companyWorkspace.employees.status.inactive"),
        user.phone || "",
        user.email || "",
        lastLoginLabel(user.id),
      ]),
    );
  };

  const handleExport = () => exportRows(filtered);

  const handleExportSelected = () => {
    const rows = filtered.filter((u) => selectedIds.has(u.id));
    exportRows(rows.length > 0 ? rows : filtered);
  };

  const handleResetPassword = (user: ManagedUser) => {
    resetPassword.mutate(user.email, {
      onSuccess: () =>
        toast({
          title: t("companyWorkspace.employees.toasts.resetPasswordTitle"),
          description: t("companyWorkspace.employees.toasts.resetPasswordDescription"),
        }),
      onError: (err) =>
        toast({
          variant: "destructive",
          title: t("companyWorkspace.employees.toasts.errorTitle"),
          description: err.message,
        }),
    });
  };

  const handleResendInvite = (user: ManagedUser) => {
    resendInvite.mutate(user.email, {
      onSuccess: () =>
        toast({
          title: t("companyWorkspace.employees.toasts.resendTitle"),
          description: t("companyWorkspace.employees.toasts.resendDescription"),
        }),
      onError: (err) =>
        toast({
          variant: "destructive",
          title: t("companyWorkspace.employees.toasts.errorTitle"),
          description: err.message,
        }),
    });
  };

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const user of paginated) {
        if (checked) next.add(user.id);
        else next.delete(user.id);
      }
      return next;
    });
  };

  const toggleSelect = (userId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const runBulkAssign = async (payload: {
    branchIds?: string[];
    department?: string | null;
    roleId?: string;
  }) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await updateUser.mutateAsync({
          id,
          ...(payload.branchIds !== undefined ? { branchIds: payload.branchIds } : {}),
          ...(payload.department !== undefined ? { department: payload.department } : {}),
          ...(payload.roleId !== undefined ? { roleId: payload.roleId } : {}),
        });
      }
      toast({ title: t("companyWorkspace.employees.toasts.bulkUpdateTitle") });
      setBulkAssign((c) => ({ ...c, open: false }));
      setSelectedIds(new Set());
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("companyWorkspace.employees.toasts.errorTitle"),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runConfirm = async () => {
    if (confirm.kind.startsWith("bulk_")) {
      const ids = [...selectedIds].filter((id) => id !== authUser?.id || confirm.kind !== "bulk_delete");
      if (ids.length === 0) {
        setConfirm((c) => ({ ...c, open: false }));
        return;
      }
      setBulkBusy(true);
      try {
        if (confirm.kind === "bulk_delete") {
          for (const id of ids) {
            await removeUser.mutateAsync(id);
          }
          toast({ title: t("companyWorkspace.employees.toasts.bulkDeleteTitle") });
        } else {
          const isActive = confirm.kind === "bulk_activate";
          for (const id of ids) {
            await updateUser.mutateAsync({ id, is_active: isActive });
          }
          toast({
            title: isActive
              ? t("companyWorkspace.employees.toasts.bulkActivateTitle")
              : t("companyWorkspace.employees.toasts.bulkSuspendTitle"),
          });
        }
        setSelectedIds(new Set());
        setConfirm({ open: false, kind: "suspend", user: null });
      } catch (err) {
        toast({
          variant: "destructive",
          title: t("companyWorkspace.employees.toasts.errorTitle"),
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBulkBusy(false);
      }
      return;
    }

    const target = confirm.user;
    if (!target) return;

    if (confirm.kind === "delete") {
      removeUser.mutate(target.id, {
        onSuccess: () => {
          toast({ title: t("companyWorkspace.employees.toasts.deleteTitle") });
          setConfirm({ open: false, kind: "delete", user: null });
          if (profileUser?.id === target.id) setProfileUser(null);
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("companyWorkspace.employees.toasts.errorTitle"),
            description: err.message,
          }),
      });
      return;
    }

    updateUser.mutate(
      { id: target.id, is_active: confirm.kind === "activate" },
      {
        onSuccess: () => {
          toast({
            title:
              confirm.kind === "activate"
                ? t("companyWorkspace.employees.toasts.activateTitle")
                : t("companyWorkspace.employees.toasts.suspendTitle"),
          });
          setConfirm({ open: false, kind: "suspend", user: null });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("companyWorkspace.employees.toasts.errorTitle"),
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
    <>
      {/* KPI → toolbar spacing preserved via page stack gap-3 */}
      <div className="flex flex-col justify-start gap-3">
        <EmployeeStatsStrip stats={quickStats} />

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </div>
        ) : null}

        {/* Toolbar → grid: 12px only (gap-3). No flex-grow / space-between. */}
        <div className="flex flex-col justify-start gap-3">
          <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("companyWorkspace.employees.searchPlaceholder")}
                className="h-9 ps-8"
                aria-label={t("companyWorkspace.employees.searchPlaceholder")}
              />
            </div>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger
                className="h-9 w-[180px]"
                aria-label={t("companyWorkspace.employees.filters.department")}
              >
                <SelectValue placeholder={t("companyWorkspace.employees.filters.department")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("companyWorkspace.employees.filters.allDepartments")}</SelectItem>
                <SelectItem value="__unassigned__">
                  {t("companyWorkspace.employees.filters.countLabel", {
                    label: t("companyWorkspace.employees.filters.unassigned"),
                    count: departmentCounts.unassigned,
                  })}
                </SelectItem>
                {departmentOptions.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {t("companyWorkspace.employees.filters.countLabel", {
                      label: d.name,
                      count: departmentCounts.counts.get(d.name) ?? 0,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 w-[160px]" aria-label={t("companyWorkspace.employees.filters.role")}>
                <SelectValue placeholder={t("companyWorkspace.employees.filters.role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("companyWorkspace.employees.filters.allRoles")}</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                className="h-9 w-[140px]"
                aria-label={t("companyWorkspace.employees.filters.status")}
              >
                <SelectValue placeholder={t("companyWorkspace.employees.filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("companyWorkspace.employees.filters.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("companyWorkspace.employees.status.active")}</SelectItem>
                <SelectItem value="inactive">{t("companyWorkspace.employees.status.inactive")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger
                className="h-9 w-[180px]"
                aria-label={t("companyWorkspace.employees.filters.branch")}
              >
                <SelectValue placeholder={t("companyWorkspace.employees.filters.branch")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("companyWorkspace.employees.filters.allBranches")}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {t("companyWorkspace.employees.filters.countLabel", {
                      label: b.name,
                      count: branchCounts.get(b.id) ?? 0,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(value) => {
                if (value === "comfortable" || value === "compact") setDensity(value);
              }}
              className="rounded-lg border border-border/60 p-0.5"
              aria-label={t("companyWorkspace.employees.density.label")}
            >
              <ToggleGroupItem
                value="comfortable"
                className="h-8 gap-1 px-2 text-xs"
                aria-label={t("companyWorkspace.employees.density.comfortable")}
              >
                <Rows3 className="size-3.5" />
                <span className="hidden sm:inline">
                  {t("companyWorkspace.employees.density.comfortable")}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="compact"
                className="h-8 gap-1 px-2 text-xs"
                aria-label={t("companyWorkspace.employees.density.compact")}
              >
                <Rows3 className="size-3.5 scale-90" />
                <span className="hidden sm:inline">
                  {t("companyWorkspace.employees.density.compact")}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>

            {permissions.canManageEmployees ? (
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
                <Download className="size-3.5" />
                {t("companyWorkspace.actions.export")}
              </Button>
            ) : null}
            {permissions.canManageEmployees ? (
              <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-3.5" />
                {t("companyWorkspace.actions.inviteEmployee")}
              </Button>
            ) : null}
          </div>

          <div className="mt-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className="max-h-[min(70vh,720px)] overflow-auto">
              <table
                className={cn(
                  "w-full min-w-[980px] border-collapse text-start",
                  density === "compact" ? "text-[13px]" : "text-sm",
                )}
              >
                <thead className="sticky top-0 z-10 border-b border-border/50 bg-muted/95 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr>
                    <th className={cn(headPad, "w-10 text-start font-medium")}>
                      <Checkbox
                        checked={pageAllSelected ? true : pageSomeSelected ? "indeterminate" : false}
                        onCheckedChange={(value) => toggleSelectAllPage(value === true)}
                        aria-label={t("companyWorkspace.employees.bulk.selectAllPage")}
                      />
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.name")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.department")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.role")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.branch")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.status")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.phone")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.lastLogin")}
                    </th>
                    <th className={cn(headPad, "text-start font-medium")}>
                      {t("companyWorkspace.employees.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className={cn(cellPad, "text-center text-muted-foreground")}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className={cn(cellPad, "text-center text-muted-foreground")}>
                    {t("companyWorkspace.employees.empty")}
                  </td>
                </tr>
              ) : (
                paginated.map((user) => {
                  const lastLogin = resolveLastLogin(authMeta[user.id], t);
                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-b border-border/40 last:border-0",
                        selectedIds.has(user.id) && "bg-primary/[0.03]",
                      )}
                    >
                      <td className={cn(cellPad, "align-middle")}>
                        <Checkbox
                          checked={selectedIds.has(user.id)}
                          onCheckedChange={(value) => toggleSelect(user.id, value === true)}
                          aria-label={t("companyWorkspace.employees.bulk.selectRow", {
                            name: user.full_name || user.email,
                          })}
                        />
                      </td>
                      <td className={cn(cellPad, "align-middle")}>
                        <EmployeeIdentityCard
                          identity={{
                            id: user.id,
                            userId: user.id,
                            fullName: user.full_name || user.email || "",
                            email: user.email,
                            avatarUrl: user.avatar_url,
                            phone: user.phone,
                            jobTitle: user.job_title,
                            department: user.department,
                            status: user.is_active ? "active" : "inactive",
                            language: user.preferred_language,
                            timezone: user.timezone,
                            bio: null,
                            extensionNumber: null,
                          }}
                          fallbackName={user.full_name}
                          fallbackEmail={user.email}
                          showEmail
                          showJobTitle
                          size="sm"
                          onNameClick={() => setProfileUser(user)}
                          nameAriaLabel={t("companyWorkspace.employees.quickProfile.openAria", {
                            name: user.full_name || user.email,
                          })}
                        />
                      </td>
                      <td className={cn(cellPad, "align-middle text-muted-foreground")}>
                        {user.department?.trim() || notAssigned}
                      </td>
                      <td className={cn(cellPad, "align-middle")}>
                        <EmployeeRoleBadge roleName={roleMap[user.id]?.roleName} />
                      </td>
                      <td className={cn(cellPad, "max-w-[200px] align-middle")}>
                        <EmployeeBranchBadges labels={branchLabelsFor(user.id)} />
                      </td>
                      <td className={cn(cellPad, "align-middle")}>
                        <span
                          className={
                            user.is_active
                              ? "rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                              : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          }
                        >
                          {user.is_active
                            ? t("companyWorkspace.employees.status.active")
                            : t("companyWorkspace.employees.status.inactive")}
                        </span>
                      </td>
                      <td className={cn(cellPad, "align-middle text-muted-foreground")}>
                        {user.phone?.trim() || notAssigned}
                      </td>
                      <td
                        className={cn(
                          cellPad,
                          "whitespace-nowrap align-middle text-xs",
                          lastLogin.kind === "relative"
                            ? "text-muted-foreground"
                            : "font-medium text-amber-700 dark:text-amber-400",
                        )}
                        dir="ltr"
                      >
                        {lastLogin.label}
                      </td>
                      <td className={cn(cellPad, "align-middle")}>
                        {permissions.canManageEmployees ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">
                                  {t("companyWorkspace.employees.columns.actions")}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setProfileUser(user)}>
                                {t("companyWorkspace.employees.actions.viewProfile")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditUser(user)}>
                                {t("companyWorkspace.employees.actions.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                {t("companyWorkspace.employees.actions.resetPassword")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResendInvite(user)}>
                                {t("companyWorkspace.employees.actions.resendInvitation")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirm({
                                    open: true,
                                    kind: user.is_active ? "suspend" : "activate",
                                    user,
                                  })
                                }
                              >
                                {user.is_active
                                  ? t("companyWorkspace.employees.actions.suspend")
                                  : t("companyWorkspace.employees.actions.activate")}
                              </DropdownMenuItem>
                              {authUser?.id !== user.id ? (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    setConfirm({ open: true, kind: "delete", user })
                                  }
                                >
                                  {t("companyWorkspace.employees.actions.delete")}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setProfileUser(user)}
                          >
                            {t("companyWorkspace.employees.actions.viewProfile")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2.5">
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
          </div>
        </div>
      </div>

      <EmployeeBulkToolbar
        selectedCount={selectedIds.size}
        canManage={permissions.canManageEmployees}
        onClear={() => setSelectedIds(new Set())}
        onAssignBranch={() => setBulkAssign({ open: true, kind: "branch" })}
        onAssignDepartment={() => setBulkAssign({ open: true, kind: "department" })}
        onChangeRole={() => setBulkAssign({ open: true, kind: "role" })}
        onSuspend={() =>
          setConfirm({ open: true, kind: "bulk_suspend", user: null })
        }
        onActivate={() =>
          setConfirm({ open: true, kind: "bulk_activate", user: null })
        }
        onExport={handleExportSelected}
        onDelete={() => setConfirm({ open: true, kind: "bulk_delete", user: null })}
      />

      <InviteManagedUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        companyId={companyId}
        departments={departmentOptions}
        jobTitleSuggestions={jobTitleSuggestions}
        onNavigateToBranches={() => setLocation(companyWorkspaceHref("branches"))}
        onNavigateToDepartments={() => setLocation(companyWorkspaceHref("departments"))}
        onSuccess={() => {
          toast({
            title: t("users.success.inviteSentTitle"),
            description: t("users.success.inviteSentDescription"),
          });
        }}
      />

      <EditManagedUserDialog
        open={Boolean(editUser)}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        companyId={companyId}
        user={editUser}
        role={editUser ? roleMap[editUser.id] ?? null : null}
        branchIds={editUser ? branchAssignmentMap[editUser.id] ?? [] : []}
        departments={departmentOptions}
        jobTitleSuggestions={jobTitleSuggestions}
        onSuccess={() => {
          toast({ title: t("companyWorkspace.employees.toasts.updateTitle") });
        }}
      />

      <EmployeeQuickProfileSheet
        open={Boolean(profileUser)}
        onOpenChange={(open) => {
          if (!open) setProfileUser(null);
        }}
        companyId={companyId}
        user={profileUser}
        roleName={profileUser ? roleMap[profileUser.id]?.roleName : null}
        branchLabels={profileUser ? branchLabelsFor(profileUser.id) : []}
        authMeta={profileUser ? authMeta[profileUser.id] : undefined}
        isBranchManager={profileUser ? branchManagerIds.has(profileUser.id) : false}
        isDepartmentManager={
          profileUser ? departmentManagerIds.has(profileUser.id) : false
        }
        canManage={permissions.canManageEmployees}
        isSelf={Boolean(profileUser && authUser?.id === profileUser.id)}
        onEdit={() => {
          if (!profileUser) return;
          setEditUser(profileUser);
          setProfileUser(null);
        }}
        onResetPassword={() => {
          if (profileUser) handleResetPassword(profileUser);
        }}
        onResendInvitation={() => {
          if (profileUser) handleResendInvite(profileUser);
        }}
        onSuspendOrActivate={() => {
          if (!profileUser) return;
          setConfirm({
            open: true,
            kind: profileUser.is_active ? "suspend" : "activate",
            user: profileUser,
          });
        }}
        onDelete={() => {
          if (!profileUser) return;
          setConfirm({ open: true, kind: "delete", user: profileUser });
        }}
      />

      <EmployeeBulkAssignDialog
        open={bulkAssign.open}
        onOpenChange={(open) => setBulkAssign((c) => ({ ...c, open }))}
        kind={bulkAssign.kind}
        companyId={companyId}
        selectedCount={selectedIds.size}
        departments={departmentOptions}
        onSubmit={runBulkAssign}
        isSubmitting={bulkBusy}
      />

      <AlertDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
      >
        <AlertDialogContent className="border-border/60 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm.kind === "bulk_delete"
                ? t("companyWorkspace.employees.confirm.bulkDeleteTitle", {
                    count: selectedIds.size,
                  })
                : confirm.kind === "bulk_activate"
                  ? t("companyWorkspace.employees.confirm.bulkActivateTitle", {
                      count: selectedIds.size,
                    })
                  : confirm.kind === "bulk_suspend"
                    ? t("companyWorkspace.employees.confirm.bulkSuspendTitle", {
                        count: selectedIds.size,
                      })
                    : confirm.kind === "delete"
                      ? t("companyWorkspace.employees.confirm.deleteTitle", {
                          user: confirm.user?.full_name || confirm.user?.email,
                        })
                      : confirm.kind === "activate"
                        ? t("users.confirm.activateTitle", {
                            user: confirm.user?.full_name || confirm.user?.email,
                          })
                        : t("companyWorkspace.employees.confirm.suspendTitle", {
                            user: confirm.user?.full_name || confirm.user?.email,
                          })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm.kind === "bulk_delete"
                ? t("companyWorkspace.employees.confirm.bulkDeleteDescription")
                : confirm.kind === "bulk_activate"
                  ? t("companyWorkspace.employees.confirm.bulkActivateDescription")
                  : confirm.kind === "bulk_suspend"
                    ? t("companyWorkspace.employees.confirm.bulkSuspendDescription")
                    : confirm.kind === "delete"
                      ? t("companyWorkspace.employees.confirm.deleteDescription")
                      : confirm.kind === "activate"
                        ? t("users.confirm.activateDescription")
                        : t("companyWorkspace.employees.confirm.suspendDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runConfirm()} disabled={bulkBusy}>
              {confirm.kind.includes("delete")
                ? t("companyWorkspace.employees.actions.delete")
                : confirm.kind.includes("activate")
                  ? t("companyWorkspace.employees.actions.activate")
                  : t("companyWorkspace.employees.actions.suspend")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
