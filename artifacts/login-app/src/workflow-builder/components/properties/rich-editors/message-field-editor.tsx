import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { renderVariablePreview } from "../../../core/variables/variable-preview";
import { VariablePicker } from "../../variables/variable-picker";
import {
  bilingualMapPassthrough,
  hasBilingualOrLegacyText,
  readBilingualMap,
  type BilingualMapKey,
} from "../../../core/conversation/bilingual-text";

export type { BilingualMapKey };
export { bilingualMapPassthrough, hasBilingualOrLegacyText, readBilingualMap };

type LanguageKey = "ar" | "en";

function LanguageMessageBox({
  language,
  value,
  onChangeValue,
  label,
  placeholder,
  compact,
}: {
  language: LanguageKey;
  value: string;
  onChangeValue: (next: string) => void;
  label: string;
  placeholder: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("common");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preview = useMemo(() => renderVariablePreview(value), [value]);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  return (
    <div
      className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-4"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-semibold">{label}</Label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" aria-label={t("workflowBuilder.fields.emojiPlaceholder")}>
            <Smile className="h-4 w-4" />
          </Button>
          <VariablePicker
            onSelect={(variable) => {
              const next = `${value.slice(0, selection.start)}${variable.token}${value.slice(selection.end)}`;
              const cursor = selection.start + variable.token.length;
              onChangeValue(next);
              requestAnimationFrame(() => {
                textareaRef.current?.setSelectionRange(cursor, cursor);
              });
            }}
          />
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        rows={compact ? 2 : 4}
        onSelect={(event) => {
          const target = event.target as HTMLTextAreaElement;
          setSelection({ start: target.selectionStart, end: target.selectionEnd });
        }}
        onChange={(event) => {
          onChangeValue(event.target.value);
          setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd });
        }}
        className={`${compact ? "min-h-16" : "min-h-28"} resize-y rounded-2xl border-border/60 bg-background/90 text-base leading-relaxed focus-visible:ring-primary/30`}
        placeholder={placeholder}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("workflowBuilder.fields.characterCount", { count: value.length })}</span>
      </div>
      {!compact && (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("workflowBuilder.preview.title")}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {preview || t("workflowBuilder.preview.empty")}
          </p>
        </div>
      )}
    </div>
  );
}

export type MessageFieldEditorProps = NodePropertyEditorProps & {
  field?: string;
  label?: string;
  mapKey?: BilingualMapKey;
  baseField?: string;
  alternateMapKeys?: BilingualMapKey[];
  alternateBaseFields?: string[];
  arabicLabelKey?: string;
  englishLabelKey?: string;
  arabicPlaceholderKey?: string;
  englishPlaceholderKey?: string;
  hintKey?: string;
  compact?: boolean;
  showHint?: boolean;
};

/**
 * Bilingual text editor. Stores `{mapKey}.ar/en` and keeps `{baseField}` as fallback (AR then EN).
 */
export function MessageFieldEditor({
  config,
  onChange,
  field: _field = "message",
  label: _label,
  mapKey = "messages",
  baseField = "message",
  alternateMapKeys = [],
  alternateBaseFields = [],
  arabicLabelKey = "workflowBuilder.fields.messageArabic",
  englishLabelKey = "workflowBuilder.fields.messageEnglish",
  arabicPlaceholderKey = "workflowBuilder.fields.messageArabicPlaceholder",
  englishPlaceholderKey = "workflowBuilder.fields.messageEnglishPlaceholder",
  hintKey = "workflowBuilder.fields.bilingualMessageHint",
  compact = false,
  showHint = true,
}: MessageFieldEditorProps) {
  const { t } = useTranslation("common");
  const { ar, en } = readBilingualMap(config, mapKey, baseField, alternateMapKeys, alternateBaseFields);

  const writeMessages = (nextAr: string, nextEn: string) => {
    onChange({
      [mapKey]: { ar: nextAr, en: nextEn },
      [baseField]: nextAr.trim() || nextEn.trim(),
    });
  };

  return (
    <div className="space-y-4">
      {showHint ? (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t(hintKey)}
        </div>
      ) : null}
      <LanguageMessageBox
        language="ar"
        value={ar}
        label={t(arabicLabelKey)}
        placeholder={t(arabicPlaceholderKey)}
        compact={compact}
        onChangeValue={(next) => writeMessages(next, en)}
      />
      <LanguageMessageBox
        language="en"
        value={en}
        label={t(englishLabelKey)}
        placeholder={t(englishPlaceholderKey)}
        compact={compact}
        onChangeValue={(next) => writeMessages(ar, next)}
      />
    </div>
  );
}

/** @deprecated Prefer hasBilingualOrLegacyText(config, "messages", "message") */
export function hasBilingualOrLegacyMessage(config: Record<string, unknown>): boolean {
  return hasBilingualOrLegacyText(config, "messages", "message");
}
