import { useMemo } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { ChannelRoutingTagsField } from "@/lib/ai-employees/components/channel-routing-tags-field";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";
import type { KnowledgeSourceOption, ToolDefinitionOption } from "@/lib/ai-employees/types";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import {
  formatToolCategoryLabel,
  formatToolNameLabel,
  groupToolsByCategory,
} from "@/lib/ai-employees/utilities/format-tool-label";
import {
  AI_EMPLOYEE_MODEL_SUGGESTIONS,
  AI_EMPLOYEE_PROMPT_TEMPLATE_KEYS,
  type AiEmployeePromptTemplateKey,
} from "@/lib/ai-employees/utilities/prompt-templates";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import { cn } from "@/lib/utils";

export type AiEmployeeWizardStep =
  | "general"
  | "provider"
  | "model"
  | "prompt"
  | "knowledge"
  | "tools"
  | "review";

type AiEmployeeFormSectionsProps = {
  step: AiEmployeeWizardStep | "edit";
  values: AiEmployeeFormValues;
  companyId: string | null;
  ownerOptions: Array<{ id: string; label: string }>;
  knowledgeOptions: KnowledgeSourceOption[];
  toolOptions: ToolDefinitionOption[];
  onChange: (patch: Partial<AiEmployeeFormValues>) => void;
};

export function AiEmployeeFormSections({
  step,
  values,
  companyId,
  ownerOptions,
  knowledgeOptions,
  toolOptions,
  onChange,
}: AiEmployeeFormSectionsProps) {
  const { t } = useTranslation("common");
  const { data: connections = [] } = useAiProviderConnectionsAdmin(companyId);

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
          <ChannelRoutingTagsField
            tags={values.tags}
            onChange={(nextTags) => onChange({ tags: nextTags })}
          />
        </div>
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
        {providerOptions.length === 0 ? (
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
          <Textarea
            id="systemPrompt"
            value={values.systemPrompt}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
            className="min-h-56 rounded-xl text-sm"
            placeholder={t("aiEmployees.form.systemPromptPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.form.promptTemplates.editHint")}
          </p>
        </Field>
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
    const groupedTools = groupToolsByCategory(toolOptions);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.toolsHint")}</p>
        {toolOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("aiEmployees.form.toolsEmpty")}
          </p>
        ) : null}
        {groupedTools.map((group) => (
          <div key={group.category} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatToolCategoryLabel(t, group.category)}
            </p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.tools.map((tool) => {
                const checked = values.allowedToolKeys.includes(tool.key);
                return (
                  <label
                    key={tool.key}
                    className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        onChange({
                          allowedToolKeys: next
                            ? [...values.allowedToolKeys, tool.key]
                            : values.allowedToolKeys.filter((key) => key !== tool.key),
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {formatToolNameLabel(t, tool.key, tool.displayName)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatToolCategoryLabel(t, tool.category)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReviewItem label={t("aiEmployees.form.displayName")} value={values.displayName} />
        <ReviewItem label={t("aiEmployees.form.internalName")} value={values.name} />
        <ReviewItem
          label={t("aiEmployees.form.department")}
          value={formatEmployeeDepartmentLabel(t, values.department)}
        />
        <ReviewItem
          label={t("aiEmployees.form.provider")}
          value={formatEmployeeProviderLabel(t, values.provider)}
        />
        <ReviewItem label={t("aiEmployees.form.model")} value={values.model} />
        <ReviewItem
          label={t("aiEmployees.form.systemPrompt")}
          value={values.systemPrompt.slice(0, 120)}
        />
        <ReviewItem
          label={t("aiEmployees.form.knowledge")}
          value={t("aiEmployees.form.selectedCount", { count: values.knowledgeSourceIds.length })}
        />
        <ReviewItem
          label={t("aiEmployees.form.tools")}
          value={t("aiEmployees.form.selectedCount", { count: values.allowedToolKeys.length })}
        />
        <ReviewItem
          label={t("aiEmployees.form.status")}
          value={t(`aiEmployees.status.${values.status}`, { defaultValue: values.status })}
        />
        <ReviewItem
          label={t("aiEmployees.form.channelRouting.title")}
          value={
            values.tags.length > 0
              ? values.tags.map((tag) => formatEmployeeTagLabel(t, tag)).join(" · ")
              : t("aiEmployees.form.channelRouting.noneSelected")
          }
        />
      </div>
      <p className="rounded-xl border border-primary/20 bg-transparent px-4 py-3 text-xs text-muted-foreground">
        {t("aiEmployees.form.channelRouting.publishHint")}
      </p>
    </div>
  );
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
          {props.values.displayName}
        </h3>
        <AiEmployeeFormSections {...props} step="general" />
      </section>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{/* provider */}</h3>
        <AiEmployeeFormSections {...props} step="provider" />
        <AiEmployeeFormSections {...props} step="model" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="prompt" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="knowledge" />
      </section>
      <section className="space-y-4">
        <AiEmployeeFormSections {...props} step="tools" />
      </section>
    </div>
  );
}
