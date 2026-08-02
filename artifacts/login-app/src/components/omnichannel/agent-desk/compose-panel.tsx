import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Bookmark,
  Languages,
  LayoutTemplate,
  Loader2,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Send,
  Smile,
  Sparkles,
} from "lucide-react";
import { Can } from "@/components/rbac/permission-guard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AttachmentPreviewStrip } from "@/components/omnichannel/agent-desk/attachment-preview-strip";
import { ComposerMentionList } from "@/components/omnichannel/agent-desk/composer-mention-list";
import { ComposerTranslatePopover } from "@/components/omnichannel/agent-desk/composer-translate-popover";
import {
  SuggestedReplyChip,
  type SuggestedReplyExplainLabels,
} from "@/components/omnichannel/agent-desk/suggested-reply-chip";
import { useAuth } from "@/context/auth-context";
import { useComposerAttachments } from "@/hooks/omnichannel/use-composer-attachments";
import { useComposerMentionTargets } from "@/hooks/omnichannel/use-composer-mention-targets";
import {
  getComposerFeatureDisabledReasonKey,
  isComposerFeatureInteractive,
  isComposerFeatureVisible,
  type OmnichannelComposerFeature,
} from "@/lib/omnichannel/config/omnichannel-ui-features";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { composerDirAttribute } from "@/lib/omnichannel/presentation/text-direction";
import {
  filterSlashCommands,
  filterSnippetCommands,
  getReplyTemplates,
  getSavedReplies,
  matchSlashCommand,
  matchSnippetCommand,
  type SlashCommand,
  type SnippetCommand,
} from "@/lib/omnichannel/services/omnichannel-productivity-library";
import { UndoSendBar } from "@/components/omnichannel/agent-desk/undo-send-bar";
import { EmojiPickerGrid } from "@/components/omnichannel/agent-desk/emoji-picker-grid";
import {
  extractMentionsFromText,
  formatMentionToken,
  parseMentionQuery,
} from "@/lib/omnichannel/services/composer-mention-service";
import { COMPOSER_ATTACHMENT_ACCEPT } from "@/lib/omnichannel/types/composer-enterprise-types";
import {
  traceOmniSendEnter,
  traceOmniSendExit,
} from "@/lib/omnichannel/debug/omni-send-pipeline-audit";
import type {
  ComposerMentionTarget,
  ComposerSendPayload,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";

export type ComposePanelHandle = {
  focus: () => void;
  setMode: (mode: "reply" | "internal_note") => void;
  insertText: (text: string) => void;
  getDraft: () => string;
  setDraft: (text: string) => void;
};

type ComposePanelProps = {
  disabled?: boolean;
  isSending?: boolean;
  conversationId?: string | null;
  suggestedReplies?: IntelligentSuggestedReply[];
  suggestedReplyExplainLabels?: SuggestedReplyExplainLabels;
  conversationLanguage?: ResolvedConversationLanguage;
  detectedLanguage?: string;
  labels: {
    placeholder: string;
    internalNote: string;
    reply: string;
    send: string;
    templates: string;
    savedReplies: string;
    variables: string;
    voice: string;
    emoji: string;
    attachments: string;
    aiRewrite: string;
    aiAssistant: string;
    translate: string;
    language: string;
    suggestedReplies: string;
    keyboardHint: string;
    mention: string;
    slashCommands: string;
    snippetCommands: string;
    undoSend: string;
    undoAction: string;
    translatePanel: {
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
    mentionPanel: {
      agents: string;
      teams: string;
      online: string;
    };
    disabledReasons: Partial<Record<OmnichannelComposerFeature, string>> & { generic: string };
  };
  onSend: (payload: ComposerSendPayload) => void | Promise<boolean>;
  onDraftChange?: (text: string) => void;
  onOpenAiAssistant?: () => void;
  undoSecondsLeft?: number;
  onUndoSend?: () => void;
  scheduleSendWithUndo?: (execute: () => void) => void;
};

function insertAtCursor(node: HTMLTextAreaElement, current: string, insert: string): string {
  const start = node.selectionStart ?? current.length;
  const end = node.selectionEnd ?? current.length;
  return `${current.slice(0, start)}${insert}${current.slice(end)}`;
}

export const ComposePanel = memo(
  forwardRef<ComposePanelHandle, ComposePanelProps>(function ComposePanel(
    {
      disabled,
      isSending,
      conversationId,
      suggestedReplies = [],
      suggestedReplyExplainLabels,
      conversationLanguage = "en",
      detectedLanguage,
      labels,
      onSend,
      onDraftChange,
      onOpenAiAssistant,
      undoSecondsLeft = 0,
      onUndoSend,
      scheduleSendWithUndo,
    },
    ref,
  ) {
    const { company } = useAuth();
    const companyId = company?.id ?? null;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const composingRef = useRef(false);
    const undoPayloadRef = useRef<ComposerSendPayload | null>(null);
    const [draft, setDraft] = useState("");
    const [mode, setMode] = useState<"reply" | "internal_note">("reply");
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [savedRepliesOpen, setSavedRepliesOpen] = useState(false);
    const [slashOpen, setSlashOpen] = useState(false);
    const [snippetOpen, setSnippetOpen] = useState(false);
    const [slashHighlight, setSlashHighlight] = useState(0);
    const [snippetHighlight, setSnippetHighlight] = useState(0);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [cursor, setCursor] = useState(0);
    const attachmentState = useComposerAttachments();
    const mentionQuery = useMemo(() => parseMentionQuery(draft, cursor), [draft, cursor]);
    const { targets: mentionTargets, allTargets: allMentionTargets } = useComposerMentionTargets(
      companyId,
      mentionOpen ? mentionQuery : null,
    );

    const savedReplies = useMemo(() => getSavedReplies(conversationLanguage), [conversationLanguage]);
    const templates = useMemo(() => getReplyTemplates(conversationLanguage), [conversationLanguage]);
    const draftDir = composerDirAttribute(draft);

    const slashQuery = useMemo(() => {
      const match = draft.match(/(?:^|\s)(\/[^\s]*)$/);
      return match?.[1] ?? null;
    }, [draft]);

    const slashMatches = useMemo(
      () => (slashQuery ? filterSlashCommands(conversationLanguage, slashQuery) : []),
      [conversationLanguage, slashQuery],
    );

    const snippetQuery = useMemo(() => {
      const match = draft.match(/(?:^|\s)(::[^\s]*)$/);
      return match?.[1] ?? null;
    }, [draft]);

    const snippetMatches = useMemo(
      () => (snippetQuery ? filterSnippetCommands(conversationLanguage, snippetQuery) : []),
      [conversationLanguage, snippetQuery],
    );

    useEffect(() => {
      setSlashOpen(Boolean(slashQuery && slashMatches.length > 0 && !snippetQuery));
      setSlashHighlight(0);
    }, [slashQuery, slashMatches.length, snippetQuery]);

    useEffect(() => {
      setSnippetOpen(Boolean(snippetQuery && snippetMatches.length > 0));
      setSnippetHighlight(0);
    }, [snippetQuery, snippetMatches.length]);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      setMode: (next) => {
        setMode(next);
        textareaRef.current?.focus();
      },
      insertText: (text) => {
        const node = textareaRef.current;
        if (!node) {
          setDraft((current) => `${current}${text}`);
          return;
        }
        setDraft((current) => {
          const next = insertAtCursor(node, current, text);
          requestAnimationFrame(() => {
            const cursor = (node.selectionStart ?? current.length) + text.length;
            node.selectionStart = cursor;
            node.selectionEnd = cursor;
            node.focus();
          });
          return next;
        });
      },
      getDraft: () => draft,
      setDraft: (next) => setDraft(next),
    }));

    const resize = useCallback(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.style.height = "auto";
      node.style.height = `${Math.min(Math.max(node.scrollHeight, 40), 220)}px`;
    }, []);

    useEffect(() => {
      resize();
    }, [draft, resize]);

    const applySlashCommand = useCallback((command: SlashCommand) => {
      setDraft(command.body);
      setSlashOpen(false);
      textareaRef.current?.focus();
    }, []);

    const applySavedReply = useCallback((body: string) => {
      setDraft(body);
      setSavedRepliesOpen(false);
      textareaRef.current?.focus();
    }, []);

    const applyTemplate = useCallback((body: string) => {
      setDraft(body);
      setTemplatesOpen(false);
      textareaRef.current?.focus();
    }, []);

    const applySnippetCommand = useCallback((command: SnippetCommand) => {
      setDraft(command.body);
      setSnippetOpen(false);
      textareaRef.current?.focus();
    }, []);

    useEffect(() => {
      setMentionOpen(
        mentionQuery !== null
        && isComposerFeatureInteractive("mention")
        && !slashOpen
        && !snippetOpen,
      );
      setMentionHighlight(0);
    }, [mentionQuery, slashOpen, snippetOpen]);

    const insertMention = useCallback(
      (target: ComposerMentionTarget) => {
        const token = formatMentionToken(target);
        const node = textareaRef.current;
        if (mentionQuery === null) {
          setDraft((current) => `${current}${token} `);
          setMentionOpen(false);
          requestAnimationFrame(() => node?.focus());
          return;
        }
        const before = draft.slice(0, cursor);
        const after = draft.slice(cursor);
        const replaced = before.replace(
          /(?:^|\s)@[\w\u0600-\u06FF.-]*$/u,
          (match) => `${match.startsWith("@") ? "" : match.slice(0, match.lastIndexOf("@"))}${token}`,
        );
        const next = `${replaced} ${after}`;
        setDraft(next);
        onDraftChange?.(next);
        setMentionOpen(false);
        requestAnimationFrame(() => {
          const nextCursor = replaced.length + 1;
          if (node) {
            node.selectionStart = nextCursor;
            node.selectionEnd = nextCursor;
            node.focus();
          }
          setCursor(nextCursor);
        });
      },
      [cursor, draft, mentionQuery, onDraftChange],
    );

    const handleAddFiles = useCallback(
      (files: FileList | File[]) => {
        if (!isComposerFeatureInteractive("attachments")) return;
        attachmentState.addFiles(files);
      },
      [attachmentState],
    );

    const canSend = useMemo(() => {
      const hasText = draft.trim().length > 0;
      return (hasText || attachmentState.hasAttachments) && !disabled && !isSending;
    }, [attachmentState.hasAttachments, disabled, draft, isSending]);

    const executeSend = useCallback(async () => {
      const payload = undoPayloadRef.current;
      if (!payload) return;
      undoPayloadRef.current = null;
      traceOmniSendEnter({
        layer: 1,
        stage: "ReplyComposer.executeSend",
        file: "compose-panel.tsx",
        function: "executeSend",
        line: 327,
        conversationId: conversationId ?? null,
        extra: { mode: payload.mode, textLength: payload.text.length },
      });
      try {
        const result = await onSend(payload);
        traceOmniSendExit({
          layer: 1,
          stage: "ReplyComposer.executeSend",
          success: result !== false,
          conversationId: conversationId ?? null,
          extra: { onSendResult: result },
        });
        if (result === false) {
          setDraft(payload.text);
          requestAnimationFrame(() => textareaRef.current?.focus());
        } else {
          attachmentState.clearAttachments();
        }
      } catch (error) {
        traceOmniSendExit({
          layer: 1,
          stage: "ReplyComposer.executeSend",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          conversationId: conversationId ?? null,
        });
        setDraft(payload.text);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }, [attachmentState, conversationId, onSend]);

    const send = useCallback(() => {
      void (async () => {
        const matchedSlash = matchSlashCommand(conversationLanguage, draft);
        const matchedSnippet = matchSnippetCommand(conversationLanguage, draft);
        const text = matchedSlash?.body ?? matchedSnippet?.body ?? draft;
        const hasText = Boolean(text.trim());
        const hasPending = attachmentState.hasAttachments;
        if ((!hasText && !hasPending) || disabled || isSending) return;

        let uploadedAttachments: ComposerUploadedAttachment[] | undefined;
        if (hasPending) {
          if (!companyId || !conversationId) return;
          try {
            uploadedAttachments = await attachmentState.uploadAll(companyId, conversationId);
          } catch {
            return;
          }
        }

        const mentions = extractMentionsFromText(text, allMentionTargets);
        const payload: ComposerSendPayload = {
          text,
          mode,
          attachments: uploadedAttachments,
          mentions: mentions.length > 0 ? mentions : undefined,
        };

        undoPayloadRef.current = payload;
        setDraft("");
        onDraftChange?.("");
        requestAnimationFrame(() => textareaRef.current?.focus());

        if (scheduleSendWithUndo) {
          scheduleSendWithUndo(() => void executeSend());
        } else {
          traceOmniSendEnter({
            layer: 1,
            stage: "ReplyComposer.submit",
            file: "compose-panel.tsx",
            function: "send",
            line: 345,
            conversationId: conversationId ?? null,
            extra: { mode, hasAttachments: Boolean(uploadedAttachments?.length) },
          });
          await executeSend();
          traceOmniSendExit({
            layer: 1,
            stage: "ReplyComposer.submit",
            success: true,
            conversationId: conversationId ?? null,
          });
        }
      })();
    }, [
      allMentionTargets,
      attachmentState,
      companyId,
      conversationId,
      conversationLanguage,
      disabled,
      draft,
      executeSend,
      isSending,
      mode,
      onDraftChange,
      scheduleSendWithUndo,
    ]);

    const disabledReason = useCallback(
      (feature: OmnichannelComposerFeature) => {
        const key = getComposerFeatureDisabledReasonKey(feature);
        if (!key) return null;
        return labels.disabledReasons[feature] ?? labels.disabledReasons.generic;
      },
      [labels.disabledReasons],
    );

    const showSuggested =
      isComposerFeatureVisible("suggestedReplies")
      && suggestedReplies.length > 0
      && suggestedReplyExplainLabels;

    return (
      <div className="shrink-0 px-1 pb-2 pt-0.5 sm:px-2">
        <div
          className={`agent-desk-compose relative rounded-xl ${
            mode === "internal_note"
              ? "bg-amber-950/10 ring-1 ring-amber-500/20"
              : "bg-[var(--ad-surface-raised)] ring-1 ring-[var(--ad-border-subtle)]/50"
          }`}
          onDragOver={(event) => {
            if (!isComposerFeatureInteractive("attachments")) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!isComposerFeatureInteractive("attachments")) return;
            event.preventDefault();
            if (event.dataTransfer.files.length > 0) {
              handleAddFiles(event.dataTransfer.files);
            }
          }}
        >
          {showSuggested ? (
            <div className="flex flex-wrap gap-1 border-b border-[var(--ad-border-subtle)]/80 px-2.5 py-1.5">
              <span className="w-full text-[9px] uppercase tracking-wide text-[var(--ad-text-muted)]">
                {labels.suggestedReplies}
              </span>
              {suggestedReplies.slice(0, 3).map((reply) => (
                <SuggestedReplyChip
                  key={reply.id}
                  reply={reply}
                  labels={suggestedReplyExplainLabels!}
                  onSelect={setDraft}
                  compact
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--ad-border-subtle)]/80 px-1.5 py-1">
            {isComposerFeatureVisible("emoji") && isComposerFeatureInteractive("emoji") ? (
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={labels.emoji}
                    className="rounded-md p-1.5 text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-text)]"
                  >
                    <Smile className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-2">
                  <EmojiPickerGrid
                    onSelect={(emoji) => {
                      const node = textareaRef.current;
                      if (node) {
                        setDraft((current) => insertAtCursor(node, current, emoji));
                        requestAnimationFrame(() => {
                          const cursor = (node.selectionStart ?? 0) + emoji.length;
                          node.selectionStart = cursor;
                          node.selectionEnd = cursor;
                          node.focus();
                        });
                      } else {
                        setDraft((current) => `${current}${emoji}`);
                      }
                      setEmojiOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            {isComposerFeatureVisible("attachments") ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={COMPOSER_ATTACHMENT_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files?.length) handleAddFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Tool
                  icon={<Paperclip className="size-3.5" />}
                  label={labels.attachments}
                  disabled={!isComposerFeatureInteractive("attachments")}
                  disabledHint={disabledReason("attachments") ?? undefined}
                  onClick={() => fileInputRef.current?.click()}
                />
              </>
            ) : null}
            {isComposerFeatureVisible("voice") ? (
              <Tool icon={<Mic className="size-3.5" />} label={labels.voice} disabled={!isComposerFeatureInteractive("voice")} disabledHint={disabledReason("voice") ?? undefined} />
            ) : null}
            {isComposerFeatureVisible("savedReplies") && isComposerFeatureInteractive("savedReplies") ? (
              <Popover open={savedRepliesOpen} onOpenChange={setSavedRepliesOpen}>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={labels.savedReplies} className="rounded-md p-1.5 text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-text)]">
                    <Bookmark className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-1">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.savedReplies}</p>
                  {savedReplies.map((entry) => (
                    <button key={entry.id} type="button" className="flex w-full flex-col rounded-md px-2 py-1.5 text-start hover:bg-[var(--ad-accent-dim)]" onClick={() => applySavedReply(entry.body)}>
                      <span className="text-[11px] font-medium" dir="auto">{entry.title}</span>
                      <span className="line-clamp-2 text-[10px] text-[var(--ad-text-muted)]" dir="auto">{entry.body}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : null}
            {isComposerFeatureVisible("templates") && isComposerFeatureInteractive("templates") ? (
              <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={labels.templates} className="rounded-md p-1.5 text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-text)]">
                    <LayoutTemplate className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-1">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]">{labels.templates}</p>
                  {templates.map((entry) => (
                    <button key={entry.id} type="button" className="flex w-full flex-col rounded-md px-2 py-1.5 text-start hover:bg-[var(--ad-accent-dim)]" onClick={() => applyTemplate(entry.body)}>
                      <span className="text-[11px] font-medium" dir="auto">{entry.title}</span>
                      <span className="line-clamp-2 text-[10px] text-[var(--ad-text-muted)]" dir="auto">{entry.body}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : isComposerFeatureVisible("templates") ? (
              <Tool label={labels.templates} disabled={!isComposerFeatureInteractive("templates")} disabledHint={disabledReason("templates") ?? undefined} />
            ) : null}
            {onOpenAiAssistant ? (
              <Tool
                icon={<Sparkles className="size-3.5" />}
                label={labels.aiAssistant}
                onClick={onOpenAiAssistant}
              />
            ) : isComposerFeatureVisible("aiRewrite") ? (
              <Tool icon={<Sparkles className="size-3.5" />} label={labels.aiRewrite} disabled={!isComposerFeatureInteractive("aiRewrite")} disabledHint={disabledReason("aiRewrite") ?? undefined} />
            ) : null}
            {isComposerFeatureVisible("translate") && isComposerFeatureInteractive("translate") ? (
              <ComposerTranslatePopover
                draft={draft}
                agentLanguage={conversationLanguage}
                labels={labels.translatePanel}
                onApply={(nextDraft) => {
                  setDraft(nextDraft);
                  onDraftChange?.(nextDraft);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                onCopy={(text) => {
                  void navigator.clipboard.writeText(text);
                }}
              >
                <button
                  type="button"
                  aria-label={labels.translate}
                  className="rounded-md p-1.5 text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-text)]"
                >
                  <Languages className="size-3.5" />
                </button>
              </ComposerTranslatePopover>
            ) : isComposerFeatureVisible("translate") ? (
              <Tool icon={<Languages className="size-3.5" />} label={labels.translate} disabled={!isComposerFeatureInteractive("translate")} disabledHint={disabledReason("translate") ?? undefined} />
            ) : null}
            {isComposerFeatureVisible("mention") ? (
              <Tool
                icon={<AtSign className="size-3.5" />}
                label={labels.mention}
                disabled={!isComposerFeatureInteractive("mention")}
                disabledHint={disabledReason("mention") ?? undefined}
                onClick={() => {
                  const node = textareaRef.current;
                  const next = `${draft}${draft.endsWith(" ") || draft.length === 0 ? "" : " "}@`;
                  setDraft(next);
                  onDraftChange?.(next);
                  setMentionOpen(true);
                  requestAnimationFrame(() => {
                    node?.focus();
                    const pos = next.length;
                    if (node) {
                      node.selectionStart = pos;
                      node.selectionEnd = pos;
                    }
                    setCursor(pos);
                  });
                }}
              />
            ) : null}
            {isComposerFeatureVisible("internalNote") ? (
              <Tool icon={<MessageSquarePlus className="size-3.5" />} label={labels.internalNote} active={mode === "internal_note"} onClick={() => setMode((m) => (m === "internal_note" ? "reply" : "internal_note"))} />
            ) : null}
            {detectedLanguage ? (
              <span className="ms-auto pe-1 text-[9px] text-[var(--ad-text-muted)]" dir="auto">
                {labels.language}: {detectedLanguage}
              </span>
            ) : null}
          </div>

          {attachmentState.attachments.length > 0 ? (
            <div className="px-2 pt-2">
              <AttachmentPreviewStrip
                attachments={attachmentState.attachments}
                onRemove={attachmentState.removeAttachment}
              />
            </div>
          ) : null}

          {attachmentState.uploadError ? (
            <p className="px-2.5 pb-1 text-[10px] text-[var(--ad-danger)]" dir="auto" role="alert">
              {attachmentState.uploadError}
            </p>
          ) : null}

          <div className="relative flex items-end gap-2 p-2">
            {slashOpen ? (
              <div className="absolute inset-x-2 bottom-full z-20 mb-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--ad-border-subtle)] bg-[var(--ad-surface-raised)] py-1 shadow-lg" role="listbox" aria-label={labels.slashCommands}>
                {slashMatches.map((entry, index) => (
                  <button
                    key={entry.command}
                    type="button"
                    role="option"
                    aria-selected={index === slashHighlight}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-xs ${index === slashHighlight ? "bg-[var(--ad-accent-dim)]" : "hover:bg-[var(--ad-accent-dim)]/60"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySlashCommand(entry);
                    }}
                  >
                    <span className="font-medium" dir="auto">{entry.command}</span>
                    <span className="text-[10px] text-[var(--ad-text-muted)]" dir="auto">{entry.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {snippetOpen ? (
              <div className="absolute inset-x-2 bottom-full z-20 mb-1 max-h-44 overflow-y-auto rounded-lg bg-[var(--ad-surface-raised)] py-1 shadow-lg ring-1 ring-[var(--ad-border-subtle)]" role="listbox" aria-label={labels.snippetCommands}>
                {snippetMatches.map((entry, index) => (
                  <button
                    key={entry.command}
                    type="button"
                    role="option"
                    aria-selected={index === snippetHighlight}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-xs ${index === snippetHighlight ? "bg-[var(--ad-accent-dim)]" : "hover:bg-[var(--ad-accent-dim)]/60"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySnippetCommand(entry);
                    }}
                  >
                    <span className="font-medium" dir="auto">{entry.command}</span>
                    <span className="text-[10px] text-[var(--ad-text-muted)]" dir="auto">{entry.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {mentionOpen && mentionTargets.length > 0 ? (
              <ComposerMentionList
                targets={mentionTargets}
                highlightIndex={mentionHighlight}
                labels={labels.mentionPanel}
                onSelect={insertMention}
              />
            ) : null}

            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled || isSending}
              rows={1}
              placeholder={mode === "internal_note" ? labels.internalNote : labels.placeholder}
              aria-label={mode === "internal_note" ? labels.internalNote : labels.reply}
              dir={draftDir}
              onChange={(event) => {
                setDraft(event.target.value);
                setCursor(event.target.selectionStart ?? event.target.value.length);
                onDraftChange?.(event.target.value);
              }}
              onSelect={(event) => {
                setCursor(event.currentTarget.selectionStart ?? 0);
              }}
              onClick={(event) => {
                setCursor(event.currentTarget.selectionStart ?? 0);
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (mentionOpen && mentionTargets.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionHighlight((current) => (current + 1) % mentionTargets.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionHighlight((current) => (current - 1 + mentionTargets.length) % mentionTargets.length);
                    return;
                  }
                  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey)) {
                    event.preventDefault();
                    insertMention(mentionTargets[mentionHighlight]!);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMentionOpen(false);
                    return;
                  }
                }

                if (snippetOpen && snippetMatches.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSnippetHighlight((current) => (current + 1) % snippetMatches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSnippetHighlight((current) => (current - 1 + snippetMatches.length) % snippetMatches.length);
                    return;
                  }
                  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey)) {
                    event.preventDefault();
                    applySnippetCommand(snippetMatches[snippetHighlight]!);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSnippetOpen(false);
                    return;
                  }
                }

                if (slashOpen && slashMatches.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSlashHighlight((current) => (current + 1) % slashMatches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSlashHighlight((current) => (current - 1 + slashMatches.length) % slashMatches.length);
                    return;
                  }
                  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey)) {
                    event.preventDefault();
                    applySlashCommand(slashMatches[slashHighlight]!);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSlashOpen(false);
                    return;
                  }
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft("");
                  return;
                }

                if (event.key === "Enter") {
                  if (composingRef.current || event.nativeEvent.isComposing) return;

                  if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
                    return;
                  }

                  event.preventDefault();
                  send();
                }
              }}
              onPaste={(event) => {
                if (!isComposerFeatureInteractive("attachments")) return;
                const files: File[] = [];
                for (const item of event.clipboardData.items) {
                  if (item.kind === "file") {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                  }
                }
                if (files.length > 0) {
                  event.preventDefault();
                  handleAddFiles(files);
                }
              }}
              className="min-h-[40px] flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-[var(--ad-text-muted)]"
            />
            <Can permission="ai.conversations.reply">
              <button
                type="button"
                disabled={!canSend}
                onClick={send}
                className="agent-desk-btn agent-desk-btn--primary shrink-0 px-3 py-2"
                aria-label={labels.send}
              >
                {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </Can>
          </div>

          {undoSecondsLeft > 0 && onUndoSend ? (
            <UndoSendBar
              secondsLeft={undoSecondsLeft}
              label={labels.undoSend}
              undoLabel={labels.undoAction}
              onUndo={() => {
                if (undoPayloadRef.current) {
                  setDraft(undoPayloadRef.current.text);
                  undoPayloadRef.current = null;
                }
                onUndoSend();
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          ) : null}

          <div className="flex items-center justify-between px-2.5 py-1 text-[10px] text-[var(--ad-text-muted)]">
            <span dir="auto" className={mode === "reply" ? "text-[var(--ad-accent)]" : mode === "internal_note" ? "text-[var(--ad-warn)]" : undefined}>
              {mode === "internal_note" ? labels.internalNote : labels.reply}
            </span>
            <span dir="auto">{labels.keyboardHint}</span>
          </div>
        </div>
      </div>
    );
  }),
);

function Tool({
  label,
  onClick,
  icon,
  active,
  disabled,
  disabledHint,
}: {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      title={disabled && disabledHint ? disabledHint : label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors duration-[var(--ad-dur-hover)] ${
        disabled
          ? "cursor-not-allowed text-[var(--ad-text-muted)] opacity-40"
          : active
            ? "bg-amber-500/15 text-[var(--ad-warn)]"
            : "text-[var(--ad-text-muted)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-text)]"
      }`}
    >
      {icon ?? <span className="text-[10px]">{label[0]}</span>}
    </button>
  );
}
