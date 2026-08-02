import { memo } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import type { ComposerPendingAttachment } from "@/lib/omnichannel/types/composer-enterprise-types";

export type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  status: "ready" | "uploading" | "failed";
};

type AttachmentPreviewStripProps = {
  attachments: Array<PendingAttachment | ComposerPendingAttachment>;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  uploadUnavailableLabel?: string;
};

export const AttachmentPreviewStrip = memo(function AttachmentPreviewStrip({
  attachments,
  onRemove,
  onRetry,
}: AttachmentPreviewStripProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-b border-[var(--ad-border-subtle)]/60 px-2 py-2">
      {attachments.map((attachment) => {
        const progress = "progress" in attachment ? attachment.progress : 0;
        return (
          <div key={attachment.id} className="relative min-w-[4rem]">
            {attachment.file.type.startsWith("image/") ? (
              <img
                src={attachment.previewUrl}
                alt={attachment.file.name}
                className="size-16 rounded-lg object-cover ring-1 ring-[var(--ad-border-subtle)]"
              />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-lg bg-[var(--ad-surface-2)] px-1 text-[9px] text-center text-[var(--ad-text-muted)]">
                {attachment.file.name.slice(0, 16)}
              </div>
            )}
            {attachment.status === "uploading" ? (
              <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-b-lg bg-black/40">
                <div className="h-1 bg-[var(--ad-accent)] transition-all" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <div className="absolute -right-1 -top-1 flex gap-0.5">
              {attachment.status === "uploading" ? (
                <span className="rounded-full bg-[var(--ad-surface)] p-0.5">
                  <Loader2 className="size-3 animate-spin" />
                </span>
              ) : null}
              {attachment.status === "failed" && onRetry ? (
                <button
                  type="button"
                  className="rounded-full bg-[var(--ad-surface)] p-0.5"
                  onClick={() => onRetry(attachment.id)}
                  aria-label="Retry"
                >
                  <RotateCcw className="size-3" />
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-full bg-[var(--ad-surface)] p-0.5"
                onClick={() => onRemove(attachment.id)}
                aria-label="Remove"
              >
                <X className="size-3" />
              </button>
            </div>
            <p className="mt-0.5 max-w-16 truncate text-[9px] text-[var(--ad-text-muted)]" title={attachment.file.name}>
              {attachment.file.name}
            </p>
          </div>
        );
      })}
    </div>
  );
});

export function createPendingAttachment(file: File): PendingAttachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "ready",
  };
}

export function revokePendingAttachment(attachment: PendingAttachment): void {
  URL.revokeObjectURL(attachment.previewUrl);
}
