import { useEffect, useRef, type ReactNode } from "react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults";
import { sanitizeEmailHtml } from "@/lib/company-workspace/brand-center/sanitize-email-html";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  className?: string;
};

export function EmailSignatureEditor({ value, onChange, disabled, className }: Props) {
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
    const next = sanitizeEmailHtml(el.innerHTML);
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
    const url = window.prompt(t("companyWorkspace.brandCenter.emailStudio.linkPrompt"));
    if (!url?.trim()) return;
    run("createLink", url.trim());
  };

  const setColor = (color: string) => {
    run("foreColor", color);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-background",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-border/50 bg-muted/40 px-1.5 py-1"
        role="toolbar"
        aria-label={t("companyWorkspace.brandCenter.emailStudio.signatureToolbar")}
      >
        <ToolbarBtn
          label={t("companyWorkspace.brandCenter.emailStudio.bold")}
          disabled={disabled}
          onClick={() => run("bold")}
        >
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("companyWorkspace.brandCenter.emailStudio.italic")}
          disabled={disabled}
          onClick={() => run("italic")}
        >
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("companyWorkspace.brandCenter.emailStudio.link")}
          disabled={disabled}
          onClick={insertLink}
        >
          <Link2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("companyWorkspace.brandCenter.emailStudio.bulletList")}
          disabled={disabled}
          onClick={() => run("insertUnorderedList")}
        >
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label={t("companyWorkspace.brandCenter.emailStudio.numberedList")}
          disabled={disabled}
          onClick={() => run("insertOrderedList")}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>
        <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Palette className="size-3.5" />
          <span className="sr-only">{t("companyWorkspace.brandCenter.emailStudio.textColor")}</span>
          <input
            type="color"
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            disabled={disabled}
            defaultValue={DEFAULT_BRAND_COLORS.primary}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t("companyWorkspace.brandCenter.emailStudio.textColor")}
          />
        </label>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={t("companyWorkspace.brandCenter.emailSignature")}
        className={cn(
          "min-h-[120px] px-3 py-2 text-sm leading-relaxed text-foreground outline-none",
          "prose prose-sm dark:prose-invert max-w-none",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:ps-5",
          "[&_a]:text-primary [&_a]:underline",
        )}
        onInput={emit}
        onBlur={emit}
        data-placeholder={t("companyWorkspace.brandCenter.emailStudio.signaturePlaceholder")}
      />
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
