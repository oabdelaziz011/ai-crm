import type { TFunction } from "i18next";
import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ExternalLink, Pencil, Sparkles, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { useActiveAutomationFlows } from "@/hooks/channels/use-channel-workflow-binding";
import type { AiEmployeeRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import { ChannelRoutingTagsField } from "@/lib/ai-employees/components/channel-routing-tags-field";
import { SystemPromptEditor } from "@/lib/ai-employees/components/system-prompt-editor";
import { useAiSkillOptions, useCreateAiSkill } from "@/lib/ai-employees/hooks/use-ai-employee-skills";
import type { AiEmployeeFormValues, AiSkillRecord } from "@/lib/ai-employees/types";
import type { KnowledgeSourceOption, ToolDefinitionOption } from "@/lib/ai-employees/types";
import {
  clearAvailableToolKeys,
  groupAvailableToolsByCapability,
  isWebhookFacingEmployee,
  resolveAvailableEmployeeTools,
  selectAllAvailableToolKeys,
  splitAssignedToolKeys,
  toggleAvailableToolKey,
  type AiEmployeeCapabilityGroupId,
} from "@/lib/ai-employees/utilities/ai-employee-capability-catalog";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { formatToolNameLabel } from "@/lib/ai-employees/utilities/format-tool-label";
import {
  AI_EMPLOYEE_MODEL_SUGGESTIONS,
  AI_EMPLOYEE_PROMPT_TEMPLATE_KEYS,
  type AiEmployeePromptTemplateKey,
} from "@/lib/ai-employees/utilities/prompt-templates";
import { resolveFormRuntimeConfiguration } from "@/lib/ai-employees/validators/ai-employee-validators";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import { cn } from "@/lib/utils";

export type AiEmployeeWizardStep =
  | "general"
  | "prompt"
  | "intelligence"
  | "provider"
  | "model"
  | "knowledge"
  | "tools"
  | "channels"
  | "review";

type AiEmployeeFormSectionsProps = {
  step: AiEmployeeWizardStep | "edit";
  values: AiEmployeeFormValues;
  companyId: string | null;
  ownerOptions: Array<{ id: string; label: string }>;
  knowledgeOptions: KnowledgeSourceOption[];
  toolOptions: ToolDefinitionOption[];
  onChange: (patch: Partial<AiEmployeeFormValues>) => void;
  /** Optional review extras from persisted employee (never invented). */
  reviewContext?: {
    employeeId?: string | null;
    transferableFlowId?: string | null;
  };
  /** When false, assigned skills are shown but cannot be changed. */
  skillsEditable?: boolean;
  /** Review step "Edit" buttons jump back to the owning step. */
  onJumpToStep?: (step: AiEmployeeWizardStep) => void;
};

/** Tools a workflow transfer needs; added automatically when a transferable flow is picked. */
const WORKFLOW_TRANSFER_TOOL_KEYS = [
  "transfer_to_workflow",
  "search_availability",
  "create_booking",
  "find_next_available",
] as const;

const NO_FLOW_VALUE = "__none__";

export function AiEmployeeFormSections({
  step,
  values,
  companyId,
  ownerOptions,
  knowledgeOptions,
  toolOptions,
  onChange,
  skillsEditable = true,
  onJumpToStep,
}: AiEmployeeFormSectionsProps) {
  const { t } = useTranslation("common");
  const runtime = useMemo(
    () => resolveFormRuntimeConfiguration(values.runtimeConfiguration),
    [values.runtimeConfiguration],
  );
  const patchRuntime = (patch: Partial<AiEmployeeRuntimeConfiguration>) =>
    onChange({ runtimeConfiguration: { ...runtime, ...patch } });
  const flowsQuery = useActiveAutomationFlows(companyId);
  const skillsQuery = useAiSkillOptions(companyId);
  const selectedFlowName = useMemo(() => {
    const id = runtime.transferableFlowId;
    if (!id) return null;
    return (flowsQuery.data ?? []).find((flow) => flow.id === id)?.name ?? id;
  }, [flowsQuery.data, runtime.transferableFlowId]);
  const {
    data: connections = [],
    isLoading: connectionsLoading,
    isError: connectionsFailed,
    error: connectionsError,
    refetch: refetchConnections,
  } = useAiProviderConnectionsAdmin(companyId);
  const { data: entitlements = [], isLoading: entitlementsLoading } = useCompanyEntitlements(
    companyId,
    Boolean(companyId),
  );

  const enabledFeatureCodes = useMemo(
    () => entitlements.filter((row) => row.enabled).map((row) => row.feature_code),
    [entitlements],
  );

  const webhookFacing = useMemo(
    () => isWebhookFacingEmployee(values.tags),
    [values.tags],
  );

  const availableTools = useMemo(
    () =>
      resolveAvailableEmployeeTools({
        enabledFeatureCodes,
        catalogTools: toolOptions,
        webhookFacing,
      }),
    [enabledFeatureCodes, toolOptions, webhookFacing],
  );

  const availableToolKeys = useMemo(
    () => availableTools.map((tool) => tool.key),
    [availableTools],
  );

  const { unavailableAssigned } = useMemo(
    () => splitAssignedToolKeys(values.allowedToolKeys, availableToolKeys),
    [values.allowedToolKeys, availableToolKeys],
  );

  const groupedAvailableTools = useMemo(
    () => groupAvailableToolsByCapability(availableTools),
    [availableTools],
  );

  /** One selectable provider type per company — duplicates share the same runtime key. */
  const providerOptions = useMemo(() => {
    const enabled = connections.filter((connection) => connection.is_enabled);
    const byKey = new Map<
      string,
      { key: string; label: string; connectionCount: number; isDefault: boolean }
    >();

    for (const connection of enabled) {
      const key = connection.ai_provider_definition?.key?.trim();
      if (!key) continue;

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          label: connection.display_name,
          connectionCount: 1,
          isDefault: Boolean(connection.is_default),
        });
        continue;
      }

      existing.connectionCount += 1;
      // Prefer the company default connection's display name.
      if (connection.is_default && !existing.isDefault) {
        existing.label = connection.display_name;
        existing.isDefault = true;
      }
    }

    // If a key has duplicates and no marked default, use pickDefaultConnection label.
    for (const [key, option] of byKey) {
      if (option.isDefault) continue;
      const group = enabled.filter((c) => c.ai_provider_definition?.key === key);
      const preferred = pickDefaultConnection(group);
      if (preferred) {
        option.label = preferred.display_name;
      }
    }

    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [connections]);

  if (step === "general" || step === "edit") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label={t("aiEmployees.form.displayName")} htmlFor="displayName">
          <Input
            id="displayName"
            value={values.displayName}
            onChange={(event) => onChange({ displayName: event.target.value })}
            className="rounded-xl"
          />
        </Field>
        <Field label={t("aiEmployees.form.internalName")} htmlFor="name">
          <Input
            id="name"
            value={values.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={t("aiEmployees.form.internalNamePlaceholder")}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">{t("aiEmployees.form.internalNameHint")}</p>
        </Field>
        <Field label={t("aiEmployees.form.department")} htmlFor="department">
          <Input
            id="department"
            value={values.department ?? ""}
            onChange={(event) => onChange({ department: event.target.value || null })}
            placeholder={t("aiEmployees.form.departmentPlaceholder")}
            className="rounded-xl"
          />
        </Field>
        <Field label={t("aiEmployees.form.owner")}>
          <Select
            value={values.ownerId ?? "none"}
            onValueChange={(value) => onChange({ ownerId: value === "none" ? null : value })}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={t("aiEmployees.form.selectOwner")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("aiEmployees.form.noOwner")}</SelectItem>
              {ownerOptions.map((owner) => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {values.status === "published" || values.status === "archived" ? (
          <Field label={t("aiEmployees.form.status")}>
            <div className="rounded-xl border border-border/50 bg-transparent px-3 py-2 text-sm">
              {t(`aiEmployees.status.${values.status}`)}
              <p className="mt-1 text-xs text-muted-foreground">
                {t("aiEmployees.form.statusLifecycleHint")}
              </p>
            </div>
          </Field>
        ) : (
          <Field label={t("aiEmployees.form.status")}>
            <Select
              value={values.status}
              onValueChange={(value) =>
                onChange({ status: value as AiEmployeeFormValues["status"] })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("aiEmployees.status.draft")}</SelectItem>
                <SelectItem value="disabled">{t("aiEmployees.status.disabled")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label={t("aiEmployees.form.avatarUrl")} htmlFor="avatar">
          <Input
            id="avatar"
            value={values.avatar ?? ""}
            onChange={(event) => onChange({ avatar: event.target.value || null })}
            placeholder={t("aiEmployees.form.avatarUrlPlaceholder")}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">{t("aiEmployees.form.avatarUrlHint")}</p>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <p className="mb-2 text-sm text-muted-foreground">{t("aiEmployees.form.descriptionHint")}</p>
          <Field label={t("aiEmployees.form.description")} htmlFor="description">
            <Textarea
              id="description"
              value={values.description}
              onChange={(event) => onChange({ description: event.target.value })}
              className="min-h-28 rounded-xl"
            />
          </Field>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label={t("aiEmployees.form.welcomeMessage")} htmlFor="welcomeMessage">
            <Textarea
              id="welcomeMessage"
              value={values.welcomeMessage}
              onChange={(event) => onChange({ welcomeMessage: event.target.value })}
              placeholder={t("aiEmployees.form.welcomeMessagePlaceholder")}
              className="min-h-28 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{t("aiEmployees.form.welcomeMessageHint")}</p>
          </Field>
        </div>
      </div>
    );
  }

  if (step === "channels") {
    return (
      <div className="space-y-4">
        <ChannelRoutingTagsField
          tags={values.tags}
          onChange={(nextTags) => onChange({ tags: nextTags })}
        />
        <div className="space-y-3 rounded-2xl border border-border/50 bg-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Workflow className="size-4" aria-hidden />
            </div>
            <div className="space-y-1">
              <Label htmlFor="transferable-flow">
                {t("aiEmployees.channelBinding.transferableFlow.title")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("aiEmployees.channelBinding.transferableFlow.hint")}
              </p>
            </div>
          </div>
          <Select
            value={runtime.transferableFlowId ?? NO_FLOW_VALUE}
            onValueChange={(value) => {
              const nextId = value === NO_FLOW_VALUE ? null : value;
              const nextKeys = new Set(values.allowedToolKeys);
              if (nextId) {
                for (const key of WORKFLOW_TRANSFER_TOOL_KEYS) nextKeys.add(key);
              }
              onChange({
                allowedToolKeys: [...nextKeys],
                runtimeConfiguration: {
                  ...runtime,
                  transferableFlowId: nextId,
                  disabledToolKeys: nextId
                    ? runtime.disabledToolKeys.filter(
                        (key) => !(WORKFLOW_TRANSFER_TOOL_KEYS as readonly string[]).includes(key),
                      )
                    : runtime.disabledToolKeys,
                },
              });
            }}
            disabled={flowsQuery.isLoading}
          >
            <SelectTrigger
              id="transferable-flow"
              data-testid="transferable-flow-select"
              className="max-w-xl rounded-xl"
            >
              <SelectValue placeholder={t("aiEmployees.channelBinding.transferableFlow.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FLOW_VALUE}>
                {t("aiEmployees.channelBinding.transferableFlow.none")}
              </SelectItem>
              {runtime.transferableFlowId &&
              !(flowsQuery.data ?? []).some((flow) => flow.id === runtime.transferableFlowId) ? (
                <SelectItem value={runtime.transferableFlowId}>{selectedFlowName}</SelectItem>
              ) : null}
              {(flowsQuery.data ?? []).map((flow) => (
                <SelectItem key={flow.id} value={flow.id}>
                  {flow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!flowsQuery.isLoading && (flowsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("aiEmployees.form.workflowTransfer.noFlows")}
            </p>
          ) : null}
          {runtime.transferableFlowId ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {t("aiEmployees.form.workflowTransfer.toolsAdded")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === "intelligence") {
    return (
      <div className="space-y-8">
        <AiEmployeeFormSections
          step="provider"
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={onChange}
        />
        <AiEmployeeFormSections
          step="model"
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={onChange}
        />
        <RuntimeLimitsFields runtime={runtime} onChange={patchRuntime} />
      </div>
    );
  }

  if (step === "provider") {
    return (
      <div className="max-w-xl space-y-4">
        <Field label={t("aiEmployees.form.providerConnection")}>
          <Select
            value={values.provider ?? ""}
            onValueChange={(value) => {
              onChange({ provider: value });
            }}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={t("aiEmployees.form.selectProvider")} />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {formatEmployeeProviderLabel(t, option.key)}
                  {option.isDefault
                    ? ` · ${t("aiEmployees.form.defaultProviderConnection")}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.providerHint")}</p>
        {connectionsLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("aiEmployees.form.providerConnectionsLoading")}
          </p>
        ) : connectionsFailed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-destructive/40 px-4 py-3 text-sm text-destructive">
            <span>
              {t("aiEmployees.form.providerConnectionsLoadFailed", {
                error: connectionsError instanceof Error ? connectionsError.message : String(connectionsError),
              })}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetchConnections()}>
              {t("aiEmployees.form.retryProviderConnections")}
            </Button>
          </div>
        ) : providerOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-amber-500/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            {t("aiEmployees.form.noProviderConnections")}
          </p>
        ) : null}
      </div>
    );
  }

  if (step === "model") {
    const suggestedModels =
      AI_EMPLOYEE_MODEL_SUGGESTIONS[values.provider?.trim().toLowerCase() ?? ""] ??
      AI_EMPLOYEE_MODEL_SUGGESTIONS.openai;

    return (
      <div className="max-w-4xl space-y-4">
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.modelHint")}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label={t("aiEmployees.form.model")} htmlFor="model">
            <Input
              id="model"
              list="ai-employee-model-suggestions"
              value={values.model ?? ""}
              onChange={(event) => onChange({ model: event.target.value || null })}
              placeholder={suggestedModels[0]}
              className="rounded-xl"
            />
            <datalist id="ai-employee-model-suggestions">
              {suggestedModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </Field>
          <Field label={t("aiEmployees.form.temperature")} htmlFor="temperature">
            <Input
              id="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={values.temperature ?? ""}
              onChange={(event) =>
                onChange({ temperature: event.target.value ? Number(event.target.value) : null })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{t("aiEmployees.form.temperatureHint")}</p>
          </Field>
          <Field label={t("aiEmployees.form.maxTokens")} htmlFor="maxTokens">
            <Input
              id="maxTokens"
              type="number"
              min={1}
              value={values.maxTokens ?? ""}
              onChange={(event) =>
                onChange({ maxTokens: event.target.value ? Number(event.target.value) : null })
              }
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{t("aiEmployees.form.maxTokensHint")}</p>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestedModels.map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => onChange({ model })}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs transition-colors",
                values.model === model
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {model}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === "prompt") {
    const applyTemplate = (key: AiEmployeePromptTemplateKey) => {
      onChange({
        systemPrompt: t(`aiEmployees.form.promptTemplates.${key}.body`),
      });
    };

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("aiEmployees.form.promptTemplates.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.form.promptTemplates.hint")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {AI_EMPLOYEE_PROMPT_TEMPLATE_KEYS.map((key) => {
              const templateBody = t(`aiEmployees.form.promptTemplates.${key}.body`);
              const active = values.systemPrompt.trim() === templateBody.trim();
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-start transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/60 hover:border-primary/30",
                  )}
                >
                  <p className="text-sm font-medium">
                    {t(`aiEmployees.form.promptTemplates.${key}.title`)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`aiEmployees.form.promptTemplates.${key}.summary`)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <Field label={t("aiEmployees.form.systemPrompt")} htmlFor="systemPrompt">
          <SystemPromptEditor
            id="systemPrompt"
            value={values.systemPrompt}
            placeholder={t("aiEmployees.form.systemPromptPlaceholder")}
            onChange={(systemPrompt) => onChange({ systemPrompt })}
          />
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.form.promptTemplates.editHint")}
          </p>
        </Field>

        <div className="max-w-xs">
          <Field label={t("aiEmployees.config.fields.promptVersion")} htmlFor="promptVersionLabel">
            <Input
              id="promptVersionLabel"
              value={values.promptVersionLabel ?? ""}
              onChange={(event) => onChange({ promptVersionLabel: event.target.value })}
              placeholder="v1"
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">{t("aiEmployees.form.promptVersionHint")}</p>
          </Field>
        </div>
      </div>
    );
  }

  if (step === "knowledge") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.knowledgeHint")}</p>
        {knowledgeOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center">
            <BookOpen className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">{t("aiEmployees.form.knowledgeEmpty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("aiEmployees.form.knowledgeEmptyHint")}</p>
            <Button asChild className="mt-4 rounded-xl" variant="default">
              <Link href="~/dashboard/knowledge/new">
                <ExternalLink className="me-2 size-4" />
                {t("aiEmployees.form.openKnowledgeModule")}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("aiEmployees.form.knowledgeManageHint")}</p>
              <Button asChild size="sm" variant="outline" className="rounded-xl">
                <Link href="~/dashboard/knowledge/new">
                  <ExternalLink className="me-1.5 size-3.5" />
                  {t("aiEmployees.form.openKnowledgeModule")}
                </Link>
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {knowledgeOptions.map((source) => {
                const checked = values.knowledgeSourceIds.includes(source.id);
                return (
                  <label
                    key={source.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        onChange({
                          knowledgeSourceIds: next
                            ? [...values.knowledgeSourceIds, source.id]
                            : values.knowledgeSourceIds.filter((id) => id !== source.id),
                        });
                      }}
                    />
                    <span className="text-sm">{source.name}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === "tools") {
    const aiEmployeeEnabled = enabledFeatureCodes.includes("ai_employee");
    const pausedToolKeys = new Set(runtime.disabledToolKeys);
    const withoutPaused = (keys: readonly string[]) =>
      runtime.disabledToolKeys.filter((key) => !keys.includes(key));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{t("aiEmployees.form.toolsHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={availableToolKeys.length === 0}
              onClick={() =>
                onChange({
                  allowedToolKeys: selectAllAvailableToolKeys(
                    values.allowedToolKeys,
                    availableToolKeys,
                  ),
                  runtimeConfiguration: {
                    ...runtime,
                    disabledToolKeys: withoutPaused(availableToolKeys),
                  },
                })
              }
            >
              {t("aiEmployees.form.toolsSelectAllAvailable")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={availableToolKeys.length === 0 && values.allowedToolKeys.length === 0}
              onClick={() =>
                onChange({
                  allowedToolKeys: clearAvailableToolKeys(
                    values.allowedToolKeys,
                    availableToolKeys,
                  ),
                  runtimeConfiguration: {
                    ...runtime,
                    disabledToolKeys: withoutPaused(availableToolKeys),
                  },
                })
              }
            >
              {t("aiEmployees.form.toolsClearAll")}
            </Button>
          </div>
        </div>

        {!aiEmployeeEnabled && !entitlementsLoading ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("aiEmployees.form.toolsAiEmployeeRequired")}
          </p>
        ) : null}

        {aiEmployeeEnabled && availableTools.length === 0 && !entitlementsLoading ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("aiEmployees.form.toolsEmptyEntitled")}
          </p>
        ) : null}

        {entitlementsLoading ? (
          <p className="text-sm text-muted-foreground">{t("aiEmployees.form.toolsLoading")}</p>
        ) : null}

        {groupedAvailableTools.map((group) => (
          <div key={group.group} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatCapabilityGroupLabel(t, group.group)}
            </p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.group === "products" ? (
                <label className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2 md:col-span-2 xl:col-span-3">
                  <Checkbox
                    checked={runtime.showProductPrices === true}
                    onCheckedChange={(next) =>
                      onChange({
                        runtimeConfiguration: {
                          ...runtime,
                          showProductPrices: next === true,
                        },
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {t("aiEmployees.form.showProductPrices")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("aiEmployees.form.showProductPricesHint")}
                    </span>
                  </span>
                </label>
              ) : null}
              {group.tools.map((tool) => {
                const checked =
                  values.allowedToolKeys.includes(tool.key) && !pausedToolKeys.has(tool.key);
                return (
                  <label
                    key={tool.key}
                    className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        onChange({
                          allowedToolKeys: toggleAvailableToolKey(
                            values.allowedToolKeys,
                            availableToolKeys,
                            tool.key,
                            Boolean(next),
                          ),
                          runtimeConfiguration: {
                            ...runtime,
                            disabledToolKeys: withoutPaused([tool.key]),
                          },
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {formatToolNameLabel(t, tool.key, tool.displayName)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatToolDescriptionLabel(t, tool.key, tool.description)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {unavailableAssigned.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {t("aiEmployees.form.toolsUnavailableTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("aiEmployees.form.toolsUnavailableHint")}
            </p>
            <ul className="space-y-1">
              {unavailableAssigned.map((toolKey) => (
                <li key={toolKey} className="text-sm text-muted-foreground">
                  {formatToolNameLabel(t, toolKey)}
                  <span className="ms-2 text-xs">
                    ({t("aiEmployees.form.toolsUnavailableBadge")})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <SkillsPickerSection
          companyId={companyId}
          skills={skillsQuery.data ?? []}
          isLoading={skillsQuery.isLoading}
          selectedIds={values.allowedSkillIds ?? []}
          editable={skillsEditable}
          onChange={(allowedSkillIds) => onChange({ allowedSkillIds })}
        />
      </div>
    );
  }

  const activeToolCount = values.allowedToolKeys.filter(
    (key) => !runtime.disabledToolKeys.includes(key),
  ).length;
  const jumpAction = (target: AiEmployeeWizardStep, label?: string) =>
    onJumpToStep ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-8 rounded-lg px-2 text-xs"
        onClick={() => onJumpToStep(target)}
      >
        <Pencil className="me-1.5 size-3.5" />
        {label ?? t("aiEmployees.wizard.review.editStep")}
      </Button>
    ) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("aiEmployees.wizard.review.intro")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.general")}
          state={values.displayName.trim() ? "configured" : "missing"}
          detail={values.displayName || "—"}
          action={jumpAction("general")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.prompt")}
          state={values.systemPrompt.trim() ? "configured" : "missing"}
          detail={
            values.systemPrompt.trim()
              ? `${t("aiEmployees.wizard.review.promptVersion", {
                  version: values.promptVersionLabel?.trim() || "v1",
                })} · ${values.systemPrompt.slice(0, 120)}`
              : undefined
          }
          action={jumpAction("prompt")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.provider")}
          state={values.provider?.trim() ? "configured" : "warning"}
          detail={formatEmployeeProviderLabel(t, values.provider) || "—"}
          action={jumpAction("intelligence")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.model")}
          state={values.model?.trim() ? "configured" : "warning"}
          detail={
            values.model?.trim()
              ? [
                  values.model.trim(),
                  values.temperature != null
                    ? `${t("aiEmployees.form.temperature")} ${values.temperature}`
                    : null,
                  values.maxTokens != null
                    ? `${t("aiEmployees.form.maxTokens")} ${values.maxTokens}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "—"
          }
          action={jumpAction("intelligence")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.review.runtime")}
          state="configured"
          detail={formatRuntimeSummary(t, runtime)}
          action={jumpAction("intelligence")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.knowledge")}
          state={values.knowledgeSourceIds.length > 0 ? "configured" : "optional"}
          detail={t("aiEmployees.form.selectedCount", { count: values.knowledgeSourceIds.length })}
          action={jumpAction("knowledge")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.tools")}
          state={activeToolCount > 0 ? "configured" : "optional"}
          detail={t("aiEmployees.form.selectedCount", { count: activeToolCount })}
          action={jumpAction("tools")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.review.skills")}
          state={(values.allowedSkillIds ?? []).length > 0 ? "configured" : "optional"}
          detail={t("aiEmployees.form.selectedCount", {
            count: (values.allowedSkillIds ?? []).length,
          })}
          action={jumpAction("tools")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.steps.channels")}
          state={
            values.tags.some((tag) => tag.startsWith("channel:")) ? "configured" : "warning"
          }
          detail={
            values.tags.length > 0
              ? values.tags.map((tag) => formatEmployeeTagLabel(t, tag)).join(" · ")
              : t("aiEmployees.form.channelRouting.noneSelected")
          }
          action={jumpAction("channels")}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.review.workflows")}
          state={selectedFlowName ? "configured" : "optional"}
          detail={
            selectedFlowName
              ? t("aiEmployees.wizard.review.workflowsConfigured", { id: selectedFlowName })
              : t("aiEmployees.wizard.review.workflowsEmpty")
          }
          action={jumpAction("channels", t("aiEmployees.wizard.review.configureWorkflows"))}
        />
        <ReviewStatusCard
          label={t("aiEmployees.wizard.review.lifecycle")}
          state={values.status === "published" ? "configured" : "warning"}
          detail={t(`aiEmployees.status.${values.status}`, {
            defaultValue: values.status,
          })}
        />
      </div>
      <p className="rounded-xl border border-primary/20 bg-transparent px-4 py-3 text-xs text-muted-foreground">
        {t("aiEmployees.form.channelRouting.publishHint")}
      </p>
      <p className="text-xs text-muted-foreground">{t("aiEmployees.wizard.review.lifecycleReminder")}</p>
    </div>
  );
}

function formatRuntimeSummary(
  t: TFunction<"common">,
  runtime: AiEmployeeRuntimeConfiguration,
): string {
  return t("aiEmployees.form.runtime.summary", {
    timeout: Math.round(runtime.executionTimeoutMs / 1000),
    retries: runtime.retryCount,
    rate: runtime.rateLimitPerMinute,
    session: runtime.sessionTimeoutMinutes,
  });
}

function readNumberInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function numberInputValue(value: number): number | "" {
  return Number.isFinite(value) ? value : "";
}

function RuntimeLimitsFields({
  runtime,
  onChange,
}: {
  runtime: AiEmployeeRuntimeConfiguration;
  onChange: (patch: Partial<AiEmployeeRuntimeConfiguration>) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="max-w-4xl rounded-2xl border border-border/50 bg-transparent"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
        >
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t("aiEmployees.form.runtime.title")}</span>
            <span className="block text-xs text-muted-foreground">
              {formatRuntimeSummary(t, runtime)}
            </span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-border/50 px-4 py-4">
          <p className="text-xs text-muted-foreground">{t("aiEmployees.form.runtime.hint")}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label={t("aiEmployees.form.runtime.executionTimeoutSeconds")} htmlFor="executionTimeoutSeconds">
              <Input
                id="executionTimeoutSeconds"
                type="number"
                min={1}
                value={numberInputValue(runtime.executionTimeoutMs / 1000)}
                onChange={(event) =>
                  onChange({ executionTimeoutMs: readNumberInput(event.target.value) * 1000 })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t("aiEmployees.form.runtime.executionTimeoutHint")}
              </p>
            </Field>
            <Field label={t("aiEmployees.form.runtime.retryCount")} htmlFor="retryCount">
              <Input
                id="retryCount"
                type="number"
                min={0}
                max={10}
                value={numberInputValue(runtime.retryCount)}
                onChange={(event) => onChange({ retryCount: readNumberInput(event.target.value) })}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">{t("aiEmployees.form.runtime.retryCountHint")}</p>
            </Field>
            <Field label={t("aiEmployees.form.runtime.rateLimitPerMinute")} htmlFor="rateLimitPerMinute">
              <Input
                id="rateLimitPerMinute"
                type="number"
                min={1}
                value={numberInputValue(runtime.rateLimitPerMinute)}
                onChange={(event) =>
                  onChange({ rateLimitPerMinute: readNumberInput(event.target.value) })
                }
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t("aiEmployees.form.runtime.rateLimitHint")}
              </p>
            </Field>
            <Field label={t("aiEmployees.form.runtime.maxConcurrency")} htmlFor="maxConcurrency">
              <Input
                id="maxConcurrency"
                type="number"
                min={1}
                value={numberInputValue(runtime.maxConcurrency)}
                onChange={(event) => onChange({ maxConcurrency: readNumberInput(event.target.value) })}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t("aiEmployees.form.runtime.maxConcurrencyHint")}
              </p>
            </Field>
            <Field label={t("aiEmployees.config.fields.sessionTimeoutMinutes")} htmlFor="sessionTimeoutMinutes">
              <Input
                id="sessionTimeoutMinutes"
                type="number"
                min={1}
                value={numberInputValue(runtime.sessionTimeoutMinutes)}
                onChange={(event) =>
                  onChange({ sessionTimeoutMinutes: readNumberInput(event.target.value) })
                }
                className="rounded-xl"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.config.fields.sessionTimeoutMinutesHint")}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SkillsPickerSection({
  companyId,
  skills,
  isLoading,
  selectedIds,
  editable,
  onChange,
}: {
  companyId: string | null;
  skills: AiSkillRecord[];
  isLoading: boolean;
  selectedIds: string[];
  editable: boolean;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation("common");
  const createSkill = useCreateAiSkill(companyId);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [skillError, setSkillError] = useState<string | null>(null);
  const knownIds = new Set(skills.map((skill) => skill.id));
  const missingSelected = selectedIds.filter((id) => !knownIds.has(id));

  const addSkill = async () => {
    const displayName = skillName.trim();
    if (!displayName || createSkill.isPending) return;
    setSkillError(null);
    try {
      const created = await createSkill.mutateAsync({
        displayName,
        description: skillDescription.trim(),
      });
      onChange([...new Set([...selectedIds, created.id])]);
      setSkillName("");
      setSkillDescription("");
    } catch {
      setSkillError(t("aiEmployees.form.skills.addError"));
    }
  };

  return (
    <div className="space-y-3 border-t border-border/50 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("aiEmployees.form.skills.title")}</p>
            <p className="max-w-2xl text-xs text-muted-foreground">{t("aiEmployees.form.skills.hint")}</p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-lg">
          {t("aiEmployees.form.selectedCount", { count: selectedIds.length })}
        </Badge>
      </div>

      {!editable ? (
        <p className="text-xs text-muted-foreground">{t("aiEmployees.form.skills.readOnly")}</p>
      ) : null}

      {!isLoading && skills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("aiEmployees.form.skills.empty")}
        </p>
      ) : null}

      {editable ? (
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Input
            value={skillName}
            onChange={(event) => setSkillName(event.target.value)}
            placeholder={t("aiEmployees.form.skills.addPlaceholder")}
            className="rounded-xl"
            aria-label={t("aiEmployees.form.skills.addPlaceholder")}
          />
          <Input
            value={skillDescription}
            onChange={(event) => setSkillDescription(event.target.value)}
            placeholder={t("aiEmployees.form.skills.addDescriptionPlaceholder")}
            className="rounded-xl"
            aria-label={t("aiEmployees.form.skills.addDescriptionPlaceholder")}
          />
          <Button
            type="button"
            className="rounded-xl"
            disabled={!skillName.trim() || createSkill.isPending}
            onClick={() => void addSkill()}
          >
            {createSkill.isPending
              ? t("aiEmployees.form.skills.adding")
              : t("aiEmployees.form.skills.addAction")}
          </Button>
        </div>
      ) : null}
      {skillError ? <p className="text-xs text-destructive">{skillError}</p> : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.skills.loading")}</p>
      ) : skills.length === 0 ? null : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => {
            const checked = selectedIds.includes(skill.id);
            return (
              <label
                key={skill.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2",
                  !editable && "opacity-80",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={!editable}
                  onCheckedChange={(next) =>
                    onChange(
                      next
                        ? [...new Set([...selectedIds, skill.id])]
                        : selectedIds.filter((id) => id !== skill.id),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{skill.displayName}</span>
                    {skill.category ? (
                      <Badge variant="secondary" className="rounded-md text-[10px]">
                        {skill.category}
                      </Badge>
                    ) : null}
                  </span>
                  {skill.description ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {skill.description}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {missingSelected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("aiEmployees.form.skills.unavailableKept", { count: missingSelected.length })}
        </p>
      ) : null}
    </div>
  );
}

function formatCapabilityGroupLabel(
  t: TFunction<"common">,
  group: AiEmployeeCapabilityGroupId,
): string {
  return t(`aiEmployees.form.capabilityGroups.${group}`);
}

function formatToolDescriptionLabel(
  t: TFunction<"common">,
  toolKey: string,
  fallback?: string | null,
): string {
  return t(`aiEmployees.tools.descriptions.${toolKey}`, {
    defaultValue: fallback?.trim() || t("aiEmployees.form.toolsDefaultDescription"),
  });
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ReviewStatusCard({
  label,
  state,
  detail,
  action,
}: {
  label: string;
  state: "configured" | "missing" | "warning" | "optional";
  detail?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation("common");
  const tone =
    state === "configured"
      ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
      : state === "missing"
        ? "border-destructive/40 text-destructive"
        : state === "warning"
          ? "border-amber-500/40 text-amber-800 dark:text-amber-200"
          : "border-border/50 text-muted-foreground";

  return (
    <div className={cn("rounded-xl border bg-transparent p-4", tone)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <span className="text-[11px] font-medium">
          {t(`aiEmployees.wizard.review.state.${state}`)}
        </span>
      </div>
      {detail ? <p className="mt-2 break-all text-sm text-foreground">{detail}</p> : null}
      {action}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-border/50 bg-transparent p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value?.trim() || "—"}</p>
    </div>
  );
}

export function AiEmployeeEditSections(props: Omit<AiEmployeeFormSectionsProps, "step">) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {tSafeDisplayName(props.values.displayName)}
        </h3>
        <AiEmployeeFormSections {...props} step="general" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="prompt" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="intelligence" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="knowledge" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="tools" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="channels" />
      </section>
    </div>
  );
}

function tSafeDisplayName(name: string): string {
  return name.trim() || "—";
}
