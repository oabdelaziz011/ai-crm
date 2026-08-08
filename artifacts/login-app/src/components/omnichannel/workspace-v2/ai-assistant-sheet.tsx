import { memo, useCallback, type KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { improveToneDraftText, type RewriteMode } from "@/lib/omnichannel/services/ai-assist-service";
import { getRewriteOptions } from "@/lib/omnichannel/services/omnichannel-productivity-library";
import { isRtlLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { getSuggestedReplyExplainLabels } from "@/lib/omnichannel/presentation/ai-assistant-labels";
import { SuggestedReplyChip } from "@/components/omnichannel/agent-desk/suggested-reply-chip";
import type { OmnichannelAiAssistModel } from "@/lib/omnichannel/types/unified-conversation";
import { AiAssistantEditor } from "@/components/omnichannel/workspace-v2/ai-assistant-editor";
import { useAiAssistantEditorState } from "@/components/omnichannel/workspace-v2/use-ai-assistant-editor-state";

export type AiAssistantSheetLabels = {
  title: string;
  suggestedReplies: string;
  rewrite: string;
  rewriteOptions: string;
  summarize: string;
  conversationSummary: string;
  improveTone: string;
  translate: string;
  applyToComposer: string;
  copy: string;
  generate: string;
  commands: string;
  unavailable: string;
  runtimeUnavailable: string;
  noConversation: string;
  translateUnavailable: string;
  rewriteUnavailable: string;
  editorTitle: string;
  editorPlaceholder: string;
  undo: string;
  redo: string;
  clear: string;
  replace: string;
  restoreOriginal: string;
  applyShortcut: string;
};

type AiAssistantSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: OmnichannelAiAssistModel;
  hasConversation?: boolean;
  getDraftText: () => string;
  labels: AiAssistantSheetLabels;
  onApplyText: (text: string) => void;
};

type CommandButtonProps = {
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
};

function CommandButton({ label, disabled, disabledReason, onClick }: CommandButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-8 justify-start text-xs"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onClick}
    >
      <span dir="auto">{label}</span>
    </Button>
  );
}

export const AiAssistantSheet = memo(function AiAssistantSheet({
  open,
  onOpenChange,
  model,
  hasConversation = true,
  getDraftText,
  labels,
  onApplyText,
}: AiAssistantSheetProps) {
  const dir = isRtlLanguage(model.resolvedLanguage) ? "rtl" : "ltr";
  const hasSummary = Boolean(model.summary?.trim());
  const hasSuggestions = model.suggestedReplies.length > 0;
  const emptyMessage = hasConversation ? labels.runtimeUnavailable : labels.noConversation;

  const editor = useAiAssistantEditorState(open, getDraftText, model.resolvedLanguage);

  const rewriteOptions = getRewriteOptions(model.resolvedLanguage).filter(
    (option) => option.id !== "translate_en" && option.id !== "translate_ar",
  );
  const explainLabels = getSuggestedReplyExplainLabels(model.resolvedLanguage);
  const rewriteEnabled = editor.editorText.trim().length > 0;

  const handleApplyToComposer = useCallback(() => {
    const trimmed = editor.editorText.trim();
    if (!trimmed) return;
    onApplyText(trimmed);
  }, [editor.editorText, onApplyText]);

  const handleCopy = useCallback(async () => {
    if (!editor.editorText.trim()) return;
    try {
      await navigator.clipboard.writeText(editor.editorText);
    } catch {
      // Clipboard unavailable — presentation-only fallback is silent.
    }
  }, [editor.editorText]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleApplyToComposer();
      }
    },
    [handleApplyToComposer, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        dir={dir}
        className="flex w-full flex-col sm:max-w-md"
        onKeyDown={handleKeyDown}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0" />
            <span dir="auto">{labels.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
          <AiAssistantEditor
            value={editor.editorText}
            onChange={editor.onEditorInput}
            language={model.resolvedLanguage}
            panelDir={dir}
            labels={{
              editorTitle: labels.editorTitle,
              editorPlaceholder: labels.editorPlaceholder,
              undo: labels.undo,
              redo: labels.redo,
              clear: labels.clear,
              copy: labels.copy,
              replace: labels.replace,
              restoreOriginal: labels.restoreOriginal,
              applyToComposer: labels.applyToComposer,
              applyShortcut: labels.applyShortcut,
            }}
            onApply={handleApplyToComposer}
            onUndo={editor.undo}
            onRedo={editor.redo}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            onClear={editor.clear}
            onCopy={handleCopy}
            onReplace={editor.replaceFromComposer}
            onRestoreOriginal={editor.restoreOriginal}
            showRestoreOriginal={editor.showRestoreOriginal}
          />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
              {labels.suggestedReplies}
            </h3>
            <div className="flex flex-col gap-1.5">
              {hasSuggestions ? (
                model.suggestedReplies.slice(0, 5).map((reply) => (
                  <SuggestedReplyChip
                    key={reply.id}
                    reply={reply}
                    labels={explainLabels}
                    onSelect={(text) => editor.loadSuggestion(text)}
                  />
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground" dir="auto">
                  {emptyMessage}
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
              {labels.rewriteOptions}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {rewriteOptions.map((option) => (
                <CommandButton
                  key={option.id}
                  label={option.label}
                  disabled={!rewriteEnabled}
                  disabledReason={labels.rewriteUnavailable}
                  onClick={() => editor.applyRewrite(option.id as RewriteMode)}
                />
              ))}
            </div>
            {!rewriteEnabled ? (
              <p className="mt-2 text-[11px] text-muted-foreground" dir="auto">
                {labels.rewriteUnavailable}
              </p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
              {labels.commands}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <CommandButton
                label={labels.improveTone}
                disabled={!rewriteEnabled}
                disabledReason={labels.unavailable}
                onClick={() => editor.applyImproveTone(improveToneDraftText)}
              />
              <CommandButton
                label={labels.generate}
                disabled={!hasSummary}
                disabledReason={labels.unavailable}
                onClick={() => editor.loadSuggestion(model.summary)}
              />
              <CommandButton
                label={labels.translate}
                disabled={!rewriteEnabled}
                disabledReason={labels.translateUnavailable}
                onClick={editor.applyTranslate}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-muted/30 p-3">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground" dir="auto">
              {labels.conversationSummary}
            </h3>
            {hasSummary ? (
              <>
                <p className="text-sm leading-relaxed" dir="auto">{model.summary}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-[10px]"
                  onClick={() => editor.loadSuggestion(model.summary)}
                >
                  <span dir="auto">{labels.generate}</span>
                </Button>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground" dir="auto">
                {emptyMessage}
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
});
