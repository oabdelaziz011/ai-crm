import {
  AI_SUMMARIZER_NODE_KEY,
  createDefaultSummarizerNodeConfig,
  patchSummarizerMetadata,
  readSummarizerMetadata,
  SUMMARY_PRESETS,
  SUMMARY_PRESET_DEFINITIONS,
  toAIWorkflowEngineConfig,
  type SummaryPreset,
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
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AISummaryOptionsEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

export function AISummaryOptionsEditor({ config, onChange }: AISummaryOptionsEditorProps) {
  const { ai, inputSource, summaryPreset } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_SUMMARIZER_NODE_KEY);
  const summarizer = readSummarizerMetadata(aiConfig);

  const applyPreset = (preset: SummaryPreset) => {
    const definition = SUMMARY_PRESET_DEFINITIONS[preset];
    const nextConfig = patchSummarizerMetadata(aiConfig, {
      summaryPreset: preset,
      summaryStyle: definition.style,
      maxLength: definition.maxLength,
      bulletMode: definition.bulletMode,
      tone: definition.tone,
    });
    onChange({ aiConfig: nextConfig });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <Label className="text-sm font-medium">{ai("sections.summaryOptions")}</Label>
        <p className="text-xs text-muted-foreground">{ai("sections.summaryOptionsHint")}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.summaryPreset")}</Label>
        <Select value={summarizer.summaryPreset} onValueChange={(value) => applyPreset(value as SummaryPreset)}>
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue placeholder={ai("sections.selectPreset")} />
          </SelectTrigger>
          <SelectContent>
            {SUMMARY_PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {summaryPreset(preset, SUMMARY_PRESET_DEFINITIONS[preset].label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("inputSource")}</Label>
        <Select
          value={summarizer.inputSource}
          onValueChange={(value) =>
            onChange({
              aiConfig: patchSummarizerMetadata(aiConfig, {
                inputSource: value as "variable" | "static",
              }),
            })
          }
        >
          <SelectTrigger className="rounded-xl bg-background/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="variable">{inputSource("variable")}</SelectItem>
            <SelectItem value="static">{inputSource("static")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {summarizer.inputSource === "variable" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("textVariable")}</Label>
          <Input
            value={summarizer.inputVariable ?? ""}
            placeholder={ai("placeholders.input")}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, { inputVariable: event.target.value }),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("staticText")}</Label>
          <Textarea
            value={summarizer.staticText ?? ""}
            rows={4}
            placeholder={ai("placeholders.pasteContentToSummarize")}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, { staticText: event.target.value }),
              })
            }
            className="min-h-24 rounded-xl bg-background/80"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.summaryStyle")}</Label>
          <Input
            value={summarizer.summaryStyle ?? ""}
            placeholder={SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].style}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, { summaryStyle: event.target.value || null }),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.maximumLength")}</Label>
          <Input
            type="number"
            min={50}
            value={summarizer.maxLength ?? SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].maxLength}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, {
                  maxLength: Number(event.target.value) || null,
                }),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.language")}</Label>
          <Input
            value={summarizer.language ?? "English"}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, { language: event.target.value || "English" }),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.tone")}</Label>
          <Input
            value={summarizer.tone ?? ""}
            placeholder={SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].tone}
            onChange={(event) =>
              onChange({
                aiConfig: patchSummarizerMetadata(aiConfig, { tone: event.target.value || null }),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{ai("sections.bulletMode")}</Label>
          <p className="text-xs text-muted-foreground">{ai("sections.bulletModeHint")}</p>
        </div>
        <Switch
          checked={summarizer.bulletMode}
          onCheckedChange={(checked) =>
            onChange({
              aiConfig: patchSummarizerMetadata(aiConfig, { bulletMode: checked }),
            })
          }
        />
      </div>
    </div>
  );
}

export function createDefaultSummarizerBuilderConfig(): Record<string, unknown> {
  return {
    builderType: "ai_summarizer",
    ...toAIWorkflowEngineConfig(createDefaultSummarizerNodeConfig()),
  };
}
