import { memo, useState } from "react";
import { Download, Expand, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import type { UnifiedMessageAttachment } from "@/lib/omnichannel/types/unified-conversation";
import { useResolvedAttachmentDisplayUrl } from "@/hooks/omnichannel/use-resolved-attachment-display-url";

type MessageAttachmentDisplayProps = {
  attachments: UnifiedMessageAttachment[];
  conversationId: string | null;
  labels: {
    download: string;
    openFullscreen: string;
    closeFullscreen: string;
  };
};

function isImageAttachment(attachment: UnifiedMessageAttachment): boolean {
  return attachment.type === "image" || (attachment.mimeType?.startsWith("image/") ?? false);
}

function AttachmentIcon({ attachment }: { attachment: UnifiedMessageAttachment }) {
  if (attachment.type === "xlsx" || attachment.mimeType?.includes("spreadsheet")) {
    return <FileSpreadsheet className="size-4" aria-hidden />;
  }
  return <FileText className="size-4" aria-hidden />;
}

const ResolvedAttachmentItem = memo(function ResolvedAttachmentItem({
  attachment,
  conversationId,
  labels,
  onFullscreen,
}: {
  attachment: UnifiedMessageAttachment;
  conversationId: string | null;
  labels: MessageAttachmentDisplayProps["labels"];
  onFullscreen: (url: string) => void;
}) {
  const { url, loading } = useResolvedAttachmentDisplayUrl(attachment, conversationId);

  if (isImageAttachment(attachment)) {
    if (loading) {
      return (
        <div className="flex h-24 items-center justify-center rounded-xl bg-[var(--ad-surface-2)] ring-1 ring-[var(--ad-border-subtle)]">
          <Loader2 className="size-4 animate-spin text-[var(--ad-text-muted)]" aria-hidden />
        </div>
      );
    }
    if (!url) return null;
    return (
      <div className="overflow-hidden rounded-xl ring-1 ring-[var(--ad-border-subtle)]">
        <button
          type="button"
          className="group relative block w-full"
          onClick={() => onFullscreen(url)}
          aria-label={labels.openFullscreen}
        >
          <img
            src={url}
            alt={attachment.name ?? "attachment"}
            className="max-h-56 w-full object-cover"
          />
          <span className="absolute end-2 top-2 rounded-full bg-foreground/50 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100">
            <Expand className="size-3.5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--ad-surface-2)] px-3 py-2 ring-1 ring-[var(--ad-border-subtle)]">
      <div className="flex min-w-0 items-center gap-2">
        <AttachmentIcon attachment={attachment} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" dir="auto">
            {attachment.name ?? attachment.type}
          </p>
          {attachment.fileSize ? (
            <p className="text-[10px] text-[var(--ad-text-muted)]" dir="ltr">
              {(attachment.fileSize / 1024).toFixed(1)} KB
            </p>
          ) : null}
        </div>
      </div>
      {loading ? (
        <Loader2 className="size-3.5 animate-spin text-[var(--ad-text-muted)]" aria-hidden />
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--ad-accent)] hover:bg-[var(--ad-accent-dim)]"
          download={attachment.name ?? undefined}
        >
          <Download className="size-3.5" />
          <span dir="auto">{labels.download}</span>
        </a>
      ) : null}
    </div>
  );
});

export const MessageAttachmentDisplay = memo(function MessageAttachmentDisplay({
  attachments,
  conversationId,
  labels,
}: MessageAttachmentDisplayProps) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        {attachments.map((attachment, index) => {
          const key = `${attachment.storagePath ?? attachment.url ?? attachment.name ?? "attachment"}-${index}`;
          return (
            <ResolvedAttachmentItem
              key={key}
              attachment={attachment}
              conversationId={conversationId}
              labels={labels}
              onFullscreen={setFullscreenUrl}
            />
          );
        })}
      </div>

      {fullscreenUrl ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/80 p-4">
          <button
            type="button"
            className="absolute end-4 top-4 rounded-full bg-foreground/60 p-2 text-background"
            onClick={() => setFullscreenUrl(null)}
            aria-label={labels.closeFullscreen}
          >
            <X className="size-5" />
          </button>
          <img src={fullscreenUrl} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
        </div>
      ) : null}
    </>
  );
});
