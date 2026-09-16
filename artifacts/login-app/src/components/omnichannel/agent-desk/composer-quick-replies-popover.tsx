import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SuggestedReplyExplainLabels } from "@/components/omnichannel/agent-desk/suggested-reply-chip";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";
import type { SavedReply } from "@/lib/omnichannel/services/omnichannel-productivity-library";
import {
  beginQuickRepliesRefresh,
  completeQuickRepliesRefresh,
  createQuickRepliesSession,
  fingerprintSuggestionContext,
  reconcileQuickRepliesSession,
} from "@/lib/omnichannel/services/quick-replies-session";
import { cn } from "@/lib/utils";

export type ComposerQuickRepliesLabels = {
  quickReplies: string;
  aiSuggestions: string;
  savedReplies: string;
  refreshSuggestions: string;
  suggestionsUnavailable: string;
  generatingSuggestions: string;
  emptyState: string;
};

type ComposerQuickRepliesPopoverProps = {
  conversationId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entitled: boolean;
  suggestedReplies: IntelligentSuggestedReply[];
  suggestedReplyExplainLabels?: SuggestedReplyExplainLabels;
  savedReplies: SavedReply[];
  labels: ComposerQuickRepliesLabels;
  onBuildSuggestedReplies?: (options: {
    variantOffset: number;
  }) => IntelligentSuggestedReply[] | Promise<IntelligentSuggestedReply[]>;
  contextFingerprintParts?: {
    lastCustomerMessage?: string | null;
    targetLanguage?: string | null;
    intent?: string | null;
  };
  onSelectText: (text: string) => void;
  /**
   * @deprecated Do not pass composer send/reply disable here.
   * Quick Replies must stay openable for Saved Replies even when the agent cannot send.
   * Kept optional for call-site compatibility; the trigger ignores it.
   */
  disabled?: boolean;
  triggerClassName?: string;
};

/**
 * Composer send/reply disable (closed / missing reply permission) must NOT disable
 * the Quick Replies trigger. Matches Saved Replies / Templates toolbar behavior.
 */
export function isComposerQuickRepliesTriggerDisabled(_composerSendDisabled?: boolean): boolean {
  return false;
}

function SuggestionExplain({
  reply,
  labels,
}: {
  reply: IntelligentSuggestedReply;
  labels: SuggestedReplyExplainLabels;
}) {
  const moodLabel = labels.moodLabels[reply.explanation.mood] ?? reply.explanation.mood;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full p-0.5 text-[var(--ad-text-muted)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-accent)]"
          aria-label={labels.explainSuggestion}
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[60] w-72 border border-border bg-popover p-3 text-xs text-popover-foreground omni-overlay-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-2 font-semibold text-[var(--ad-text)]" dir="auto">
          {labels.title}
        </p>
        <dl className="space-y-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.reason}</dt>
            <dd className="mt-0.5 leading-relaxed text-[var(--ad-text)]" dir="auto">
              {reply.explanation.reason}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.intent}</dt>
            <dd className="mt-0.5 text-[var(--ad-text)]" dir="auto">
              {reply.explanation.intent}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.mood}</dt>
            <dd className="mt-0.5 text-[var(--ad-text)]" dir="auto">
              {moodLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.confidence}</dt>
            <dd className="mt-0.5 text-[var(--ad-text)]" dir="ltr">
              {reply.explanation.confidence}%
            </dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export const ComposerQuickRepliesPopover = memo(function ComposerQuickRepliesPopover({
  conversationId = null,
  open,
  onOpenChange,
  entitled,
  suggestedReplies,
  suggestedReplyExplainLabels,
  savedReplies,
  labels,
  onBuildSuggestedReplies,
  contextFingerprintParts,
  onSelectText,
  disabled: _composerSendDisabled,
  triggerClassName,
}: ComposerQuickRepliesPopoverProps) {
  const listId = useId();
  const refreshGenerationRef = useRef(0);
  // Intentionally ignore composer send/reply disable — Saved Replies must stay reachable.
  const triggerDisabled = isComposerQuickRepliesTriggerDisabled(_composerSendDisabled);
  const fingerprint = useMemo(
    () =>
      fingerprintSuggestionContext({
        conversationId,
        lastCustomerMessage: contextFingerprintParts?.lastCustomerMessage,
        targetLanguage: contextFingerprintParts?.targetLanguage,
        intent: contextFingerprintParts?.intent,
      }),
    [
      conversationId,
      contextFingerprintParts?.intent,
      contextFingerprintParts?.lastCustomerMessage,
      contextFingerprintParts?.targetLanguage,
    ],
  );

  const [session, setSession] = useState(() =>
    createQuickRepliesSession(conversationId, suggestedReplies, fingerprint),
  );

  useEffect(() => {
    setSession((prev) =>
      reconcileQuickRepliesSession({
        prev,
        conversationId,
        incomingSuggestions: suggestedReplies,
        contextFingerprint: fingerprint,
      }),
    );
  }, [conversationId, fingerprint, suggestedReplies]);

  const aiVisible = entitled && Boolean(suggestedReplyExplainLabels);
  const aiSuggestions = session.suggestions;
  const hasAi = aiVisible && aiSuggestions.length > 0;
  const hasSaved = savedReplies.length > 0;
  const showEmpty = !hasAi && !hasSaved && !session.loading;

  const handleSelect = useCallback(
    (text: string) => {
      onSelectText(text);
      onOpenChange(false);
    },
    [onOpenChange, onSelectText],
  );

  const runGenerate = useCallback(
    async (variantOffset: number, options?: { keepPreviousOnError?: boolean }) => {
      if (!aiVisible || !onBuildSuggestedReplies) return;
      let started = false;
      setSession((prev) => {
        const next = beginQuickRepliesRefresh(prev);
        if (!next) return prev;
        started = true;
        return next;
      });
      if (!started) return;

      const generation = ++refreshGenerationRef.current;
      const activeConversationId = conversationId;

      try {
        const next = await onBuildSuggestedReplies({ variantOffset });
        if (generation !== refreshGenerationRef.current) return;
        setSession((prev) =>
          completeQuickRepliesRefresh({
            prev,
            conversationId: activeConversationId,
            suggestions: next,
            variantOffset,
          }),
        );
      } catch {
        if (generation !== refreshGenerationRef.current) return;
        setSession((prev) =>
          completeQuickRepliesRefresh({
            prev,
            conversationId: activeConversationId,
            suggestions: options?.keepPreviousOnError ? prev.suggestions : prev.suggestions,
            variantOffset: options?.keepPreviousOnError ? prev.variantOffset : variantOffset,
            error: labels.suggestionsUnavailable,
          }),
        );
      }
    },
    [aiVisible, conversationId, labels.suggestionsUnavailable, onBuildSuggestedReplies],
  );

  const handleRefresh = useCallback(() => {
    void runGenerate(session.variantOffset + 1, { keepPreviousOnError: true });
  }, [runGenerate, session.variantOffset]);

  const llmHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !aiVisible || !onBuildSuggestedReplies) return;
    if (llmHydratedRef.current === fingerprint) return;
    llmHydratedRef.current = fingerprint;
    void runGenerate(0, { keepPreviousOnError: true });
  }, [open, aiVisible, onBuildSuggestedReplies, fingerprint, runGenerate]);

  useEffect(() => {
    refreshGenerationRef.current += 1;
    llmHydratedRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    // Context material change should allow a fresh LLM generation on next open.
    if (llmHydratedRef.current && llmHydratedRef.current !== fingerprint) {
      llmHydratedRef.current = null;
    }
  }, [fingerprint]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={triggerDisabled}
          aria-label={labels.quickReplies}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          data-testid="composer-quick-replies-trigger"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-semibold text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-accent)] disabled:opacity-50",
            open && "bg-[var(--ad-accent-dim)] text-[var(--ad-accent)]",
            triggerClassName,
          )}
        >
          <Sparkles className="size-3.5 shrink-0 text-[var(--ad-accent)]" aria-hidden />
          <span className="hidden max-w-[7.5rem] truncate sm:inline" dir="auto">
            {labels.quickReplies}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={listId}
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        data-testid="composer-quick-replies-popover"
        className="w-[min(22rem,calc(100vw-1.5rem))] border border-border bg-popover p-0 text-popover-foreground shadow-lg omni-overlay-surface"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const first = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
            "[data-quick-reply-item='true']",
          );
          first?.focus();
        }}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--ad-border-subtle)] px-3 py-2">
          <Sparkles className="size-3.5 text-[var(--ad-accent)]" aria-hidden />
          <p className="text-[11px] font-semibold text-[var(--ad-text)]" dir="auto">
            {labels.quickReplies}
          </p>
        </div>

        <div className="max-h-[min(22rem,50vh)] overflow-y-auto px-2 py-2">
          {aiVisible ? (
            <section aria-label={labels.aiSuggestions} className="mb-2">
              <p
                className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ad-accent)]"
                dir="auto"
              >
                {labels.aiSuggestions}
              </p>
              {session.loading ? (
                <div className="flex items-center gap-2 rounded-lg px-2 py-3 text-[11px] text-[var(--ad-text-muted)]">
                  <Loader2 className="size-3.5 animate-spin text-[var(--ad-accent)]" aria-hidden />
                  <span dir="auto">{labels.generatingSuggestions}</span>
                </div>
              ) : null}
              {!session.loading && session.error ? (
                <p className="px-1.5 py-2 text-[11px] text-[var(--ad-danger)]" role="status" dir="auto">
                  {session.error}
                </p>
              ) : null}
              {!session.loading && hasAi ? (
                <ul className="flex flex-col gap-1" role="listbox" aria-label={labels.aiSuggestions}>
                  {aiSuggestions.map((reply) => (
                    <li key={reply.id} className="flex items-start gap-1">
                      <button
                        type="button"
                        role="option"
                        data-quick-reply-item="true"
                        className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-start transition-colors hover:border-[color-mix(in_srgb,var(--ad-accent)_35%,transparent)] hover:bg-[var(--ad-accent-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ad-accent)]"
                        onClick={() => handleSelect(reply.text)}
                      >
                        <span className="text-[12px] leading-snug text-[var(--ad-text)]" dir="auto">
                          {reply.text}
                        </span>
                        <span
                          className="mt-1 inline-flex rounded-full bg-[var(--ad-accent-dim)] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-[var(--ad-accent)]"
                          dir="ltr"
                        >
                          {reply.confidence}%
                        </span>
                      </button>
                      {suggestedReplyExplainLabels ? (
                        <div className="pt-1.5">
                          <SuggestionExplain reply={reply} labels={suggestedReplyExplainLabels} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!session.loading && !hasAi && !session.error ? (
                <p className="px-1.5 py-2 text-[11px] text-[var(--ad-text-muted)]" dir="auto">
                  {labels.suggestionsUnavailable}
                </p>
              ) : null}
            </section>
          ) : null}

          {hasSaved ? (
            <section
              aria-label={labels.savedReplies}
              className={aiVisible ? "border-t border-[var(--ad-border-subtle)] pt-2" : undefined}
            >
              <p
                className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]"
                dir="auto"
              >
                {labels.savedReplies}
              </p>
              <ul className="flex flex-col gap-0.5" role="listbox" aria-label={labels.savedReplies}>
                {savedReplies.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      role="option"
                      data-quick-reply-item="true"
                      className="flex w-full flex-col rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-[var(--ad-accent-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ad-accent)]"
                      onClick={() => handleSelect(entry.body)}
                    >
                      <span className="text-[11px] font-medium text-[var(--ad-text)]" dir="auto">
                        {entry.title}
                      </span>
                      <span className="line-clamp-2 text-[10px] text-[var(--ad-text-muted)]" dir="auto">
                        {entry.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showEmpty ? (
            <p className="px-1.5 py-4 text-center text-[11px] text-[var(--ad-text-muted)]" dir="auto">
              {labels.emptyState}
            </p>
          ) : null}
        </div>

        {aiVisible && onBuildSuggestedReplies ? (
          <div className="border-t border-[var(--ad-border-subtle)] px-2 py-1.5">
            <button
              type="button"
              data-testid="composer-quick-replies-refresh"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-[var(--ad-accent)] transition-colors hover:bg-[var(--ad-accent-dim)] disabled:opacity-50"
              onClick={handleRefresh}
              disabled={session.loading}
            >
              {session.loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              <span dir="auto">{labels.refreshSuggestions}</span>
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
});
