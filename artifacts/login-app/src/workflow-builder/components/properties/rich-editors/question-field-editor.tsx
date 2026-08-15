import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { MessageFieldEditor } from "./message-field-editor";

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function QuestionFieldEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <MessageFieldEditor
        config={config}
        onChange={onChange}
        context={context}
        mapKey="questions"
        baseField="question"
        alternateMapKeys={["prompts", "messages"]}
        alternateBaseFields={["prompt", "message"]}
        arabicLabelKey="workflowBuilder.fields.questionArabic"
        englishLabelKey="workflowBuilder.fields.questionEnglish"
        arabicPlaceholderKey="workflowBuilder.fields.questionArabicPlaceholder"
        englishPlaceholderKey="workflowBuilder.fields.questionEnglishPlaceholder"
      />
      <div className="grid gap-3 rounded-2xl border border-border/50 bg-background/50 p-4">
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.fields.saveAnswerAs")}</Label>
          <Input
            value={readString(config.saveAs)}
            onChange={(event) => onChange({ saveAs: event.target.value })}
            className="rounded-xl font-mono text-xs"
            placeholder={t("workflowBuilder.fields.saveAnswerAsPlaceholder")}
            dir="ltr"
          />
          <p className="text-[11px] text-muted-foreground">{t("workflowBuilder.fields.saveAnswerAsHint")}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.fields.placeholder")}</Label>
          <Input
            value={readString(config.placeholder)}
            onChange={(event) => onChange({ placeholder: event.target.value })}
            className="rounded-xl"
            placeholder={t("workflowBuilder.fields.placeholderExample")}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.fields.validationMessage")}</Label>
          <Input
            value={readString(config.validationMessage)}
            onChange={(event) => onChange({ validationMessage: event.target.value })}
            className="rounded-xl"
            placeholder={t("workflowBuilder.fields.validationExample")}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("workflowBuilder.fields.required")}</p>
            <p className="text-xs text-muted-foreground">{t("workflowBuilder.fields.requiredHint")}</p>
          </div>
          <Switch checked={readBoolean(config.required, true)} onCheckedChange={(checked) => onChange({ required: checked })} />
        </div>
      </div>
    </div>
  );
}
