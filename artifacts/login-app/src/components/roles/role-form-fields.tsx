import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { PermissionRecord } from "@/hooks/use-rbac";
import { cn } from "@/lib/utils";

type TriState = boolean | "indeterminate";

function triState(selectedCount: number, totalCount: number): TriState {
  if (totalCount === 0 || selectedCount === 0) return false;
  if (selectedCount >= totalCount) return true;
  return "indeterminate";
}

function permissionMatchesSearch(permission: PermissionRecord, query: string): boolean {
  const haystack = [
    permission.code,
    permission.action,
    permission.module,
    permission.description,
    permission.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function moduleGroupKey(module: string): string {
  return module.trim() || "General";
}

type Props = {
  permissions: PermissionRecord[];
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
};

export function RolePermissionSelector({ permissions, selected, onChange, disabled }: Props) {
  const { t } = useTranslation("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const hasInitializedExpand = useRef(false);

  const normalizedQuery = search.trim().toLowerCase();

  const allCodes = useMemo(
    () =>
      permissions
        .map((p) => p.code)
        .filter((code): code is string => Boolean(code)),
    [permissions],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionRecord[]>();
    permissions.forEach((permission) => {
      const key = moduleGroupKey(permission.module ?? "General");
      const list = groups.get(key) ?? [];
      list.push(permission);
      groups.set(key, list);
    });
    return Array.from(groups.entries())
      .map(([module, items]) => ({
        module,
        permissions: items.sort((a, b) => (a.action ?? "").localeCompare(b.action ?? "")),
      }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }, [permissions]);

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return grouped;
    return grouped
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((p) => permissionMatchesSearch(p, normalizedQuery)),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [grouped, normalizedQuery]);

  const visibleCodes = useMemo(
    () =>
      filteredGroups.flatMap((g) =>
        g.permissions.map((p) => p.code).filter((code): code is string => Boolean(code)),
      ),
    [filteredGroups],
  );

  const selectedVisibleCount = useMemo(
    () => selected.filter((code) => allCodes.includes(code)).length,
    [selected, allCodes],
  );

  const globalTriState = triState(selectedVisibleCount, allCodes.length);

  useEffect(() => {
    if (hasInitializedExpand.current || filteredGroups.length === 0) return;
    setExpandedGroups(filteredGroups.map((g) => g.module));
    hasInitializedExpand.current = true;
  }, [filteredGroups]);

  const setSelectedSet = useCallback(
    (updater: (current: Set<string>) => Set<string>) => {
      onChange(Array.from(updater(new Set(selected))));
    },
    [onChange, selected],
  );

  const togglePermission = (code: string) => {
    setSelectedSet((current) => {
      if (current.has(code)) current.delete(code);
      else current.add(code);
      return current;
    });
  };

  const selectCodes = (codes: string[]) => {
    setSelectedSet((current) => {
      codes.forEach((code) => current.add(code));
      return current;
    });
  };

  const clearCodes = (codes: string[]) => {
    setSelectedSet((current) => {
      codes.forEach((code) => current.delete(code));
      return current;
    });
  };

  const handleGlobalSelectAll = () => {
    if (globalTriState === true) {
      clearCodes(allCodes);
    } else {
      selectCodes(allCodes);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const handleGroupSelectAll = (codes: string[]) => {
    const selectedInGroup = codes.filter((code) => selected.includes(code)).length;
    if (selectedInGroup === codes.length) {
      clearCodes(codes);
    } else {
      selectCodes(codes);
    }
  };

  const expandAll = () => setExpandedGroups(filteredGroups.map((g) => g.module));
  const collapseAll = () => setExpandedGroups([]);

  const handlePermissionAreaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectCodes(visibleCodes.length > 0 ? visibleCodes : allCodes);
    }
  };

  const groupLabel = (module: string) => {
    const key = moduleGroupKey(module);
    const translated = t(`roles.permissionGroups.${key}`, { defaultValue: "" });
    if (translated) return translated;
    return key;
  };

  const permissionLabel = (permission: PermissionRecord) => {
    if (permission.description) return permission.description;
    if (permission.action && permission.module) {
      return `${permission.action} — ${permission.module}`;
    }
    return permission.code ?? permission.action ?? "";
  };

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-col gap-3"
      onKeyDown={handlePermissionAreaKeyDown}
      tabIndex={-1}
    >
      <div className="space-y-3 rounded-xl border border-white/10 bg-background/30 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("roles.permissions.searchPlaceholder")}
            className="ps-9"
            disabled={disabled}
            aria-label={t("roles.permissions.searchPlaceholder")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <Checkbox
              checked={globalTriState}
              onCheckedChange={handleGlobalSelectAll}
              disabled={disabled || allCodes.length === 0}
              aria-label={t("roles.permissions.selectAll")}
            />
            <span className="font-medium">{t("roles.permissions.selectAll")}</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={handleClearAll}
            disabled={disabled || selected.length === 0}
          >
            {t("roles.permissions.clearAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={expandAll}
            disabled={disabled || filteredGroups.length === 0}
          >
            {t("roles.permissions.expandAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={collapseAll}
            disabled={disabled || filteredGroups.length === 0}
          >
            {t("roles.permissions.collapseAll")}
          </Button>
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {t("roles.permissions.selectedCounter", {
              selected: selected.length,
              total: allCodes.length,
            })}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pe-1">
        {filteredGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("roles.permissions.noResults")}
          </div>
        ) : (
          <Accordion
            type="multiple"
            value={expandedGroups}
            onValueChange={setExpandedGroups}
            className="space-y-2"
          >
            {filteredGroups.map((group) => {
              const codes = group.permissions
                .map((p) => p.code)
                .filter((code): code is string => Boolean(code));
              const selectedInGroup = codes.filter((code) => selected.includes(code)).length;
              const groupState = triState(selectedInGroup, codes.length);

              return (
                <AccordionItem
                  key={group.module}
                  value={group.module}
                  className="overflow-hidden rounded-xl border border-white/10 bg-background/20 px-3"
                >
                  <div className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={groupState}
                      onCheckedChange={() => handleGroupSelectAll(codes)}
                      disabled={disabled}
                      aria-label={t("roles.permissions.groupSelectAll", { group: groupLabel(group.module) })}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                      <div className="flex w-full items-center justify-between gap-3 pe-2 text-start">
                        <span className="font-semibold">{groupLabel(group.module)}</span>
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">
                          {t("roles.permissions.groupCounter", {
                            selected: selectedInGroup,
                            total: codes.length,
                          })}
                        </span>
                      </div>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent>
                    <div className="grid gap-2 pb-3 md:grid-cols-2">
                      {group.permissions.map((permission) => {
                        const code = permission.code ?? permission.id;
                        const checked = selected.includes(code);
                        return (
                          <label
                            key={permission.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm transition-colors",
                              checked && "border-primary/30 bg-primary/5",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => togglePermission(code)}
                              disabled={disabled}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-foreground">
                                {permissionLabel(permission)}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                                {permission.code}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {globalTriState === "indeterminate" ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          {t("roles.permissions.partialSelectionHint")}
        </p>
      ) : null}
    </div>
  );
}

export type RoleFormValues = {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
};

type RoleFormFieldsProps = {
  values: RoleFormValues;
  onChange: (values: RoleFormValues) => void;
  permissions: PermissionRecord[];
  disabled?: boolean;
  permissionsLoading?: boolean;
};

export function RoleFormFields({
  values,
  onChange,
  permissions,
  disabled,
  permissionsLoading,
}: RoleFormFieldsProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-muted-foreground">{t("common.name")}</label>
          <Input
            value={values.name}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
            placeholder={t("forms.roles.namePlaceholder")}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted-foreground">{t("common.description")}</label>
          <Input
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
            placeholder={t("forms.roles.descriptionPlaceholder")}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <p className="mb-2 text-sm font-semibold">{t("roles.permissions.title")}</p>
        {permissionsLoading ? (
          <div className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("permissions.loading")}
          </div>
        ) : (
          <RolePermissionSelector
            permissions={permissions}
            selected={values.permissions}
            onChange={(codes) => onChange({ ...values, permissions: codes })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
