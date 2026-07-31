import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { useAiProviderConnectionsAdmin, useAiProviderTypes } from "@/hooks/use-ai-provider-connections-admin";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";
import type { KnowledgeSourceOption, ToolDefinitionOption } from "@/lib/ai-employees/types";

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
  const { data: providerTypes = [] } = useAiProviderTypes();

  const enabledConnections = useMemo(
    () => connections.filter((connection) => connection.is_enabled),
    [connections],
  );

  if (step === "general" || step === "edit") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
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
        </Field>
        <Field label={t("aiEmployees.form.department")} htmlFor="department">
          <Input
            id="department"
            value={values.department ?? ""}
            onChange={(event) => onChange({ department: event.target.value || null })}
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
        <Field label={t("aiEmployees.form.status")}>
          <Select value={values.status} onValueChange={(value) => onChange({ status: value as AiEmployeeFormValues["status"] })}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("aiEmployees.status.draft")}</SelectItem>
              <SelectItem value="published">{t("aiEmployees.status.published")}</SelectItem>
              <SelectItem value="disabled">{t("aiEmployees.status.disabled")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("aiEmployees.form.avatarUrl")} htmlFor="avatar">
          <Input
            id="avatar"
            value={values.avatar ?? ""}
            onChange={(event) => onChange({ avatar: event.target.value || null })}
            className="rounded-xl"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("aiEmployees.form.description")} htmlFor="description">
            <Textarea
              id="description"
              value={values.description}
              onChange={(event) => onChange({ description: event.target.value })}
              className="min-h-24 rounded-xl"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={t("aiEmployees.form.tags")} htmlFor="tags">
            <Input
              id="tags"
              value={values.tags.join(", ")}
              onChange={(event) =>
                onChange({
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder={t("aiEmployees.form.tagsPlaceholder")}
              className="rounded-xl"
            />
          </Field>
        </div>
      </div>
    );
  }

  if (step === "provider") {
    return (
      <div className="space-y-4">
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
              {enabledConnections.map((connection) => (
                <SelectItem
                  key={connection.id}
                  value={connection.ai_provider_definition?.key ?? connection.id}
                >
                  {connection.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.providerHint")}</p>
        {providerTypes.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            {t("aiEmployees.form.availableProviders", { count: providerTypes.length })}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "model") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("aiEmployees.form.model")} htmlFor="model">
          <Input
            id="model"
            value={values.model ?? ""}
            onChange={(event) => onChange({ model: event.target.value || null })}
            className="rounded-xl"
          />
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
        </Field>
      </div>
    );
  }

  if (step === "prompt") {
    return (
      <Field label={t("aiEmployees.form.systemPrompt")} htmlFor="systemPrompt">
        <Textarea
          id="systemPrompt"
          value={values.systemPrompt}
          onChange={(event) => onChange({ systemPrompt: event.target.value })}
          className="min-h-56 rounded-xl font-mono text-sm"
          placeholder={t("aiEmployees.form.systemPromptPlaceholder")}
        />
      </Field>
    );
  }

  if (step === "knowledge") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.knowledgeHint")}</p>
        <div className="grid gap-2 md:grid-cols-2">
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
      </div>
    );
  }

  if (step === "tools") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("aiEmployees.form.toolsHint")}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {toolOptions.map((tool) => {
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
                  <span className="block text-sm font-medium">{tool.displayName}</span>
                  <span className="block text-xs text-muted-foreground">{tool.category}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReviewItem label={t("aiEmployees.form.displayName")} value={values.displayName} />
      <ReviewItem label={t("aiEmployees.form.internalName")} value={values.name} />
      <ReviewItem label={t("aiEmployees.form.provider")} value={values.provider} />
      <ReviewItem label={t("aiEmployees.form.model")} value={values.model} />
      <ReviewItem label={t("aiEmployees.form.systemPrompt")} value={values.systemPrompt.slice(0, 120)} />
      <ReviewItem
        label={t("aiEmployees.form.knowledge")}
        value={t("aiEmployees.form.selectedCount", { count: values.knowledgeSourceIds.length })}
      />
      <ReviewItem
        label={t("aiEmployees.form.tools")}
        value={t("aiEmployees.form.selectedCount", { count: values.allowedToolKeys.length })}
      />
      <ReviewItem label={t("aiEmployees.form.status")} value={values.status} />
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
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
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
