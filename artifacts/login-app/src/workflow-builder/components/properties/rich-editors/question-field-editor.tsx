import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { renderVariablePreview } from "../../../core/variables/variable-preview";
import { VariablePicker } from "../../variables/variable-picker";

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function QuestionFieldEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const question = readString(config.question);
  const preview = renderVariablePreview(question);

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-semibold">{t("workflowBuilder.fields.question")}</Label>
        <VariablePicker onSelect={(variable) => onChange({ question: `${question}${variable.token}` })} />
      </div>
      <Textarea
        value={question}
        rows={4}
        onChange={(event) => onChange({ question: event.target.value })}
        className="rounded-2xl border-border/60 bg-background/90"
        placeholder={t("workflowBuilder.fields.questionPlaceholder")}
      />
      <div className="grid gap-3">
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.fields.saveAnswerAs")}</Label>
          <Input
            value={readString(config.saveAs, "customer_name")}
            onChange={(event) => onChange({ saveAs: event.target.value })}
            className="rounded-xl"
          />
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
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("workflowBuilder.preview.title")}</p>
        <p className="text-sm leading-relaxed">{preview || question}</p>
      </div>
    </div>
  );
}
