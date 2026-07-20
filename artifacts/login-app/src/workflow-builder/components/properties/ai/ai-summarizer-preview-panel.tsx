import { useMemo } from "react";
import type { AIWorkflowPreviewResult } from "@workspace/ai-workflow-platform";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { AIWorkflowPreviewPanel } from "./ai-preview-panel";

type AISummarizerPreviewPanelProps = {
  preview: AIWorkflowPreviewResult | null;
};

export function AISummarizerPreviewPanel({ preview }: AISummarizerPreviewPanelProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const tokenRange = useMemo(() => preview?.estimatedTokenRange ?? null, [preview]);
  const nodeMetadata = preview?.nodeMetadata ?? null;

  return (
    <div className="space-y-3">
      <AIWorkflowPreviewPanel preview={preview} />
      {preview ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
          <div>
            <p className="font-medium">{ai("sections.summarizerPreview")}</p>
            <p className="text-xs text-muted-foreground">{ai("sections.summarizerPreviewHint")}</p>
          </div>
          <dl className="grid gap-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{ai("preview.expectedOutput")}</dt>
              <dd className="text-end font-medium">{preview.expectedOutput ?? preview.outputMode}</dd>
            </div>
            {tokenRange ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{ai("preview.estimatedTokens")}</dt>
                <dd className="text-end font-medium">
                  {tokenRange.min}–{tokenRange.max}
                </dd>
              </div>
            ) : null}
            {nodeMetadata?.inputPreview ? (
              <div className="space-y-1">
                <dt className="text-muted-foreground">{ai("preview.inputPreview")}</dt>
                <dd className="rounded-lg bg-background/80 p-2 text-xs">{String(nodeMetadata.inputPreview)}</dd>
              </div>
            ) : null}
            {preview.outputSchema ? (
              <div className="space-y-1">
                <dt className="text-muted-foreground">{ai("preview.outputSchema")}</dt>
                <dd className="rounded-lg bg-background/80 p-2 font-mono text-xs">
                  {JSON.stringify(preview.outputSchema, null, 2)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
