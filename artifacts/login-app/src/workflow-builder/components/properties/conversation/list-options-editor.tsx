import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import {
  createDefaultListLookupConfig,
  readListDataSourceMode,
  readListLookupConfig,
} from "../../../core/conversation/list-node-config";
import {
  getLookupEntityDefinition,
  getLookupEntityDefinitions,
  isLookupEntityId,
  readLookupPreviewValues,
  useLookupOptionsPreview,
  type ListDataSourceMode,
} from "@/lib/lookups";
import { ListRowsEditor } from "../property-editors";

function readRowsPreview(config: Record<string, unknown>) {
  if (!Array.isArray(config._lookupPreviewRows)) return [];
  return config._lookupPreviewRows as Array<{ id: string; title?: string }>;
}

export function ListOptionsEditor(props: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const mode = readListDataSourceMode(props.config);
  const lookupConfig = readListLookupConfig(props.config);
  const previewValues = readLookupPreviewValues(props.config);
  const {
    data: lookupRows = [],
    isLoading,
    isFetching,
    error,
    previewState,
    unresolvedKeys,
    hasTemplateTokens,
  } = useLookupOptionsPreview(lookupConfig, previewValues);

  useEffect(() => {
    if (mode !== "lookup") return;
    if (previewState === "deferred") {
      if (readRowsPreview(props.config).length > 0) {
        props.onChange({ _lookupPreviewRows: [] });
      }
      return;
    }
    const nextPreview = lookupRows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      value: row.value ?? row.id,
    }));
    const currentPreview = Array.isArray(props.config._lookupPreviewRows)
      ? (props.config._lookupPreviewRows as Array<{ id: string }>)
      : [];
    if (
      currentPreview.length === nextPreview.length &&
      currentPreview.every((row, index) => row.id === nextPreview[index]?.id)
    ) {
      return;
    }
    props.onChange({ _lookupPreviewRows: nextPreview });
  }, [lookupRows, mode, previewState, props.config._lookupPreviewRows, props.onChange]);

  const definition = useMemo(
    () => (lookupConfig ? getLookupEntityDefinition(lookupConfig.lookup) : null),
    [lookupConfig],
  );

  const setMode = (nextMode: ListDataSourceMode) => {
    if (nextMode === "lookup") {
      const defaults = createDefaultListLookupConfig();
      const definition = getLookupEntityDefinition(defaults.lookup);
      props.onChange({
        mode: "lookup",
        lookup: defaults.lookup,
        displayField: defaults.displayField,
        valueField: defaults.valueField,
        filters: defaults.filters ?? {},
        outputVariable: definition.variableName,
        saveAs: definition.variableName,
        inputKey: definition.variableName,
      });
      return;
    }
    props.onChange({ mode: "manual" });
  };

  const updateLookup = (patch: Record<string, unknown>) => {
    props.onChange(patch);
  };

  const updatePreviewValue = (key: string, value: string) => {
    const current = readLookupPreviewValues(props.config);
    props.onChange({
      _lookupPreviewValues: {
        ...current,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.dataSource")}</Label>
        <Select value={mode} onValueChange={(value) => setMode(value as ListDataSourceMode)}>
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t("workflowBuilder.logic.dataSourceManual")}</SelectItem>
            <SelectItem value="lookup">{t("workflowBuilder.logic.dataSourceLookup")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "manual" ? (
        <ListRowsEditor {...props} />
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-background/40 p-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("workflowBuilder.logic.lookupType")}</Label>
            <Select
              value={lookupConfig?.lookup ?? "services"}
              onValueChange={(value) => {
                if (!isLookupEntityId(value)) return;
                const next = createDefaultListLookupConfig(value);
                const definition = getLookupEntityDefinition(value);
                updateLookup({
                  lookup: next.lookup,
                  displayField: next.displayField,
                  valueField: next.valueField,
                  filters: next.filters ?? {},
                  outputVariable: definition.variableName,
                  saveAs: definition.variableName,
                  inputKey: definition.variableName,
                });
              }}
            >
              <SelectTrigger className="rounded-xl bg-background/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getLookupEntityDefinitions().map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {t(entry.labelKey, { defaultValue: entry.id })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {definition && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("workflowBuilder.logic.displayField")}</Label>
                  <Select
                    value={lookupConfig?.displayField ?? definition.defaultDisplayField}
                    onValueChange={(value) => updateLookup({ displayField: value })}
                  >
                    <SelectTrigger className="rounded-xl bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {definition.displayFields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {t(field.labelKey, { defaultValue: field.id })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("workflowBuilder.logic.valueField")}</Label>
                  <Select
                    value={lookupConfig?.valueField ?? definition.defaultValueField}
                    onValueChange={(value) => updateLookup({ valueField: value })}
                  >
                    <SelectTrigger className="rounded-xl bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {definition.valueFields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {t(field.labelKey, { defaultValue: field.id })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {definition.filters.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    {definition.computed
                      ? t("workflowBuilder.logic.lookupContext")
                      : t("workflowBuilder.logic.lookupFilters")}
                  </Label>
                  {definition.computed ? (
                    <p className="text-xs text-muted-foreground">
                      {t("workflowBuilder.logic.lookupContextHint")}
                    </p>
                  ) : null}
                  {definition.filters.map((filter) => (
                    <div key={filter.id} className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        {t(filter.labelKey, { defaultValue: filter.id })}
                      </Label>
                      {filter.type === "select" && filter.options ? (
                        <Select
                          value={String(lookupConfig?.filters?.[filter.id] ?? "__all__")}
                          onValueChange={(value) =>
                            updateLookup({
                              filters: {
                                ...(lookupConfig?.filters ?? {}),
                                [filter.id]: value === "__all__" ? undefined : value,
                              },
                            })
                          }
                        >
                          <SelectTrigger className="rounded-xl bg-background/80">
                            <SelectValue placeholder={t("workflowBuilder.logic.allValues")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">{t("workflowBuilder.logic.allValues")}</SelectItem>
                            {filter.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(option.labelKey, { defaultValue: option.value })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={String(lookupConfig?.filters?.[filter.id] ?? "")}
                          onChange={(event) =>
                            updateLookup({
                              filters: {
                                ...(lookupConfig?.filters ?? {}),
                                [filter.id]: event.target.value || undefined,
                              },
                            })
                          }
                          placeholder={
                            filter.id === "service_id"
                              ? "{{selected_service.id}}"
                              : filter.id === "resource_id"
                                ? "{{selected_resource.id}}"
                                : filter.id === "date"
                                  ? "{{selected_date}}"
                                  : undefined
                          }
                          className="rounded-xl bg-background/80 font-mono text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(definition.computed || hasTemplateTokens) && definition.filters.length > 0 && (
                <div className="space-y-3 rounded-xl border border-dashed border-border/50 bg-muted/10 p-3">
                  <div>
                    <Label className="text-sm font-medium">{t("workflowBuilder.logic.lookupPreviewValues")}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("workflowBuilder.logic.lookupPreviewValuesHint")}
                    </p>
                  </div>
                  {definition.filters.map((filter) => (
                    <div key={`preview-${filter.id}`} className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        {t("workflowBuilder.logic.lookupPreviewValueFor", {
                          field: t(filter.labelKey, { defaultValue: filter.id }),
                        })}
                      </Label>
                      <Input
                        value={previewValues[filter.id] ?? ""}
                        onChange={(event) => updatePreviewValue(filter.id, event.target.value)}
                        className="rounded-xl bg-background/80 font-mono text-sm"
                        placeholder={t("workflowBuilder.logic.lookupPreviewValuePlaceholder")}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("workflowBuilder.logic.lookupPreview")}</Label>
            {previewState === "deferred" ? (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm text-muted-foreground">
                <p>{t("workflowBuilder.logic.lookupPreviewDeferred")}</p>
                {unresolvedKeys.length > 0 && definition && (
                  <ul className="mt-2 list-disc ps-5 text-xs">
                    {unresolvedKeys.map((key) => {
                      const filterDef = definition.filters.find((entry) => entry.id === key);
                      return (
                        <li key={key}>
                          {filterDef
                            ? t(filterDef.labelKey, { defaultValue: key })
                            : key}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : isLoading || isFetching ? (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.logic.lookupLoading")}</p>
            ) : error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : lookupRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.logic.lookupEmpty")}</p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
                {lookupRows.slice(0, 12).map((row) => (
                  <div key={row.id} className="text-sm">
                    <span className="font-medium">{row.title}</span>
                    <span className="ms-2 text-xs text-muted-foreground">{row.value ?? row.id}</span>
                  </div>
                ))}
                {lookupRows.length > 12 && (
                  <p className="text-xs text-muted-foreground">
                    {t("workflowBuilder.logic.lookupPreviewMore", { count: lookupRows.length - 12 })}
                  </p>
                )}
              </div>
            )}
            {readRowsPreview(props.config).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("workflowBuilder.logic.lookupResolvedCount", {
                  count: readRowsPreview(props.config).length,
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
