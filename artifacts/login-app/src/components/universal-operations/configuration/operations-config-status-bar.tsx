import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { getSupportedOperationsTemplateKeys } from "@workspace/universal-operations-engine";

type Props = {
  templateKey: string;
  onTemplateKeyChange?: (key: string) => void;
  status: "draft" | "published";
  hasUnpublishedDraft: boolean;
  publishedVersion: number;
  isDirty?: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  isValidating: boolean;
  canWrite?: boolean;
  canPublish?: boolean;
  publishSummary: string;
  onPublishSummaryChange: (value: string) => void;
  onSaveDraft: () => void;
  onValidate: () => void;
  onPublish: () => void;
};

function templateLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const i18nKey = `universalOperations.workspaceNames.${key}`;
  const translated = t(i18nKey);
  return translated === i18nKey ? key : translated;
}

export function OperationsConfigStatusBar({
  templateKey,
  onTemplateKeyChange,
  status,
  hasUnpublishedDraft,
  publishedVersion,
  isDirty,
  isSaving,
  isPublishing,
  isValidating,
  canWrite = true,
  canPublish = true,
  publishSummary,
  onPublishSummaryChange,
  onSaveDraft,
  onValidate,
  onPublish,
}: Props) {
  const { t } = useTranslation("common");
  const templates = getSupportedOperationsTemplateKeys();
  const liveForTeam = !hasUnpublishedDraft && status === "published";

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("universalOperations.configuration.templateLabel")}
          </Label>
          <select
            value={templateKey}
            onChange={(e) => onTemplateKeyChange?.(e.target.value)}
            disabled={!onTemplateKeyChange}
            className="h-9 w-full rounded-lg border border-border/60 bg-background px-2 text-sm disabled:opacity-60"
          >
            {templates.map((key) => (
              <option key={key} value={key}>
                {templateLabel(t, key)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Badge variant={liveForTeam ? "secondary" : "destructive"}>
            {liveForTeam
              ? t("universalOperations.configuration.statusLive")
              : t("universalOperations.configuration.statusDraftPending")}
          </Badge>
          {isDirty ? (
            <Badge variant="outline">{t("universalOperations.configuration.enterprise.unsaved")}</Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t("universalOperations.configuration.version", { version: publishedVersion })}
          </span>
        </div>

        <div className="ms-auto flex flex-wrap gap-2 pb-0.5">
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving || !isDirty || !canWrite}
            onClick={onSaveDraft}
            title={t("universalOperations.configuration.saveDraftHint")}
          >
            {t("universalOperations.configuration.saveDraft")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isValidating}
            onClick={onValidate}
            title={t("universalOperations.configuration.validateHint")}
          >
            {t("universalOperations.configuration.validate")}
          </Button>
          <Button
            size="sm"
            disabled={isPublishing || isSaving || !canPublish}
            onClick={onPublish}
            title={t("universalOperations.configuration.publishHint")}
          >
            {t("universalOperations.configuration.publish")}
          </Button>
        </div>
      </div>

      {!liveForTeam ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("universalOperations.configuration.publishRequired")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("universalOperations.configuration.statusLiveHint")}</p>
      )}

      <div className="grid gap-1.5 sm:grid-cols-[minmax(140px,auto)_1fr] sm:items-center">
        <Label htmlFor="ops-config-publish-note" className="text-xs text-muted-foreground">
          {t("universalOperations.configuration.publishNoteLabel")}
        </Label>
        <Input
          id="ops-config-publish-note"
          value={publishSummary}
          onChange={(e) => onPublishSummaryChange(e.target.value)}
          placeholder={t("universalOperations.configuration.publishNotePlaceholder")}
          className="h-8 text-xs"
          disabled={!canWrite}
        />
      </div>
    </div>
  );
}
