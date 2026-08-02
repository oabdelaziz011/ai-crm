import { memo, useState } from "react";
import { Copy, Languages, Replace } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  insertBelowDraft,
  translateComposerDraft,
} from "@/lib/omnichannel/services/composer-translation-service";
import type { ComposerTranslateAction } from "@/lib/omnichannel/types/composer-enterprise-types";

type ComposerTranslatePopoverProps = {
  draft: string;
  agentLanguage: ResolvedConversationLanguage;
  labels: {
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    replace: string;
    insertBelow: string;
    copy: string;
    english: string;
    arabic: string;
    emptyDraft: string;
  };
  onApply: (nextDraft: string) => void;
  onCopy: (text: string) => void;
  children: React.ReactNode;
};

export const ComposerTranslatePopover = memo(function ComposerTranslatePopover({
  draft,
  agentLanguage,
  labels,
  onApply,
  onCopy,
  children,
}: ComposerTranslatePopoverProps) {
  const trimmed = draft.trim();
  const [target, setTarget] = useState<ResolvedConversationLanguage>(
    agentLanguage === "ar" ? "en" : "ar",
  );
  const preview = trimmed ? translateComposerDraft({ text: trimmed, target }) : null;

  const applyAction = (action: ComposerTranslateAction) => {
    if (!preview) return;
    if (action === "copy") {
      onCopy(preview.translated);
      return;
    }
    if (action === "replace") {
      onApply(preview.translated);
      return;
    }
    onApply(insertBelowDraft(draft, preview.translated));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-[var(--ad-accent)]" />
            <p className="text-sm font-semibold" dir="auto">{labels.title}</p>
          </div>
          {!trimmed ? (
            <p className="text-xs text-[var(--ad-text-muted)]" dir="auto">{labels.emptyDraft}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">
                  <span dir="auto">{labels.targetLanguage}</span>
                  <select
                    className="w-full rounded-md border border-[var(--ad-border-subtle)] bg-transparent px-2 py-1.5 text-xs"
                    value={target}
                    onChange={(event) => setTarget(event.target.value as ResolvedConversationLanguage)}
                  >
                    <option value="en">{labels.english}</option>
                    <option value="ar">{labels.arabic}</option>
                  </select>
                </label>
                <div className="rounded-md bg-[var(--ad-surface-2)] px-2 py-1.5 text-[10px] text-[var(--ad-text-muted)]">
                  <span dir="auto">{labels.sourceLanguage}</span>
                  <p className="mt-1 font-medium text-[var(--ad-text)]" dir="auto">
                    {preview?.source === "ar" ? labels.arabic : preview?.source === "en" ? labels.english : "—"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-[var(--ad-surface-2)] p-2 text-xs leading-relaxed" dir="auto">
                {preview?.translated}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" onClick={() => applyAction("replace")}>
                  <Replace className="size-3.5" />
                  <span dir="auto">{labels.replace}</span>
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => applyAction("insert_below")}>
                  <span dir="auto">{labels.insertBelow}</span>
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => applyAction("copy")}>
                  <Copy className="size-3.5" />
                  <span dir="auto">{labels.copy}</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
