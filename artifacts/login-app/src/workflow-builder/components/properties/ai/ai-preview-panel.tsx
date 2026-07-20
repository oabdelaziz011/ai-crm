import type { AIWorkflowPreviewResult } from "@workspace/ai-workflow-platform";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";

type AIWorkflowPreviewPanelProps = {
  preview: AIWorkflowPreviewResult | null;
  isLoading?: boolean;
};

export function AIWorkflowPreviewPanel({ preview, isLoading }: AIWorkflowPreviewPanelProps) {
  const { ai, outputMode } = useWorkflowBuilderAiI18n();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{ai("preview.buildingPreview")}</p>;
  }

  if (!preview) {
    return <p className="text-sm text-muted-foreground">{ai("preview.configureToPreview")}</p>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <p className="text-sm font-medium">{ai("preview.runtimePreview")}</p>
        <p className="text-xs text-muted-foreground">{ai("preview.runtimePreviewHint")}</p>
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.prompt")}</dt>
          <dd className="text-end font-medium">{preview.promptTemplateKey ?? ai("notSelected")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.output")}</dt>
          <dd className="text-end font-medium">{outputMode(preview.outputMode)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.knowledge")}</dt>
          <dd className="text-end font-medium">
            {preview.knowledgeEnabled
              ? preview.knowledgeSummary ?? ai("enabled")
              : ai("disabled")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.provider")}</dt>
          <dd className="text-end font-medium">{preview.runtimeMetadata.providerKey ?? ai("default")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.model")}</dt>
          <dd className="text-end font-medium">{preview.runtimeMetadata.model ?? ai("default")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{ai("preview.streaming")}</dt>
          <dd className="text-end font-medium">
            {preview.runtimeMetadata.streaming ? ai("yes") : ai("no")}
          </dd>
        </div>
      </dl>
    </div>
  );
}
