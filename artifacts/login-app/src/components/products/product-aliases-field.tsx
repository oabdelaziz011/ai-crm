import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { displayProductAliases } from "@workspace/product-platform";
import { useTranslation } from "react-i18next";

export type ProductAliasGenerationStatusView = "pending" | "completed" | "failed" | null | undefined;

/** One alias per line; empty lines ignored by the caller. */
export function ProductAliasesField({
  value,
  onChange,
  disabled,
  id = "product-aliases",
  generationStatus,
  onRetryGeneration,
  retryPending,
  /** Create dialog: no product id yet — never claim aliases are ready. */
  createMode = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  generationStatus?: ProductAliasGenerationStatusView;
  onRetryGeneration?: () => void;
  retryPending?: boolean;
  createMode?: boolean;
}) {
  const { t } = useTranslation("common");
  const hasSavedAliases = displayProductAliases(
    value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ).length > 0;

  const statusHint = createMode
    ? generationStatus === "pending"
      ? t("products.aliasGeneration.pending")
      : generationStatus === "completed" && hasSavedAliases
        ? t("products.aliasGeneration.completed")
        : generationStatus === "failed"
          ? t("products.aliasGeneration.failed")
          : t("products.aliasGeneration.previewHint")
    : generationStatus === "pending"
      ? t("products.aliasGeneration.pending")
      : generationStatus === "completed" && hasSavedAliases
        ? t("products.aliasGeneration.completed")
        : generationStatus === "failed"
          ? t("products.aliasGeneration.failed")
          : null;

  return (
    <div className="sm:col-span-2">
      <Label htmlFor={id}>{t("products.fields.aliases")}</Label>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={6}
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("products.placeholders.aliases")}
        className="mt-1.5 min-h-[96px] font-normal"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{t("products.hints.aliases")}</p>
      {statusHint ? (
        <p
          className={
            generationStatus === "failed" && !createMode
              ? "mt-1 text-[11px] text-amber-700 dark:text-amber-400"
              : "mt-1 text-[11px] text-muted-foreground"
          }
          data-testid="product-alias-generation-status"
        >
          {statusHint}
        </p>
      ) : null}
      {!createMode && generationStatus === "failed" && onRetryGeneration ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={disabled || retryPending}
          onClick={onRetryGeneration}
          data-testid="product-alias-generation-retry"
        >
          {retryPending
            ? t("products.aliasGeneration.retrying")
            : t("products.aliasGeneration.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function aliasesTextToList(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function aliasesListToText(aliases: readonly string[] | undefined): string {
  return displayProductAliases(aliases).join("\n");
}
