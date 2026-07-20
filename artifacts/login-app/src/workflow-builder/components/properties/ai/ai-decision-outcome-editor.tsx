import {
  AI_DECISION_NODE_KEY,
  patchDecisionMetadata,
  readDecisionMetadata,
  type DecisionOutcome,
} from "@workspace/ai-workflow-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIDecisionOutcomeEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

function createOutcome(): DecisionOutcome {
  const id = crypto.randomUUID();
  return { id, label: `outcome_${id.slice(0, 4)}`, description: "", examples: [] };
}

export function AIDecisionOutcomeEditor({ config, onChange }: AIDecisionOutcomeEditorProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_DECISION_NODE_KEY);
  const decision = readDecisionMetadata(aiConfig);

  const updateOutcomes = (outcomes: DecisionOutcome[]) => {
    onChange({ aiConfig: patchDecisionMetadata(aiConfig, { outcomes }) });
  };

  const updateOutcome = (id: string, patch: Partial<DecisionOutcome>) => {
    updateOutcomes(
      decision.outcomes.map((outcome) => (outcome.id === id ? { ...outcome, ...patch } : outcome)),
    );
  };

  if (decision.decisionMode === "confidence_scoring") {
    return (
      <div className="rounded-xl border border-border/60 bg-background/50 p-3 text-sm text-muted-foreground">
        {ai("sections.confidenceScoringMode")}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">{ai("sections.decisionOutcomes")}</Label>
          <p className="text-xs text-muted-foreground">{ai("sections.decisionOutcomesHint")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => updateOutcomes([...decision.outcomes, createOutcome()])}>
          <Plus className="me-1 h-4 w-4" />
          {ai("addOutcome")}
        </Button>
      </div>

      <div className="space-y-3">
        {decision.outcomes.map((outcome) => (
          <div key={outcome.id} className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{ai("label")}</Label>
                  <Input
                    value={outcome.label}
                    onChange={(event) => updateOutcome(outcome.id, { label: event.target.value })}
                    className="rounded-xl bg-background/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{ai("description")}</Label>
                  <Input
                    value={outcome.description ?? ""}
                    onChange={(event) => updateOutcome(outcome.id, { description: event.target.value })}
                    className="rounded-xl bg-background/80"
                  />
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => updateOutcomes(decision.outcomes.filter((entry) => entry.id !== outcome.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{ai("sections.examplesOnePerLine")}</Label>
              <Textarea
                rows={2}
                value={(outcome.examples ?? []).join("\n")}
                onChange={(event) =>
                  updateOutcome(outcome.id, {
                    examples: event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                className="rounded-xl bg-background/80"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
