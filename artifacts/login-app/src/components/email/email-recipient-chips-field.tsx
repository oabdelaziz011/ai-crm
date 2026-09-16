import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { useEmailRecipientSuggestions } from "@/hooks/email/use-email-recipient-suggestions";
import {
  isValidComposerEmailAddress,
  invalidComposerAddresses,
} from "@/lib/email-workspace/email-compose-new";
import {
  EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
  mergeRecipientEmails,
  normalizeRecipientEmails,
  parseRecipientList,
} from "@/lib/email-workspace/email-thread-outbound";
import {
  shouldRequestRecipientSuggestions,
  type EmailRecipientSuggestion,
  type EmailRecipientSuggestionCandidate,
} from "@/lib/email-workspace/email-recipient-suggestions";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** Canonical recipient list (string[]). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Soft per-field cap; defaults to EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD. */
  maxRecipients?: number;
  /** Company-scoped conversation participant candidates (trusted, already filtered). */
  participantCandidates?: readonly EmailRecipientSuggestionCandidate[];
  /** Disable autocomplete (tests / restricted modes). */
  suggestionsEnabled?: boolean;
  /** Optional: notified when a CRM customer suggestion is selected (To linking). */
  onCustomerSuggestionSelected?: (suggestion: EmailRecipientSuggestion) => void;
  /** test id prefix e.g. email-composer-to */
  testId?: string;
  /** Hide the built-in label when a parent row already shows it. */
  hideLabel?: boolean;
  /** Let chips wrap fully instead of a nested scroller. */
  wrapWithoutScroll?: boolean;
};

/**
 * Chip-style multi-recipient field with live validation, paste parsing,
 * and company-scoped recipient autocomplete (shared by To / Cc / Bcc).
 */
export function EmailRecipientChipsField({
  label,
  value,
  onChange,
  disabled,
  maxRecipients = EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
  participantCandidates = [],
  suggestionsEnabled = true,
  onCustomerSuggestionSelected,
  testId = "email-composer-recipients",
  hideLabel = false,
  wrapWithoutScroll = false,
}: Props) {
  const { t } = useTranslation("common");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const recipients = normalizeRecipientEmails(value);
  const invalid = invalidComposerAddresses(recipients);

  const { suggestions, isFetching } = useEmailRecipientSuggestions({
    query: draft,
    excludeEmails: recipients,
    participantCandidates,
    enabled: suggestionsEnabled && !disabled && recipients.length < maxRecipients,
  });

  const showSuggestions =
    open &&
    shouldRequestRecipientSuggestions(draft) &&
    (suggestions.length > 0 || isFetching);

  useEffect(() => {
    setHighlight(0);
  }, [draft, suggestions]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const commitTokens = (raw: string) => {
    const tokens = parseRecipientList(raw);
    if (tokens.length === 0) {
      setDraft("");
      return;
    }
    const merged = mergeRecipientEmails(recipients, tokens, maxRecipients);
    onChange(merged.list);
    setLimitReached(merged.truncated);
    setDraft("");
    setOpen(false);
  };

  const selectSuggestion = (suggestion: EmailRecipientSuggestion) => {
    const merged = mergeRecipientEmails(recipients, [suggestion.email], maxRecipients);
    onChange(merged.list);
    setLimitReached(merged.truncated);
    setDraft("");
    setOpen(false);
    if (suggestion.customerId && suggestion.source === "customer") {
      onCustomerSuggestionSelected?.(suggestion);
    }
  };

  const removeAt = (index: number) => {
    const next = recipients.filter((_, i) => i !== index);
    onChange(next);
    setLimitReached(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Enter" && draft.trim()) {
        event.preventDefault();
        const selected = suggestions[highlight];
        if (selected) selectSuggestion(selected);
        else commitTokens(draft);
        return;
      }
    }

    if (event.key === "Enter" || event.key === "," || event.key === ";" || event.key === "Tab") {
      if (draft.trim()) {
        event.preventDefault();
        commitTokens(draft);
      }
      return;
    }
    if (event.key === "Backspace" && !draft && recipients.length > 0) {
      removeAt(recipients.length - 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text || !/[,;\s\n\r]/.test(text)) return;
    event.preventDefault();
    commitTokens(`${draft}${text}`);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      data-testid={testId}
      aria-label={hideLabel ? label : undefined}
    >
      {hideLabel ? null : (
        <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      )}
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1",
          wrapWithoutScroll ? "" : "max-h-28 overflow-y-auto",
          disabled && "opacity-60",
        )}
      >
        {recipients.map((email, index) => {
          const bad = !isValidComposerEmailAddress(email);
          return (
            <span
              key={`${email.toLowerCase()}-${index}`}
              dir="ltr"
              data-testid={`${testId}-chip`}
              data-invalid={bad ? "true" : "false"}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
                bad
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/50 text-foreground",
              )}
            >
              <span className="max-w-[14rem] truncate">{email}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={t("emailModule.workspace.removeRecipient")}
                disabled={disabled}
                onClick={() => removeAt(index)}
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <Input
          type="text"
          dir="ltr"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-autocomplete="list"
          value={draft}
          disabled={disabled || recipients.length >= maxRecipients}
          onChange={(e) => {
            setDraft(e.target.value);
            setLimitReached(false);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so suggestion mousedown can run first.
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                if (draft.trim()) commitTokens(draft);
                setOpen(false);
              }
            }, 120);
          }}
          className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          aria-label={label}
          placeholder={t("emailModule.workspace.recipientSuggestPlaceholder")}
          data-testid={`${testId}-input`}
        />
      </div>

      {showSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          data-testid={`${testId}-suggestions`}
          className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {suggestions.length === 0 && isFetching ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {t("emailModule.workspace.recipientSuggestLoading")}
            </li>
          ) : null}
          {suggestions.map((suggestion, index) => {
            const active = index === highlight;
            return (
              <li key={`${suggestion.email}-${suggestion.customerId ?? "p"}`} role="option" aria-selected={active}>
                <button
                  type="button"
                  data-testid={`${testId}-suggestion`}
                  data-active={active ? "true" : "false"}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/70",
                    active && "bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                >
                  {suggestion.displayName ? (
                    <span className="font-medium" dir="auto">
                      {suggestion.displayName}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {suggestion.email}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {invalid.length > 0 ? (
        <p className="mt-1 text-xs text-destructive" data-testid={`${testId}-invalid`} dir="ltr">
          {t("emailModule.workspace.invalidRecipientList", {
            addresses: invalid.join(", "),
          })}
        </p>
      ) : null}
      {limitReached || recipients.length >= maxRecipients ? (
        <p className="mt-1 text-xs text-destructive" data-testid={`${testId}-limit`}>
          {t("emailModule.workspace.recipientLimit", { count: maxRecipients })}
        </p>
      ) : null}
    </div>
  );
}
