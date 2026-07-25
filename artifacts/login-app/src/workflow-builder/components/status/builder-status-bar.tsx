import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import type { SaveStatus } from "../../core/types";

type BuilderStatusBarProps = {
  saveStatus: SaveStatus;
  documentStatus: "draft" | "active" | "disabled" | "archived";
  hasUnpublishedDraft?: boolean;
};

export function BuilderStatusBar({ saveStatus, documentStatus, hasUnpublishedDraft }: BuilderStatusBarProps) {
  const { t } = useTranslation("common");

  const label =
    saveStatus === "publishing"
      ? t("workflowBuilder.status.publishing")
      : saveStatus === "published"
        ? t("workflowBuilder.status.published")
        : documentStatus === "active" && hasUnpublishedDraft
          ? t("workflowBuilder.status.unpublishedChanges")
          : saveStatus === "saving"
          ? t("workflowBuilder.status.saving")
          : saveStatus === "saved"
            ? t("workflowBuilder.status.saved")
            : saveStatus === "dirty"
              ? t("workflowBuilder.status.unsaved")
              : saveStatus === "error"
                ? t("workflowBuilder.status.error")
                : t("workflowBuilder.status.ready");

  const Icon =
    saveStatus === "publishing"
      ? Loader2
      : saveStatus === "error"
        ? AlertCircle
        : saveStatus === "saving"
          ? Loader2
          : documentStatus === "active"
            ? UploadCloud
            : CheckCircle2;

  const tone =
    saveStatus === "error"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : documentStatus === "active"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-border/60 bg-background/70 text-muted-foreground";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${tone}`} role="status" aria-live="polite">
      <Icon className={`h-4 w-4 ${saveStatus === "saving" || saveStatus === "publishing" ? "animate-spin" : ""}`} />
      <span>{label}</span>
    </div>
  );
}
