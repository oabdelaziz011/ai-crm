import {
  AI_DECISION_NODE_KEY,
  DECISION_MODES,
  patchDecisionMetadata,
  readDecisionMetadata,
  type DecisionMode,
} from "@workspace/ai-workflow-platform";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIDecisionConfigEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

export function AIDecisionConfigEditor({ config, onChange }: AIDecisionConfigEditorProps) {
  const { ai, inputSource, decisionMode } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_DECISION_NODE_KEY);
  const decision = readDecisionMetadata(aiConfig);

  const patch = (partial: Parameters<typeof patchDecisionMetadata>[1]) => ({
    aiConfig: patchDecisionMetadata(aiConfig, partial),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <Label className="text-sm font-medium">{ai("sections.decisionConfiguration")}</Label>
        <p className="text-xs text-muted-foreground">{ai("sections.decisionConfigurationHint")}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.decisionMode")}</Label>
        <Select
          value={decision.decisionMode}
          onValueChange={(value) => onChange(patch({ decisionMode: value as DecisionMode }))}
        >
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DECISION_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {decisionMode(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("inputSource")}</Label>
        <Select
          value={decision.inputSource}
          onValueChange={(value) =>
            onChange(patch({ inputSource: value as typeof decision.inputSource }))
          }
        >
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="variable">{inputSource("variable")}</SelectItem>
            <SelectItem value="static">{inputSource("static")}</SelectItem>
            <SelectItem value="conversation_message">{inputSource("conversation_message")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {decision.inputSource === "variable" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("variableName")}</Label>
          <Input
            value={decision.inputVariable ?? ""}
            placeholder={ai("placeholders.input")}
            onChange={(event) => onChange(patch({ inputVariable: event.target.value }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      {decision.inputSource === "static" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("staticText")}</Label>
          <Textarea
            value={decision.staticText ?? ""}
            rows={4}
            onChange={(event) => onChange(patch({ staticText: event.target.value }))}
            className="min-h-24 rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.businessRules")}</Label>
        <Textarea
          value={decision.businessRules ?? ""}
          rows={3}
          onChange={(event) => onChange(patch({ businessRules: event.target.value }))}
          className="rounded-xl bg-background/80"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.confidenceThreshold")}</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={decision.confidenceThreshold ?? 0.7}
            onChange={(event) =>
              onChange(patch({ confidenceThreshold: Number(event.target.value) || 0 }))
            }
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.fallbackOutcome")}</Label>
          <Select
            value={decision.fallbackOutcomeId ?? "none"}
            onValueChange={(value) =>
              onChange(patch({ fallbackOutcomeId: value === "none" ? null : value }))
            }
          >
            <SelectTrigger className="rounded-xl bg-background/80">
              <SelectValue placeholder={ai("none")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{ai("none")}</SelectItem>
              {decision.outcomes.map((outcome) => (
                <SelectItem key={outcome.id} value={outcome.id}>
                  {outcome.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">{ai("sections.confidencePolicy")}</p>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs">{ai("sections.emitWarningBelowThreshold")}</Label>
          <Switch
            checked={decision.confidencePolicy.emitWarning}
            onCheckedChange={(checked) =>
              onChange(patch({ confidencePolicy: { ...decision.confidencePolicy, emitWarning: checked } }))
            }
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs">{ai("sections.requireHumanReview")}</Label>
          <Switch
            checked={decision.confidencePolicy.requireHumanReview}
            onCheckedChange={(checked) =>
              onChange(patch({ confidencePolicy: { ...decision.confidencePolicy, requireHumanReview: checked } }))
            }
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs">{ai("sections.continueWorkflowOnLowConfidence")}</Label>
          <Switch
            checked={decision.confidencePolicy.continueWorkflow}
            onCheckedChange={(checked) =>
              onChange(patch({ confidencePolicy: { ...decision.confidencePolicy, continueWorkflow: checked } }))
            }
          />
        </div>
      </div>
    </div>
  );
}
