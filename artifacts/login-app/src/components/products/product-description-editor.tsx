import { useCallback, useRef } from "react";
import { Bold, Italic } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type ProductDescriptionEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/**
 * Product description editor tuned for WhatsApp customer replies.
 * WhatsApp text supports *bold* and _italic_ (and newlines) — not text colors.
 */
export function ProductDescriptionEditor({
  id,
  value,
  onChange,
  maxLength = 2000,
  rows = 6,
  disabled = false,
  className,
  placeholder,
}: ProductDescriptionEditorProps) {
  const { t } = useTranslation("common");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = useCallback(
    (marker: "*" | "_") => {
      const node = textareaRef.current;
      if (!node || disabled) return;
      const start = node.selectionStart ?? 0;
      const end = node.selectionEnd ?? 0;
      const selected = value.slice(start, end);
      if (!selected) {
        const insert = `${marker}${marker}`;
        const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => {
          node.focus();
          const caret = start + 1;
          node.setSelectionRange(caret, caret);
        });
        return;
      }
      const already =
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length >= marker.length * 2;
      const inner = already ? selected.slice(marker.length, selected.length - marker.length) : selected;
      const wrapped = already ? inner : `${marker}${selected}${marker}`;
      const next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        node.focus();
        node.setSelectionRange(start, start + wrapped.length);
      });
    },
    [disabled, onChange, value],
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{t("products.fields.description")}</Label>
        <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background p-0.5">
          <button
            type="button"
            disabled={disabled}
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label={t("products.descriptionEditor.bold")}
            title={t("products.descriptionEditor.bold")}
            onClick={() => wrapSelection("*")}
          >
            <Bold className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label={t("products.descriptionEditor.italic")}
            title={t("products.descriptionEditor.italic")}
            onClick={() => wrapSelection("_")}
          >
            <Italic className="size-3.5" />
          </button>
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("products.placeholders.description")}
        className="min-h-[140px] resize-y whitespace-pre-wrap font-sans"
        dir="auto"
      />
      <p className="text-[11px] leading-snug text-muted-foreground" dir="auto">
        {t("products.descriptionEditor.hint")}
      </p>
    </div>
  );
}
