import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PromptPreviewPanel } from "@/components/prompts/preview/prompt-preview-panel";
import { PromptSectionEditor } from "@/components/prompts/editor/prompt-section-editor";
import { PromptValidationPanel } from "@/components/prompts/validation/prompt-validation-panel";
import { PromptVariableBrowser } from "@/components/prompts/variables/prompt-variable-browser";
import { PromptVersionHistoryPanel } from "@/components/prompts/lifecycle/prompt-version-history-panel";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { usePromptPreviewState, usePromptVariableCatalog } from "@/hooks/prompts/use-prompt-preview";
import {
  buildOutputContractFromSections,
  usePublishPromptDraft,
  useSavePromptDraft,
  useSetPromptTemplateEnabled,
} from "@/hooks/prompts/use-prompt-mutations";
import { usePromptTemplateVersions, usePromptTemplates } from "@/hooks/prompts/use-prompt-templates";
import { usePermissions } from "@/hooks/use-rbac";
import {
  canManagePrompts,
  canPublishPrompts,
  canRollbackPrompts,
} from "@/lib/prompts/prompt-permissions";
import {
  translatePromptSection,
  translatePromptTemplateDescription,
  translatePromptTemplateName,
  translatePromptType,
} from "@/lib/prompts/prompt-i18n";
import type { PromptSectionConfig, PromptSectionKey } from "@workspace/ai-prompt-orchestrator";

export function PromptEditorPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const [, params] = useRoute("/editor/:templateId");
  const templateId = params?.templateId ?? "";
  const companyId = company?.id ?? null;
  const canManage = canManagePrompts(hasPermission, isSuperAdmin);
  const canPublish = canPublishPrompts(hasPermission, isSuperAdmin);
  const canRollback = canRollbackPrompts(hasPermission, isSuperAdmin);

  const { data: templates = [], error } = usePromptTemplates(companyId, Boolean(companyId));
  const template = templates.find((item) => item.id === templateId) ?? null;
  const isSystemTemplate = template?.company_id === null;
  const canEdit = canManage && Boolean(template) && !isSystemTemplate;

  const { data: versions = [] } = usePromptTemplateVersions(template?.id ?? null, Boolean(template?.id));
  const activeVersion = versions.find((version) => version.is_active) ?? versions[0] ?? null;

  const [sections, setSections] = useState<Partial<Record<PromptSectionKey, PromptSectionConfig>>>(
    activeVersion?.sections ?? {},
  );
  const sectionOrder = useMemo<PromptSectionKey[]>(
    () => template?.section_order ?? ["system_instructions"],
    [template?.section_order],
  );

  useEffect(() => {
    if (activeVersion?.sections) setSections(activeVersion.sections);
  }, [activeVersion?.id, activeVersion?.sections]);

  const preview = usePromptPreviewState({ sections, sectionOrder });
  const knownVariables = usePromptVariableCatalog();
  const saveDraft = useSavePromptDraft();
  const publishDraft = usePublishPromptDraft();
  const setEnabled = useSetPromptTemplateEnabled();

  const nextVersionLabel = useMemo(() => {
    const highest = versions.reduce((max, version) => Math.max(max, version.version_number ?? 0), 0);
    return `${highest + 1}.0.0`;
  }, [versions]);

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  if (!template) {
    return <DashboardErrorBanner message={t("prompts.editor.notFound")} />;
  }

  const handleSaveDraft = async () => {
    if (!canEdit || !template) return;
    try {
      await saveDraft.mutateAsync({
        templateId: template.id,
        versionLabel: nextVersionLabel,
        sections,
        outputContract: buildOutputContractFromSections(sections),
        changeNotes: t("prompts.editor.draftNotes"),
        activate: false,
        lifecycleStatus: "draft",
      });
      toast.success(t("prompts.editor.draftSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("prompts.errors.saveFailed"));
    }
  };

  const handlePublish = async () => {
    if (!canEdit || !canPublish || !template) return;
    try {
      await publishDraft.mutateAsync({
        templateId: template.id,
        versionLabel: nextVersionLabel,
        sections,
        outputContract: buildOutputContractFromSections(sections),
        changeNotes: t("prompts.editor.publishNotes"),
        knownVariables,
      });
      toast.success(t("prompts.editor.published"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("prompts.errors.publishFailed"));
    }
  };

  const handleToggleEnabled = async (isEnabled: boolean) => {
    if (!canEdit || !template) return;
    try {
      await setEnabled.mutateAsync({ templateId: template.id, isEnabled });
      toast.success(isEnabled ? t("prompts.editor.enabledOn") : t("prompts.editor.enabledOff"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("prompts.errors.updateFailed"));
    }
  };

  const isBusy = saveDraft.isPending || publishDraft.isPending || setEnabled.isPending;

  return (
    <div className="space-y-4">
      <DashboardCard className="p-4 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {translatePromptTemplateName(t, template.key, template.display_name)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translatePromptTemplateDescription(t, template.key, template.description || "")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("prompts.library.meta", {
              type: translatePromptType(t, template.template_type),
              key: template.key,
            })}
          </p>
          {isSystemTemplate ? (
            <p className="text-sm text-muted-foreground">{t("prompts.editor.systemReadOnly")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={template.is_enabled}
                disabled={isBusy}
                onCheckedChange={(checked) => void handleToggleEnabled(checked)}
              />
              <Label className="text-sm">{t("prompts.editor.enabled")}</Label>
            </div>
          ) : null}
          {canEdit ? (
            <Button variant="secondary" disabled={isBusy} onClick={() => void handleSaveDraft()}>
              {t("prompts.editor.saveDraft")}
            </Button>
          ) : null}
          {canEdit && canPublish ? (
            <Button disabled={isBusy} onClick={() => void handlePublish()}>
              {t("prompts.editor.publish")}
            </Button>
          ) : null}
        </div>
      </DashboardCard>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <PromptVariableBrowser />
          <PromptVersionHistoryPanel
            template={template}
            versions={versions}
            canRollback={canRollback && canEdit}
          />
        </div>

        <DashboardCard className="p-4 space-y-4">
          {canEdit ? (
            <PromptSectionEditor sections={sections} sectionOrder={sectionOrder} onChange={setSections} />
          ) : (
            <div className="space-y-3">
              {sectionOrder.map((key) => {
                const section = sections[key];
                if (!section?.content) return null;
                return (
                  <div key={key} className="rounded-lg border p-3 space-y-2">
                    <p className="font-medium text-sm">
                      {translatePromptSection(t, key)}
                    </p>
                    <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{section.content}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        <div className="space-y-4">
          <PromptValidationPanel issues={preview.validationIssues} />
          <PromptPreviewPanel
            renderedPrompt={preview.renderedPrompt}
            estimatedTokens={preview.estimatedTokens}
            variableCount={preview.variableCount}
          />
        </div>
      </div>
    </div>
  );
}
