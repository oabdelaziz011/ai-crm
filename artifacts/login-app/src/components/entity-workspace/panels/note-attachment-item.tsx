import { useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  MoreHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EntityNoteAttachmentRef } from "@/lib/entity-workspace";
import {
  attachmentKind,
  downloadFromSignedUrl,
  formatAttachmentSize,
} from "@/lib/entity-workspace/services/entity-file-upload";
import { cn } from "@/lib/utils";

type Props = {
  file: EntityNoteAttachmentRef;
  className?: string;
};

export function NoteAttachmentItem({ file, className }: Props) {
  const { t } = useTranslation("common");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = attachmentKind(file.fileType, file.fileName);
  const sizeLabel = formatAttachmentSize(file.sizeBytes);
  const href = file.preview?.trim() || null;
  const timeLabel = format(new Date(file.uploadedAt), "MMM d, h:mm a");
  const canPreview = Boolean(href) && (kind === "image" || kind === "pdf");
  const canDownload = Boolean(href);

  const Icon =
    kind === "image" ? ImageIcon : kind === "xlsx" ? FileSpreadsheet : FileText;

  const openPreview = () => {
    if (!href) return;
    if (kind === "image") {
      setLightboxOpen(true);
      return;
    }
    if (kind === "pdf") {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  const onDownload = async () => {
    if (!href) return;
    setBusy(true);
    try {
      await downloadFromSignedUrl(href, file.fileName);
    } catch {
      toast.error(t("entityWorkspace.attachments.downloadFailed", { defaultValue: "Download failed" }));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      toast.success(t("entityWorkspace.actions.linkCopied"));
    } catch {
      toast.error(t("entityWorkspace.notes.saveError"));
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex min-w-[200px] max-w-full items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-2 py-1.5",
          className,
        )}
      >
        {kind === "image" && href ? (
          <button
            type="button"
            onClick={openPreview}
            className="size-10 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background"
          >
            <img src={href} alt={file.fileName} className="size-full object-cover" />
          </button>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-primary">
            <Icon className="size-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{file.fileName}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {[sizeLabel, timeLabel].filter(Boolean).join(" · ")}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground opacity-80 hover:bg-muted hover:text-foreground"
              aria-label={t("entityWorkspace.attachments.open")}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {canPreview ? (
              <DropdownMenuItem onClick={openPreview}>
                <Eye className="me-2 size-3.5" />
                {t("entityWorkspace.attachments.preview")}
              </DropdownMenuItem>
            ) : null}
            {canDownload ? (
              <DropdownMenuItem disabled={busy} onClick={() => void onDownload()}>
                <Download className="me-2 size-3.5" />
                {t("entityWorkspace.attachments.download")}
              </DropdownMenuItem>
            ) : null}
            {href ? (
              <DropdownMenuItem onClick={() => void copyLink()}>
                <Copy className="me-2 size-3.5" />
                {t("entityWorkspace.actions.copyLink")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {kind === "image" && href ? (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-3xl border-border/60 bg-card p-2 sm:p-3">
            <DialogTitle className="sr-only">{file.fileName}</DialogTitle>
            <img
              src={href}
              alt={file.fileName}
              className="max-h-[80vh] w-full rounded-xl object-contain"
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
