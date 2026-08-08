import { memo, useMemo, useState } from "react";
import { Download, Eye, FileText, FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEntityWorkspaceOptional } from "@/context/entity-workspace-context";
import { useEntityAttachments } from "@/hooks/entity-workspace/use-entity-attachments";
import type { EntityAttachment } from "@/lib/entity-workspace";
import {
  attachmentKind,
  downloadFromSignedUrl,
} from "@/lib/entity-workspace/services/entity-file-upload";
import { cn } from "@/lib/utils";

type Props = {
  entityType?: string;
  entityId?: string;
  searchQuery?: string;
};

type FileFilter = "all" | "pdf" | "image" | "office";

export const EntityAttachmentsPanel = memo(function EntityAttachmentsPanel({
  entityType,
  entityId,
  searchQuery = "",
}: Props) {
  const { t } = useTranslation("common");
  const workspace = useEntityWorkspaceOptional();
  const standalone = useEntityAttachments(
    workspace ? "" : (entityType ?? ""),
    workspace ? "" : (entityId ?? ""),
  );
  const files = workspace?.files ?? standalone.data ?? [];
  const isLoading = workspace ? false : standalone.isLoading;
  const [filter, setFilter] = useState<FileFilter>("all");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const ordered = [...files].sort((a, b) => {
      if (a.uploadedAt === b.uploadedAt) return b.id.localeCompare(a.id);
      return a.uploadedAt < b.uploadedAt ? 1 : -1;
    });
    return ordered.filter((file) => {
      if (filter === "pdf" && !file.fileType.includes("pdf") && !file.fileName.toLowerCase().endsWith(".pdf")) {
        return false;
      }
      if (
        filter === "image" &&
        !file.fileType.startsWith("image/") &&
        !/\.(jpe?g|png|webp)$/i.test(file.fileName)
      ) {
        return false;
      }
      if (
        filter === "office" &&
        !file.fileType.includes("wordprocessingml") &&
        !file.fileType.includes("spreadsheetml") &&
        !/\.(docx|xlsx)$/i.test(file.fileName)
      ) {
        return false;
      }
      if (!q) return true;
      return `${file.fileName} ${file.fileType} ${file.uploadedBy ?? ""} ${file.category ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [files, filter, searchQuery]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight">
        {t("entityWorkspace.attachments.browserTitle")}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("entityWorkspace.attachments.browserHint")}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "entityWorkspace.attachments.filters.all"],
            ["pdf", "entityWorkspace.attachments.filters.pdf"],
            ["image", "entityWorkspace.attachments.filters.image"],
            ["office", "entityWorkspace.attachments.filters.office"],
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === value
                ? "border-primary/30 bg-primary/12 text-primary"
                : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
          <FolderOpen className="size-6 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">{t("entityWorkspace.attachments.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("entityWorkspace.attachments.emptyBrowserDescription")}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {filtered.map((file) => (
            <FileCard key={file.id} file={file} />
          ))}
        </ul>
      )}
    </section>
  );
});

function FileCard({ file }: { file: EntityAttachment }) {
  const { t } = useTranslation("common");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const href = file.preview?.trim() || null;
  const kind = attachmentKind(file.fileType, file.fileName);
  const canPreview = Boolean(href) && (kind === "image" || kind === "pdf");
  const sizeLabel =
    file.sizeBytes > 0
      ? file.sizeBytes >= 1024 * 1024
        ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`
      : null;

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

  return (
    <li className="overflow-hidden rounded-xl border border-border/50 bg-background/80">
      <div className="flex h-28 items-center justify-center bg-muted/40">
        {kind === "image" && href ? (
          <button type="button" onClick={openPreview} className="h-full w-full">
            <img src={href} alt={file.fileName} className="h-full w-full object-cover" />
          </button>
        ) : (
          <FileText className="size-8 text-muted-foreground/70" />
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium">{file.fileName}</p>
        <p className="text-[11px] text-muted-foreground">
          {[
            file.category,
            file.fileType,
            file.uploadedBy,
            file.uploadedByRole,
            format(new Date(file.uploadedAt), "MMM d, yyyy"),
            sizeLabel,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {href ? (
          <div className="flex flex-wrap gap-1.5">
            {canPreview ? (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={openPreview}>
                <Eye className="me-1 size-3.5" />
                {t("entityWorkspace.attachments.preview")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={busy}
              onClick={() => void onDownload()}
            >
              <Download className="me-1 size-3.5" />
              {t("entityWorkspace.attachments.download")}
            </Button>
          </div>
        ) : null}
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
    </li>
  );
}
