import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PermissionLabel } from "@/components/rbac/permission-badge";
import {
  permissionSearchHaystack,
  resolvePermissionDisplayName,
  resolvePermissionGroupId,
  resolvePermissionGroupLabels,
  usePermissionCatalogLanguageVersion,
} from "@/lib/rbac/permission-display-i18n";
import { permissionModuleIcon } from "@/lib/rbac/permission-module-icons";
import {
  countSelectedInCodes,
  filterPermissionsBySearch,
  groupPermissionsForRoleEditor,
} from "@/lib/rbac/permission-module-taxonomy";
import {
  addPermissionCodes,
  removePermissionCodes,
  togglePermissionCode,
} from "@/lib/rbac/permission-selection";
import type { PermissionRecord } from "@/hooks/use-rbac";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
import { cn } from "@/lib/utils";

type TriState = boolean | "indeterminate";

function triState(selectedCount: number, totalCount: number): TriState {
  if (totalCount === 0 || selectedCount === 0) return false;
  if (selectedCount >= totalCount) return true;
  return "indeterminate";
}

type Props = {
  permissions: PermissionRecord[];
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  /**
   * parent = expand into the surrounding page/dialog scroller (no nested overflow).
   * contained = keep an internal overflow-y region (role dialogs with fixed height).
   */
  scrollMode?: "parent" | "contained";
};

export function RolePermissionSelector({
  permissions,
  selected,
  onChange,
  disabled,
  scrollMode = "contained",
}: Props) {
  const { t, i18n } = useTranslation("common");
  usePermissionCatalogLanguageVersion();
  const isArabic = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("ar");
  const [search, setSearch] = useState("");
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const hasInitializedExpand = useRef(false);

  const allCodes = useMemo(
    () =>
      permissions
        .map((permission) => permission.code)
        .filter((code): code is string => Boolean(code)),
    [permissions],
  );

  const searchablePermissions = useMemo(
    () =>
      filterPermissionsBySearch(permissions, search, (code, permission) =>
        permissionSearchHaystack(code, permission),
      ),
    [permissions, search],
  );

  const families = useMemo(() => {
    const grouped = groupPermissionsForRoleEditor(
      searchablePermissions,
      (code, permission) => resolvePermissionGroupId(code, permission),
    );

    return grouped.map((family) => ({
      ...family,
      modules: family.modules.map((module) => ({
        ...module,
        labels: resolvePermissionGroupLabels(module.moduleId),
        permissions: [...module.permissions].sort((a, b) => {
          const aCode = a.code ?? a.id;
          const bCode = b.code ?? b.id;
          return resolvePermissionDisplayName(aCode, a).localeCompare(
            resolvePermissionDisplayName(bCode, b),
            undefined,
            { sensitivity: "base" },
          );
        }),
      })),
    }));
  }, [searchablePermissions]);

  const visibleModuleIds = useMemo(
    () => families.flatMap((family) => family.modules.map((module) => module.moduleId)),
    [families],
  );

  const visibleCodes = useMemo(
    () =>
      families.flatMap((family) =>
        family.modules.flatMap((module) =>
          module.permissions
            .map((permission) => permission.code)
            .filter((code): code is string => Boolean(code)),
        ),
      ),
    [families],
  );

  const selectedVisibleCount = useMemo(
    () => selected.filter((code) => allCodes.includes(code)).length,
    [selected, allCodes],
  );

  const globalTriState = triState(selectedVisibleCount, allCodes.length);
  const searchActive = search.trim().length > 0;

  useEffect(() => {
    if (searchActive) {
      setExpandedModules(visibleModuleIds);
      return;
    }
    if (hasInitializedExpand.current || visibleModuleIds.length === 0) return;
    if (scrollMode === "parent") {
      setExpandedModules(visibleModuleIds);
    } else {
      setExpandedModules(visibleModuleIds.includes("email") ? ["email"] : [visibleModuleIds[0]]);
    }
    hasInitializedExpand.current = true;
  }, [searchActive, visibleModuleIds, scrollMode]);

  const setSelectedCodes = useCallback(
    (codes: string[]) => {
      onChange(codes);
    },
    [onChange],
  );

  const handleGlobalSelectAll = () => {
    if (globalTriState === true) {
      setSelectedCodes(removePermissionCodes(selected, allCodes));
    } else {
      setSelectedCodes(addPermissionCodes(selected, allCodes));
    }
  };

  const handleClearAll = () => {
    setSelectedCodes([]);
  };

  const handleModuleSelectAll = (codes: string[]) => {
    const counts = countSelectedInCodes(selected, codes);
    setSelectedCodes(
      counts.all ? removePermissionCodes(selected, codes) : addPermissionCodes(selected, codes),
    );
  };

  const expandAll = () => setExpandedModules(visibleModuleIds);
  const collapseAll = () => setExpandedModules([]);

  const handlePermissionAreaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedCodes(addPermissionCodes(selected, visibleCodes.length > 0 ? visibleCodes : allCodes));
    }
  };

  return (
    <div
      className={cn("flex flex-col gap-3", scrollMode === "contained" ? "min-h-0 flex-1" : undefined)}
      onKeyDown={handlePermissionAreaKeyDown}
      tabIndex={-1}
      data-testid="role-permission-selector"
    >
      <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("roles.permissions.searchPlaceholder")}
            className="ps-9"
            disabled={disabled}
            dir="auto"
            aria-label={t("roles.permissions.searchPlaceholder")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="checkbox"
            aria-checked={globalTriState === "indeterminate" ? "mixed" : globalTriState}
            tabIndex={disabled || allCodes.length === 0 ? -1 : 0}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-sm",
              (disabled || allCodes.length === 0) && "cursor-not-allowed opacity-50",
            )}
            onClick={() => {
              if (!disabled && allCodes.length > 0) handleGlobalSelectAll();
            }}
            onKeyDown={(event) => {
              if (disabled || allCodes.length === 0) return;
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                handleGlobalSelectAll();
              }
            }}
          >
            <Checkbox
              checked={globalTriState}
              disabled={disabled || allCodes.length === 0}
              tabIndex={-1}
              className="pointer-events-none"
              aria-hidden
            />
            <span className="font-medium">{t("roles.permissions.selectAll")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border/70"
            onClick={handleClearAll}
            disabled={disabled || selected.length === 0}
          >
            {t("roles.permissions.clearAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border/70"
            onClick={expandAll}
            disabled={disabled || visibleModuleIds.length === 0}
          >
            {t("roles.permissions.expandAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border/70"
            onClick={collapseAll}
            disabled={disabled || visibleModuleIds.length === 0}
          >
            {t("roles.permissions.collapseAll")}
          </Button>
          <span className="ms-auto text-xs text-muted-foreground tabular-nums" dir="ltr">
            {t("roles.permissions.selectedCounter", {
              selected: selectedVisibleCount,
              total: allCodes.length,
            })}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "pe-1",
          scrollMode === "contained" ? "min-h-0 flex-1 overflow-y-auto" : "overflow-visible",
        )}
      >
        {families.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("roles.permissions.noResults")}
          </div>
        ) : (
          <div className="space-y-6 pb-2">
            {families.map((family) => {
              const familyCodes = family.modules.flatMap((module) =>
                module.permissions
                  .map((permission) => permission.code)
                  .filter((code): code is string => Boolean(code)),
              );
              const familyCounts = countSelectedInCodes(selected, familyCodes);

              return (
                <section key={family.familyId} className="space-y-2" data-family={family.familyId}>
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      {t(`roles.families.${family.familyId}`)}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {t("roles.permissions.familyCounter", {
                        selected: familyCounts.selected,
                        total: familyCounts.total,
                      })}
                    </span>
                  </div>

                  <Accordion
                    type="multiple"
                    value={expandedModules}
                    onValueChange={setExpandedModules}
                    className="space-y-2"
                  >
                    {family.modules.map((module) => {
                      const Icon = permissionModuleIcon(module.moduleId);
                      const codes = module.permissions
                        .map((permission) => permission.code)
                        .filter((code): code is string => Boolean(code));
                      const counts = countSelectedInCodes(selected, codes);
                      const moduleState = triState(counts.selected, counts.total);
                      const secondaryName = isArabic ? module.labels.english : null;

                      return (
                        <AccordionItem
                          key={module.moduleId}
                          value={module.moduleId}
                          data-permission-module={module.moduleId}
                          className="overflow-hidden rounded-xl border border-border/70 bg-card/30 px-3"
                        >
                          <div className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={moduleState}
                              onCheckedChange={() => handleModuleSelectAll(codes)}
                              disabled={disabled}
                              aria-label={t("roles.permissions.groupSelectAll", {
                                group: module.labels.localized,
                              })}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                              <div className="flex w-full items-center justify-between gap-3 pe-2 text-start">
                                <span className="flex min-w-0 items-center gap-2">
                                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                                  <span className="min-w-0">
                                    <span className="block font-semibold leading-tight">
                                      {module.labels.localized}
                                    </span>
                                    {secondaryName && secondaryName !== module.labels.localized ? (
                                      <span className="block text-[11px] font-normal text-muted-foreground" dir="ltr">
                                        {secondaryName}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums" dir="ltr">
                                  {t("roles.permissions.groupCounter", {
                                    selected: counts.selected,
                                    total: counts.total,
                                  })}
                                </span>
                              </div>
                            </AccordionTrigger>
                          </div>
                          <AccordionContent>
                            <div className="flex flex-wrap gap-2 pb-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={disabled || counts.all}
                                onClick={() => setSelectedCodes(addPermissionCodes(selected, codes))}
                              >
                                {t("roles.permissions.moduleSelectAll")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={disabled || counts.none}
                                onClick={() => setSelectedCodes(removePermissionCodes(selected, codes))}
                              >
                                {t("roles.permissions.moduleClear")}
                              </Button>
                            </div>
                            <div className="grid gap-2 pb-3 md:grid-cols-2">
                              {module.permissions.map((permission) => {
                                const code = permission.code ?? permission.id;
                                const checked = selected.includes(code);
                                return (
                                  <div
                                    key={permission.id}
                                    role="checkbox"
                                    aria-checked={checked}
                                    tabIndex={disabled ? -1 : 0}
                                    data-permission-code={code}
                                    data-permission-selected={checked ? "true" : "false"}
                                    className={cn(
                                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                                      checked
                                        ? "border-primary/40 bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]"
                                        : "border-border/60 bg-background/40 hover:border-primary/25 hover:bg-muted/30",
                                      disabled && "cursor-not-allowed opacity-50",
                                    )}
                                    onClick={() => {
                                      if (!disabled) setSelectedCodes(togglePermissionCode(selected, code));
                                    }}
                                    onKeyDown={(event) => {
                                      if (disabled) return;
                                      if (event.key === " " || event.key === "Enter") {
                                        event.preventDefault();
                                        setSelectedCodes(togglePermissionCode(selected, code));
                                      }
                                    }}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      disabled={disabled}
                                      tabIndex={-1}
                                      className="pointer-events-none mt-0.5"
                                      aria-hidden
                                    />
                                    <PermissionLabel code={code} permission={permission} showDescription />
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export type RoleFormValues = {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
};

export function RoleIdentityFields({
  values,
  onChange,
  disabled,
}: {
  values: RoleFormValues;
  onChange: (values: RoleFormValues) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">{t("common.name")}</label>
        <Input
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          placeholder={t("forms.roles.namePlaceholder")}
          disabled={disabled}
          aria-label={t("common.name")}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">{t("common.description")}</label>
        <Input
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          placeholder={t("forms.roles.descriptionPlaceholder")}
          disabled={disabled}
          aria-label={t("common.description")}
        />
      </div>
    </div>
  );
}

type RoleFormFieldsProps = {
  values: RoleFormValues;
  onChange: (values: RoleFormValues) => void;
  permissions: PermissionRecord[];
  disabled?: boolean;
  permissionsLoading?: boolean;
  showIdentityFields?: boolean;
};

export function RoleFormFields({
  values,
  onChange,
  permissions,
  disabled,
  permissionsLoading,
  showIdentityFields = true,
}: RoleFormFieldsProps) {
  const { t } = useTranslation("common");
  const { developerMode } = useRbacDeveloperMode();
  usePermissionCatalogLanguageVersion();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {showIdentityFields ? (
        <RoleIdentityFields values={values} onChange={onChange} disabled={disabled} />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="mb-2 text-sm font-semibold">{t("roles.permissions.title")}</p>

        {permissionsLoading ? (
          <div className="rounded-xl border border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
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

        {developerMode ? (
          <p className="mt-2 text-xs text-amber-400/90">{t("roles.permissions.developerModeHint")}</p>
        ) : null}
      </div>
    </div>
  );
}
