import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { PromptPreviewPanel } from "@/components/prompts/preview/prompt-preview-panel";
import { PromptSectionEditor } from "@/components/prompts/editor/prompt-section-editor";
import { PromptValidationPanel } from "@/components/prompts/validation/prompt-validation-panel";
import { PromptVariableBrowser } from "@/components/prompts/variables/prompt-variable-browser";
import { PromptVersionHistoryPanel } from "@/components/prompts/lifecycle/prompt-version-history-panel";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { usePromptPreviewState } from "@/hooks/prompts/use-prompt-preview";
import { usePromptTemplateVersions, usePromptTemplates } from "@/hooks/prompts/use-prompt-templates";
import type { PromptSectionConfig, PromptSectionKey } from "@workspace/ai-prompt-orchestrator";

export function PromptEditorPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const [, params] = useRoute("/dashboard/prompts/editor/:templateKey");
  const templateKey = params?.templateKey ?? "";
  const companyId = company?.id ?? null;
  const { data: templates = [], error } = usePromptTemplates(companyId, Boolean(companyId));
  const template = templates.find((item) => item.key === templateKey) ?? null;
  const { data: versions = [] } = usePromptTemplateVersions(template?.id ?? null, Boolean(template?.id));
  const activeVersion = versions.find((version) => version.is_active) ?? versions[0] ?? null;

  const [sections, setSections] = useState<Partial<Record<PromptSectionKey, PromptSectionConfig>>>(
    activeVersion?.sections ?? {},
  );
  const [sectionOrder] = useState<PromptSectionKey[]>(template?.section_order ?? ["system_instructions"]);

  useEffect(() => {
    if (activeVersion?.sections) setSections(activeVersion.sections);
  }, [activeVersion?.id, activeVersion?.sections]);

  const preview = usePromptPreviewState({ sections, sectionOrder });

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  if (!template) {
    return <DashboardErrorBanner message={t("prompts.editor.notFound")} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <PromptVariableBrowser />
        <PromptVersionHistoryPanel template={template} versions={versions} />
      </div>

      <DashboardCard className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{template.display_name}</h2>
          <p className="text-sm text-muted-foreground">{template.key}</p>
        </div>
        <PromptSectionEditor sections={sections} sectionOrder={sectionOrder} onChange={setSections} />
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
  );
}
