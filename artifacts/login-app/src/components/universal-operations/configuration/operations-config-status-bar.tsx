import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  onSaveDraft: () => void;
  onValidate: () => void;
  onPublish: () => void;
};

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
  onSaveDraft,
  onValidate,
  onPublish,
}: Props) {
  const { t } = useTranslation("common");
  const templates = getSupportedOperationsTemplateKeys();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <select
        value={templateKey}
        onChange={(e) => onTemplateKeyChange?.(e.target.value)}
        disabled={!onTemplateKeyChange}
        className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs disabled:opacity-60"
      >
        {templates.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      <Badge variant={status === "draft" || hasUnpublishedDraft ? "destructive" : "secondary"}>
        {hasUnpublishedDraft || status === "draft"
          ? t("universalOperations.configuration.statusDraft")
          : t("universalOperations.configuration.statusPublished")}
      </Badge>
      {isDirty && (
        <Badge variant="outline">{t("universalOperations.configuration.enterprise.unsaved")}</Badge>
      )}
      <span className="text-xs text-muted-foreground">
        {t("universalOperations.configuration.version", { version: publishedVersion })}
      </span>
      {hasUnpublishedDraft && (
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          {t("universalOperations.configuration.publishRequired")}
        </span>
      )}
      <div className="ms-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isSaving || !isDirty} onClick={onSaveDraft}>
          {t("universalOperations.configuration.saveDraft")}
        </Button>
        <Button variant="outline" size="sm" disabled={isValidating} onClick={onValidate}>
          {t("universalOperations.configuration.validate")}
        </Button>
        <Button size="sm" disabled={isPublishing || isSaving} onClick={onPublish}>
          {t("universalOperations.configuration.publish")}
        </Button>
      </div>
    </div>
  );
}
