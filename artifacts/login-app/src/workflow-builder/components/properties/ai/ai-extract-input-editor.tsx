import {
  AI_EXTRACT_NODE_KEY,
  EXTRACTION_COERCION_POLICIES,
  patchExtractMetadata,
  readExtractMetadata,
} from "@workspace/ai-workflow-platform";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIExtractInputEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

export function AIExtractInputEditor({ config, onChange }: AIExtractInputEditorProps) {
  const { ai, inputSource } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_EXTRACT_NODE_KEY);
  const extract = readExtractMetadata(aiConfig);

  const patch = (partial: Parameters<typeof patchExtractMetadata>[1]) => ({
    aiConfig: patchExtractMetadata(aiConfig, partial),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <Label className="text-sm font-medium">{ai("sections.extractionInput")}</Label>
        <p className="text-xs text-muted-foreground">{ai("sections.extractionInputHint")}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("inputSource")}</Label>
        <Select
          value={extract.inputSource}
          onValueChange={(value) =>
            onChange(patch({ inputSource: value as typeof extract.inputSource }))
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

      {extract.inputSource === "variable" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("variableName")}</Label>
          <Input
            value={extract.inputVariable ?? ""}
            placeholder={ai("placeholders.input")}
            onChange={(event) => onChange(patch({ inputVariable: event.target.value }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      {extract.inputSource === "static" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("staticText")}</Label>
          <Textarea
            value={extract.staticText ?? ""}
            rows={4}
            onChange={(event) => onChange(patch({ staticText: event.target.value }))}
            className="min-h-24 rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.businessRules")}</Label>
        <Textarea
          value={extract.businessRules ?? ""}
          rows={3}
          onChange={(event) => onChange(patch({ businessRules: event.target.value }))}
          className="rounded-xl bg-background/80"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.outputInstructions")}</Label>
        <Textarea
          value={extract.outputInstructions ?? ""}
          rows={2}
          onChange={(event) => onChange(patch({ outputInstructions: event.target.value }))}
          className="rounded-xl bg-background/80"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.validationPolicy")}</Label>
        <Select
          value={extract.coercionPolicy}
          onValueChange={(value) =>
            onChange(patch({ coercionPolicy: value as typeof extract.coercionPolicy }))
          }
        >
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXTRACTION_COERCION_POLICIES.map((policy) => (
              <SelectItem key={policy} value={policy}>
                {ai(`coercionPolicies.${policy}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
