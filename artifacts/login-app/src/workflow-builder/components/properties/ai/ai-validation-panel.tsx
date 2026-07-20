import type { AIWorkflowValidationIssue } from "@workspace/ai-workflow-platform";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";

type AIWorkflowValidationPanelProps = {
  issues: AIWorkflowValidationIssue[];
};

export function AIWorkflowValidationPanel({ issues }: AIWorkflowValidationPanelProps) {
  const { ai, validationMessage } = useWorkflowBuilderAiI18n();

  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
        <div>
          <p className="font-medium">{ai("validation.configLooksGood")}</p>
          <p className="text-xs text-muted-foreground">{ai("validation.readyForPreview")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div
          key={issue.id}
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            issue.severity === "error"
              ? "border-destructive/30 bg-destructive/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <AlertTriangle
            className={`mt-0.5 h-4 w-4 ${issue.severity === "error" ? "text-destructive" : "text-amber-500"}`}
          />
          <div>
            <p className="font-medium">{validationMessage(issue)}</p>
            {issue.field ? <p className="text-xs text-muted-foreground">{issue.field}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
