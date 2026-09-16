/**
 * Compact read-only Email Message Translation control.
 * Never sends mail, mutates messages, or creates drafts.
 */
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronUp, Copy, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  EMAIL_TRANSLATE_LANGUAGES,
  detectEmailMessageSourceLanguage,
  defaultEmailTranslateTargetLanguage,
  getCachedEmailTranslation,
  getEmailTranslateLanguage,
  isRtlEmailTranslateLanguage,
  languageLabelForCode,
  type EmailMessageTranslationResult,
} from "@/lib/email-workspace/email-message-translate-shared";
import { requestEmailMessageTranslation } from "@/lib/email-workspace/email-message-translate";

export type EmailMessageTranslateState = {
  enabled: boolean;
  popoverOpen: boolean;
  setPopoverOpen: (open: boolean) => void;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  busy: boolean;
  error: string | null;
  copied: boolean;
  result: EmailMessageTranslationResult | null;
  targetLanguage: string;
  setTargetLanguage: (code: string) => void;
  languageSelectId: string;
  languageOptions: { value: string; label: string; description: string }[];
  displaySourceLabel: string;
  showingTranslation: boolean;
  resultRtl: boolean;
  targetLabel: string;
  runTranslate: (forceNetwork?: boolean) => Promise<void>;
  handleCopy: () => Promise<void>;
};

export function useEmailMessageTranslateState(input: {
  companyId: string;
  messageId: string;
  sourcePreviewText: string;
  enabled: boolean;
}): EmailMessageTranslateState {
  const { t } = useTranslation();
  const languageSelectId = useId();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<EmailMessageTranslationResult | null>(null);

  const detected = useMemo(
    () => detectEmailMessageSourceLanguage(input.sourcePreviewText),
    [input.sourcePreviewText],
  );
  const [targetLanguage, setTargetLanguage] = useState(() =>
    defaultEmailTranslateTargetLanguage(detected.code),
  );

  useEffect(() => {
    if (!result) {
      setTargetLanguage(defaultEmailTranslateTargetLanguage(detected.code));
    }
  }, [detected.code, input.messageId, result]);

  useEffect(() => {
    setResult(null);
    setVisible(false);
    setError(null);
    setPopoverOpen(false);
  }, [input.messageId]);

  const languageOptions = useMemo(
    () =>
      EMAIL_TRANSLATE_LANGUAGES.map((lang) => ({
        value: lang.code,
        label: lang.label,
        description: lang.englishName,
      })),
    [],
  );

  const unknownLabel = t("emailModule.workspace.messageTranslation.unknownLanguage");
  const sourceLabel =
    !detected.confident || detected.code === "unknown"
      ? unknownLabel
      : languageLabelForCode(detected.code, unknownLabel);

  const displaySourceLabel =
    result?.sourceLanguageLabel ||
    (result?.sourceLanguage
      ? languageLabelForCode(result.sourceLanguage, unknownLabel)
      : sourceLabel);

  const targetMeta = getEmailTranslateLanguage(result?.targetLanguage ?? targetLanguage);
  const resultRtl = isRtlEmailTranslateLanguage(result?.targetLanguage ?? targetLanguage);
  const showingTranslation = visible && Boolean(result?.translatedText);

  const runTranslate = useCallback(
    async (forceNetwork = false) => {
      if (!input.enabled || !input.companyId || !input.messageId) return;
      setError(null);

      if (!forceNetwork) {
        const cached = getCachedEmailTranslation(input.messageId, targetLanguage);
        if (cached) {
          setResult(cached);
          setVisible(true);
          setPopoverOpen(false);
          return;
        }
      }

      setBusy(true);
      try {
        const next = await requestEmailMessageTranslation({
          companyId: input.companyId,
          messageId: input.messageId,
          targetLanguage,
          bypassCache: forceNetwork,
        });
        setResult(next);
        setVisible(true);
        setPopoverOpen(false);
      } catch {
        setError(t("emailModule.workspace.messageTranslation.error"));
      } finally {
        setBusy(false);
      }
    },
    [input.companyId, input.enabled, input.messageId, t, targetLanguage],
  );

  const handleCopy = useCallback(async () => {
    if (!result?.translatedText) return;
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }, [result?.translatedText]);

  return {
    enabled: input.enabled,
    popoverOpen,
    setPopoverOpen,
    visible,
    setVisible,
    busy,
    error,
    copied,
    result,
    targetLanguage,
    setTargetLanguage,
    languageSelectId,
    languageOptions,
    displaySourceLabel,
    showingTranslation,
    resultRtl,
    targetLabel: targetMeta?.label ?? result?.targetLanguage ?? targetLanguage,
    runTranslate,
    handleCopy,
  };
}

export function EmailMessageTranslateTrigger({
  state,
  className,
}: {
  state: EmailMessageTranslateState;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!state.enabled) return null;

  if (state.showingTranslation) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-6 gap-1 px-1 text-[11px] font-normal text-muted-foreground hover:text-foreground",
          className,
        )}
        title={t("emailModule.workspace.messageTranslation.hide")}
        aria-label={t("emailModule.workspace.messageTranslation.hide")}
        aria-expanded={true}
        data-testid="email-message-translate-trigger"
        onClick={() => state.setVisible(false)}
      >
        <Languages className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="hidden sm:inline">
          {t("emailModule.workspace.messageTranslation.hide")}
        </span>
      </Button>
    );
  }

  return (
    <Popover
      open={state.popoverOpen}
      onOpenChange={(open) => {
        if (state.busy) return;
        state.setPopoverOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-6 gap-1 px-1 text-[11px] font-normal text-muted-foreground hover:text-foreground",
            className,
          )}
          title={t("emailModule.workspace.messageTranslation.translate")}
          aria-label={t("emailModule.workspace.messageTranslation.translate")}
          aria-expanded={state.popoverOpen}
          data-testid="email-message-translate-trigger"
        >
          <Languages className="size-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="hidden sm:inline">
            {t("emailModule.workspace.messageTranslation.translate")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(100vw-2rem,22rem)] space-y-3 p-3"
        data-testid="email-message-translate-popover"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(state.languageSelectId)?.focus();
        }}
      >
        <p className="text-sm font-medium leading-none">
          {t("emailModule.workspace.messageTranslation.popoverTitle")}
        </p>

        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            {t("emailModule.workspace.messageTranslation.sourceLanguage")}
          </p>
          <p className="text-sm" data-testid="email-message-translate-source" dir="auto">
            {state.displaySourceLabel}
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={state.languageSelectId}
            className="text-[11px] text-muted-foreground"
          >
            {t("emailModule.workspace.messageTranslation.targetLanguage")}
          </label>
          <SearchableSelect
            id={state.languageSelectId}
            value={state.targetLanguage}
            onValueChange={state.setTargetLanguage}
            options={state.languageOptions}
            placeholder={t("emailModule.workspace.messageTranslation.selectLanguage")}
            searchPlaceholder={t("emailModule.workspace.messageTranslation.searchLanguage")}
            emptyLabel={t("emailModule.workspace.messageTranslation.noLanguage")}
            disabled={state.busy}
            className="h-9 rounded-md text-sm"
          />
        </div>

        {state.error ? (
          <div
            className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5"
            data-testid="email-message-translate-error"
          >
            <p className="text-xs text-destructive">{state.error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => void state.runTranslate(true)}
              disabled={state.busy}
              data-testid="email-message-translate-retry"
            >
              {t("emailModule.workspace.messageTranslation.retry")}
            </Button>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-[5.5rem]"
            disabled={state.busy || !state.targetLanguage}
            onClick={() => void state.runTranslate(false)}
            data-testid="email-message-translate-submit"
          >
            {state.busy ? (
              <>
                <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden />
                {t("emailModule.workspace.messageTranslation.translating")}
              </>
            ) : (
              t("emailModule.workspace.messageTranslation.translate")
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function EmailMessageTranslateResult({
  state,
  className,
}: {
  state: EmailMessageTranslateState;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!state.enabled || !state.showingTranslation || !state.result) return null;

  return (
    <div
      className={cn("mt-2 rounded-md border border-border/70 bg-muted/30", className)}
      data-testid="email-message-translate-result"
      data-email-translate-readonly="true"
      data-email-translate-never-send="true"
      data-target-language={state.result.targetLanguage}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => state.setVisible(false)}
        aria-expanded={true}
        data-testid="email-message-translate-collapse"
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {t("emailModule.workspace.messageTranslation.resultTitle", {
            language: state.targetLabel,
          })}
        </span>
        <ChevronUp className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
      <div
        className="max-h-48 overflow-y-auto border-t border-border/50 px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
        dir={state.resultRtl ? "rtl" : "ltr"}
        data-testid="email-message-translate-text"
        data-dir={state.resultRtl ? "rtl" : "ltr"}
      >
        {state.result.translatedText}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1">
        {state.result.truncated ? (
          <p
            className="text-[10px] text-muted-foreground"
            data-testid="email-message-translate-truncated"
          >
            {t("emailModule.workspace.messageTranslation.truncatedNotice")}
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
          onClick={() => void state.handleCopy()}
          aria-label={t("emailModule.workspace.messageTranslation.copy")}
          data-testid="email-message-translate-copy"
        >
          {state.copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          <span>{t("emailModule.workspace.messageTranslation.copy")}</span>
        </Button>
      </div>
    </div>
  );
}

/** Per-message shell so hooks stay valid inside the messages map. */
export function EmailMessageTranslateControl({
  companyId,
  messageId,
  sourcePreviewText,
  enabled,
  children,
}: {
  companyId: string;
  messageId: string;
  sourcePreviewText: string;
  enabled: boolean;
  children: (state: EmailMessageTranslateState) => ReactNode;
}) {
  const state = useEmailMessageTranslateState({
    companyId,
    messageId,
    sourcePreviewText,
    enabled,
  });
  if (!enabled) return null;
  return (
    <div data-testid="email-message-translate" data-email-translate-never-send="true">
      {children(state)}
    </div>
  );
}
