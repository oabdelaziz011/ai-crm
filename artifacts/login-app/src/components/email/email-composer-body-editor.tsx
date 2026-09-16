import { useEffect, useRef, type ReactNode } from "react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { sanitizeComposerHtml } from "@/lib/email-workspace/email-composer-rich-text";
import {
  EMAIL_HTML_DOCUMENT_CLASSNAME,
  renderConversationEmailHtml,
} from "@/lib/email-workspace/email-message-html";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  className?: string;
  /** Optional aria label override. */
  ariaLabel?: string;
  /** Identity logo preview above the editable body (not part of body HTML). */
  logoUrl?: string | null;
  /** Signature region is shown read-only below the editable area when provided. */
  signatureHtml?: string;
};

/**
 * Production-safe contentEditable composer body.
 * Reuses the Brand Center execCommand pattern — no new editor dependency.
 */
export function EmailComposerBodyEditor({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  logoUrl,
  signatureHtml,
}: Props) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastEmitted.current && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const next = sanitizeComposerHtml(el.innerHTML);
    lastEmitted.current = next;
    onChange(next);
  };

  const run = (command: string, arg?: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertLink = () => {
    if (disabled) return;
    const url = window.prompt(t("emailModule.workspace.richText.linkPrompt"));
    if (!url?.trim()) return;
    const trimmed = url.trim();
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    run("createLink", href);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-background",
        disabled && "opacity-60",
        className,
      )}
      data-testid="email-composer-rich-body"
    >
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1.5 py-1"
        role="toolbar"
        aria-label={t("emailModule.workspace.richText.toolbar")}
      >
        <ToolbarBtn
          label={t("emailModule.workspace.richText.bold")}
          disabled={disabled}
          onClick={() => run("bold")}
        >
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.italic")}
          disabled={disabled}
          onClick={() => run("italic")}
        >
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.underline")}
          disabled={disabled}
          onClick={() => run("underline")}
        >
          <Underline className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.bulletList")}
          disabled={disabled}
          onClick={() => run("insertUnorderedList")}
        >
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.numberedList")}
          disabled={disabled}
          onClick={() => run("insertOrderedList")}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.link")}
          disabled={disabled}
          onClick={insertLink}
        >
          <Link2 className="size-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarBtn
          label={t("emailModule.workspace.richText.undo")}
          disabled={disabled}
          onClick={() => run("undo")}
        >
          <Undo2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("emailModule.workspace.richText.redo")}
          disabled={disabled}
          onClick={() => run("redo")}
        >
          <Redo2 className="size-3.5" />
        </ToolbarBtn>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={ariaLabel ?? t("emailModule.workspace.fields.body")}
        className={cn(
          "min-h-[11rem] scroll-mt-40 px-3 py-3 text-sm leading-7 text-foreground outline-none",
          "prose prose-sm dark:prose-invert max-w-none",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:ps-5",
          "[&_a]:text-primary [&_a]:underline",
        )}
        dir="auto"
        onInput={emit}
        onBlur={emit}
        data-testid="email-composer-body-editable"
      />
      {logoUrl?.trim() ? (
        <div
          className="border-t border-dashed border-border/80 bg-muted/10 px-3 py-1.5"
          data-testid="email-composer-logo-preview"
          aria-label={t("emailModule.workspace.logoLabel")}
        >
          <img
            src={logoUrl}
            alt=""
            className="max-h-8 max-w-[10rem] object-contain"
          />
        </div>
      ) : null}
      {signatureHtml?.trim() ? (
        <div
          className="border-t border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs leading-6"
          data-testid="email-composer-signature-preview"
          aria-label={t("emailModule.workspace.signatureLabel")}
        >
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("emailModule.workspace.signatureLabel")}
          </p>
          <div
            className={cn(EMAIL_HTML_DOCUMENT_CLASSNAME, "text-[13px] leading-relaxed")}
            data-testid="email-composer-signature-html"
            dangerouslySetInnerHTML={{ __html: renderConversationEmailHtml(signatureHtml) }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ToolbarBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
