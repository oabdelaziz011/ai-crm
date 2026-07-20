import type { AIWorkflowPreviewResult } from "@workspace/ai-workflow-platform";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { AIWorkflowPreviewPanel } from "./ai-preview-panel";

type AIExtractPreviewPanelProps = {
  preview: AIWorkflowPreviewResult | null;
};

export function AIExtractPreviewPanel({ preview }: AIExtractPreviewPanelProps) {
  const { ai } = useWorkflowBuilderAiI18n();

  return (
    <div className="space-y-3">
      <AIWorkflowPreviewPanel preview={preview} />
      {preview ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
          <div>
            <p className="font-medium">{ai("sections.extractPreview")}</p>
            <p className="text-xs text-muted-foreground">{ai("sections.extractPreviewHint")}</p>
          </div>
          <dl className="grid gap-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{ai("preview.fields")}</dt>
              <dd className="font-medium">{String(preview.nodeMetadata?.fieldCount ?? 0)}</dd>
            </div>
            {preview.estimatedTokenRange ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{ai("preview.estimatedTokens")}</dt>
                <dd className="font-medium">
                  {preview.estimatedTokenRange.min}–{preview.estimatedTokenRange.max}
                </dd>
              </div>
            ) : null}
          </dl>
          {preview.outputSchema ? (
            <div className="space-y-1">
              <p className="text-muted-foreground">{ai("preview.expectedJsonSchema")}</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-background/80 p-2 text-xs">
                {JSON.stringify(preview.outputSchema, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
