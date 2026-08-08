import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BranchWithStats } from "@/lib/company/branches/types";
import type { DepartmentType } from "@/lib/organization/types/organization-enums";
import type {
  OrganizationDepartment,
  OrganizationDepartmentInput,
} from "@/lib/organization/types";

type ManagerOption = { id: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  department?: OrganizationDepartment | null;
  branches: BranchWithStats[];
  departments: OrganizationDepartment[];
  managerOptions: ManagerOption[];
  isSaving?: boolean;
  onSubmit: (values: OrganizationDepartmentInput & { previousName?: string | null }) => Promise<void>;
};

const DEPARTMENT_TYPES: DepartmentType[] = [
  "general",
  "clinical",
  "administrative",
  "support",
];

function collectDescendantIds(
  rootId: string,
  departments: OrganizationDepartment[],
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const dept of departments) {
    if (!dept.parentId) continue;
    const list = childrenByParent.get(dept.parentId) ?? [];
    list.push(dept.id);
    childrenByParent.set(dept.parentId, list);
  }
  const blocked = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (blocked.has(childId)) continue;
      blocked.add(childId);
      stack.push(childId);
    }
  }
  return blocked;
}

export function DepartmentFormDialog({
  open,
  onClose,
  department,
  branches,
  departments,
  managerOptions,
  isSaving,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(department);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [branchId, setBranchId] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [managerUserId, setManagerUserId] = useState<string | null>(null);
  const [departmentType, setDepartmentType] = useState<DepartmentType>("general");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(department?.name ?? "");
    setCode(department?.code ?? "");
    setDescription(department?.description ?? "");
    setBranchId(department?.branchId ?? branches[0]?.id ?? "");
    setParentId(department?.parentId ?? null);
    setManagerUserId(department?.managerUserId ?? null);
    setDepartmentType(department?.departmentType ?? "general");
    setIsActive(department?.isActive ?? true);
  }, [open, department, branches]);

  const blockedParents = useMemo(() => {
    if (!department) return new Set<string>();
    return collectDescendantIds(department.id, departments);
  }, [department, departments]);

  const parentOptions = useMemo(() => {
    return departments
      .filter((dept) => dept.branchId === branchId)
      .filter((dept) => dept.isActive || dept.id === parentId)
      .filter((dept) => !blockedParents.has(dept.id))
      .map((dept) => ({
        value: dept.id,
        label: dept.name,
        description: dept.code ?? undefined,
      }));
  }, [blockedParents, branchId, departments, parentId]);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t("companyWorkspace.departments.form.nameRequired"));
      return;
    }
    if (!branchId) {
      setError(t("companyWorkspace.departments.form.branchRequired"));
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        branchId,
        parentId,
        managerUserId,
        departmentType,
        isActive,
        previousName: department?.name ?? null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("companyWorkspace.departments.form.saveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("companyWorkspace.departments.form.editTitle")
              : t("companyWorkspace.departments.form.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {t("companyWorkspace.departments.form.name")}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                {t("companyWorkspace.departments.code")}
              </label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                {t("companyWorkspace.departments.type")}
              </label>
              <Select
                value={departmentType}
                onValueChange={(value) => setDepartmentType(value as DepartmentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`companyWorkspace.departments.types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {t("companyWorkspace.departments.form.description")}
            </label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {t("companyWorkspace.departments.form.branch")}
            </label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                setParentId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("companyWorkspace.departments.form.branchPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {t("companyWorkspace.departments.form.parent")}
            </label>
            <SearchableSelect
              value={parentId ?? "__none__"}
              onValueChange={(value) => setParentId(value === "__none__" ? null : value)}
              options={[
                { value: "__none__", label: t("companyWorkspace.departments.form.noParent") },
                ...parentOptions,
              ]}
              placeholder={t("companyWorkspace.departments.form.parentPlaceholder")}
              searchPlaceholder={t("companyWorkspace.departments.searchPlaceholder")}
              emptyLabel={t("companyWorkspace.departments.empty")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {t("companyWorkspace.departments.form.manager")}
            </label>
            <SearchableSelect
              value={managerUserId ?? "__none__"}
              onValueChange={(value) => setManagerUserId(value === "__none__" ? null : value)}
              options={[
                { value: "__none__", label: t("companyWorkspace.departments.form.noManager") },
                ...managerOptions.map((option) => ({
                  value: option.id,
                  label: option.label,
                })),
              ]}
              placeholder={t("companyWorkspace.departments.form.managerPlaceholder")}
              searchPlaceholder={t("companyWorkspace.employees.searchPlaceholder")}
              emptyLabel={t("companyWorkspace.employees.empty")}
            />
          </div>

          {isEdit ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              {t("companyWorkspace.departments.form.active")}
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("buttons.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : t("buttons.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
