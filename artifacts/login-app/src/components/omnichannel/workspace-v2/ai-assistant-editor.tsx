import { memo, useCallback, useEffect, useRef } from "react";
import { composerDirAttribute } from "@/lib/omnichannel/presentation/text-direction";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";

export type AiAssistantEditorLabels = {
  editorTitle: string;
  editorPlaceholder: string;
  undo: string;
  redo: string;
  clear: string;
  copy: string;
  replace: string;
  restoreOriginal: string;
  applyToComposer: string;
  applyShortcut: string;
};

type AiAssistantEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language: ResolvedConversationLanguage;
  panelDir: "rtl" | "ltr";
  labels: AiAssistantEditorLabels;
  onApply: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  onCopy: () => void;
  onReplace: () => void;
  onRestoreOriginal: () => void;
  showRestoreOriginal: boolean;
};

export const AiAssistantEditor = memo(function AiAssistantEditor({
  value,
  onChange,
  language,
  panelDir,
  labels,
  onApply,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onCopy,
  onReplace,
  onRestoreOriginal,
  showRestoreOriginal,
}: AiAssistantEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 280)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const textDir = composerDirAttribute(value);
  const spellCheckLang = language === "ar" ? "ar" : "en";

  return (
    <section className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
          {labels.editorTitle}
        </h3>
        <span className="text-[10px] text-muted-foreground" dir="auto">
          {labels.applyShortcut}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={labels.editorPlaceholder}
        spellCheck
        lang={spellCheckLang}
        dir={textDir}
        rows={3}
        className="mb-2 w-full resize-none rounded-md border border-border bg-background/40 px-3 py-2 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/40"
        style={{ minHeight: "4.5rem" }}
      />

      <div className={`flex flex-wrap gap-1 ${panelDir === "rtl" ? "justify-end" : ""}`}>
        <EditorTool label={labels.undo} onClick={onUndo} disabled={!canUndo} />
        <EditorTool label={labels.redo} onClick={onRedo} disabled={!canRedo} />
        <EditorTool label={labels.copy} onClick={onCopy} disabled={!value.trim()} />
        <EditorTool label={labels.replace} onClick={onReplace} />
        {showRestoreOriginal ? (
          <EditorTool label={labels.restoreOriginal} onClick={onRestoreOriginal} />
        ) : null}
        <EditorTool label={labels.clear} onClick={onClear} disabled={!value.trim()} />
      </div>

      <button
        type="button"
        className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!value.trim()}
        onClick={onApply}
      >
        <span dir="auto">{labels.applyToComposer}</span>
      </button>
    </section>
  );
});

function EditorTool({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span dir="auto">{label}</span>
    </button>
  );
}
