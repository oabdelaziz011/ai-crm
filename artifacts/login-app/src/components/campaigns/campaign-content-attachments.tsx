import { useId, useRef } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  CAMPAIGN_ATTACHMENT_ACCEPT,
  CAMPAIGN_ATTACHMENT_MAX_FILES,
  formatCampaignAttachmentSize,
  fileExtension,
} from "@/lib/campaigns/campaign-content";
import { cn } from "@/lib/utils";

export type CampaignPendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type Props = {
  files: CampaignPendingAttachment[];
  disabled?: boolean;
  error?: string | null;
  onAddFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
};

function kindIcon(file: File) {
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
    return ImageIcon;
  }
  return FileText;
}

export function CampaignContentAttachments({
  files,
  disabled = false,
  error,
  onAddFiles,
  onRemove,
}: Props) {
  const { t } = useTranslation("common");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, CAMPAIGN_ATTACHMENT_MAX_FILES - files.length);

  return (
    <div className="space-y-2" data-testid="campaign-content-attachments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("campaigns.wizard.content.attachments")}</p>
          <p className="text-xs text-muted-foreground">
            {t("campaigns.wizard.content.attachmentsHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || remaining === 0}
          onClick={() => inputRef.current?.click()}
          data-testid="campaign-add-attachments"
        >
          <Paperclip className="me-1.5 size-3.5" />
          {t("campaigns.wizard.content.addAttachments")}
        </Button>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          accept={CAMPAIGN_ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={disabled || remaining === 0}
          onChange={(event) => {
            if (event.target.files?.length) onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("campaigns.wizard.content.attachmentsChannelNote")}
      </p>
      {error ? (
        <p className="text-xs text-destructive" data-testid="campaign-attachment-error">
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="space-y-2" data-testid="campaign-attachment-list">
          {files.map((item) => {
            const Icon = kindIcon(item.file);
            const ext = fileExtension(item.file.name).toUpperCase();
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2",
                )}
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="size-10 rounded object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ext ? `${ext} · ` : ""}
                    {formatCampaignAttachmentSize(item.file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={disabled}
                  aria-label={t("campaigns.wizard.content.removeAttachment")}
                  onClick={() => onRemove(item.id)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
