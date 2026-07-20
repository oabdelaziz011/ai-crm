import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { renderVariablePreview } from "../../../core/variables/variable-preview";
import { VariablePicker } from "../../variables/variable-picker";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function MessageFieldEditor({
  config,
  onChange,
  field = "message",
  label,
}: NodePropertyEditorProps & { field?: string; label?: string }) {
  const { t } = useTranslation("common");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const value = readString(config[field]);
  const preview = useMemo(() => renderVariablePreview(value), [value]);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  const updateValue = (next: string, cursor?: number) => {
    onChange({ [field]: next });
    if (cursor != null && textareaRef.current) {
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(cursor, cursor);
      });
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-semibold">{label ?? t("workflowBuilder.fields.message")}</Label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" aria-label={t("workflowBuilder.fields.emojiPlaceholder")}>
            <Smile className="h-4 w-4" />
          </Button>
          <VariablePicker
            onSelect={(variable) => {
              const next = `${value.slice(0, selection.start)}${variable.token}${value.slice(selection.end)}`;
              const cursor = selection.start + variable.token.length;
              updateValue(next, cursor);
            }}
          />
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        rows={5}
        onSelect={(event) => {
          const target = event.target as HTMLTextAreaElement;
          setSelection({ start: target.selectionStart, end: target.selectionEnd });
        }}
        onChange={(event) => {
          updateValue(event.target.value);
          setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd });
        }}
        className="min-h-32 resize-y rounded-2xl border-border/60 bg-background/90 text-base leading-relaxed focus-visible:ring-primary/30"
        placeholder={t("workflowBuilder.fields.messagePlaceholder")}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("workflowBuilder.fields.characterCount", { count: value.length })}</span>
      </div>
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("workflowBuilder.preview.title")}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{preview || t("workflowBuilder.preview.empty")}</p>
      </div>
    </div>
  );
}
