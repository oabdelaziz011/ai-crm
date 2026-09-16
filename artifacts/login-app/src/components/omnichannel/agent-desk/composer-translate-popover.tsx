import { memo, useEffect, useId, useRef, useState } from "react";
import { Copy, Languages, Loader2, Replace } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  insertBelowDraft,
  translateComposerDraftAsync,
} from "@/lib/omnichannel/services/composer-translation-service";
import type { ComposerTranslateAction } from "@/lib/omnichannel/types/composer-enterprise-types";

type ComposerTranslatePopoverProps = {
  draft: string;
  companyId?: string | null;
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
    translating?: string;
    failed?: string;
  };
  onApply: (nextDraft: string) => void;
  onCopy: (text: string) => void;
  children: React.ReactNode;
};

export const ComposerTranslatePopover = memo(function ComposerTranslatePopover({
  draft,
  companyId = null,
  agentLanguage,
  labels,
  onApply,
  onCopy,
  children,
}: ComposerTranslatePopoverProps) {
  const trimmed = draft.trim();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ResolvedConversationLanguage>(
    agentLanguage === "ar" ? "en" : "ar",
  );
  const [preview, setPreview] = useState<{
    source: "ar" | "en" | "unknown";
    translated: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !trimmed) {
      setPreview(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    void translateComposerDraftAsync({
      text: trimmed,
      target,
      companyId,
    })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setPreview({ source: result.source, translated: result.translated });
        setLoading(false);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setPreview(null);
        setLoading(false);
        setError(labels.failed ?? "Couldn't translate right now");
      });
  }, [open, trimmed, target, companyId, labels.failed]);

  const applyAction = (action: ComposerTranslateAction) => {
    if (!preview?.translated || loading) return;
    if (action === "copy") {
      onCopy(preview.translated);
      return;
    }
    if (action === "replace") {
      onApply(preview.translated);
      setOpen(false);
      return;
    }
    onApply(insertBelowDraft(draft, preview.translated));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        id={listId}
        align="start"
        className="w-80 border border-border bg-popover p-3 text-popover-foreground omni-overlay-surface"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-[var(--ad-accent)]" />
            <p className="text-sm font-semibold" dir="auto">
              {labels.title}
            </p>
          </div>
          {!trimmed ? (
            <p className="text-xs text-[var(--ad-text-muted)]" dir="auto">
              {labels.emptyDraft}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">
                  <span dir="auto">{labels.targetLanguage}</span>
                  <select
                    className="w-full rounded-md border border-[var(--ad-border-subtle)] bg-transparent px-2 py-1.5 text-xs"
                    value={target}
                    onChange={(event) =>
                      setTarget(event.target.value as ResolvedConversationLanguage)
                    }
                  >
                    <option value="en">{labels.english}</option>
                    <option value="ar">{labels.arabic}</option>
                  </select>
                </label>
                <div className="rounded-md bg-[var(--ad-surface-2)] px-2 py-1.5 text-[10px] text-[var(--ad-text-muted)]">
                  <span dir="auto">{labels.sourceLanguage}</span>
                  <p className="mt-1 font-medium text-[var(--ad-text)]" dir="auto">
                    {preview?.source === "ar"
                      ? labels.arabic
                      : preview?.source === "en"
                        ? labels.english
                        : "—"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-[var(--ad-surface-2)] p-2 text-xs leading-relaxed" dir="auto">
                {loading ? (
                  <span className="inline-flex items-center gap-2 text-[var(--ad-text-muted)]">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {labels.translating ?? "Translating…"}
                  </span>
                ) : error ? (
                  <span className="text-[var(--ad-danger)]" role="status">
                    {error}
                  </span>
                ) : (
                  preview?.translated
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1"
                  disabled={loading || !preview?.translated}
                  onClick={() => applyAction("replace")}
                >
                  <Replace className="size-3.5" />
                  <span dir="auto">{labels.replace}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={loading || !preview?.translated}
                  onClick={() => applyAction("insert_below")}
                >
                  <span dir="auto">{labels.insertBelow}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1"
                  disabled={loading || !preview?.translated}
                  onClick={() => applyAction("copy")}
                >
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
