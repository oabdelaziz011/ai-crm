import { memo, useState } from "react";
import { Download, Expand, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { useResolvedAttachmentDisplayUrl } from "@/hooks/omnichannel/use-resolved-attachment-display-url";
import type { UnifiedMessageAttachment } from "@/lib/omnichannel/types/unified-conversation";
import type { EmailMessageAttachmentView } from "@/lib/email-workspace/email-thread-outbound";
import { formatEmailAttachmentSize } from "@/lib/email-workspace/email-composer-attachment-validation";

type EmailMessageAttachmentsProps = {
  attachments: EmailMessageAttachmentView[];
  conversationId: string | null;
  labels: {
    download: string;
    openPreview: string;
    closePreview: string;
  };
};

function toUnifiedAttachment(attachment: EmailMessageAttachmentView): UnifiedMessageAttachment {
  const mime = attachment.mimeType ?? "";
  return {
    type: mime.startsWith("image/") ? "image" : "document",
    url: attachment.url,
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    name: attachment.name,
  };
}

function isImageAttachment(attachment: UnifiedMessageAttachment): boolean {
  return attachment.type === "image" || (attachment.mimeType?.startsWith("image/") ?? false);
}

function AttachmentIcon({ attachment }: { attachment: UnifiedMessageAttachment }) {
  if (attachment.mimeType?.includes("spreadsheet") || attachment.name?.toLowerCase().endsWith(".xlsx")) {
    return <FileSpreadsheet className="size-4 shrink-0" aria-hidden />;
  }
  return <FileText className="size-4 shrink-0" aria-hidden />;
}

const ResolvedEmailAttachmentItem = memo(function ResolvedEmailAttachmentItem({
  attachment,
  conversationId,
  labels,
  onPreview,
}: {
  attachment: UnifiedMessageAttachment;
  conversationId: string | null;
  labels: EmailMessageAttachmentsProps["labels"];
  onPreview: (url: string) => void;
}) {
  const { url, loading } = useResolvedAttachmentDisplayUrl(attachment, conversationId);

  if (isImageAttachment(attachment)) {
    if (loading) {
      return (
        <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-muted/40">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      );
    }
    if (!url) {
      return (
        <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs">
          <span className="truncate" dir="ltr">
            {attachment.name ?? "attachment"}
          </span>
        </div>
      );
    }
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          className="group relative block w-full"
          onClick={() => onPreview(url)}
          aria-label={labels.openPreview}
        >
          <img
            src={url}
            alt={attachment.name ?? "attachment"}
            className="max-h-48 w-full object-cover"
          />
          <span className="absolute end-2 top-2 rounded-full bg-foreground/50 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100">
            <Expand className="size-3.5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-1.5"
      data-testid="email-thread-attachment"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AttachmentIcon attachment={attachment} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" dir="ltr">
            {attachment.name ?? "attachment"}
          </p>
          {attachment.fileSize ? (
            <p className="text-[10px] text-muted-foreground" dir="ltr">
              {formatEmailAttachmentSize(attachment.fileSize)}
            </p>
          ) : null}
        </div>
      </div>
      {loading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-primary hover:bg-muted"
          download={attachment.name ?? undefined}
        >
          <Download className="size-3.5" />
          <span>{labels.download}</span>
        </a>
      ) : null}
    </div>
  );
});

export const EmailMessageAttachments = memo(function EmailMessageAttachments({
  attachments,
  conversationId,
  labels,
}: EmailMessageAttachmentsProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex flex-col gap-1.5" data-testid="email-thread-attachments">
        {attachments.map((attachment, index) => (
          <ResolvedEmailAttachmentItem
            key={attachment.id ?? `${attachment.storagePath ?? attachment.name}-${index}`}
            attachment={toUnifiedAttachment(attachment)}
            conversationId={conversationId}
            labels={labels}
            onPreview={setPreviewUrl}
          />
        ))}
      </div>
      {previewUrl ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/80 p-4">
          <button
            type="button"
            className="absolute end-4 top-4 rounded-full bg-foreground/60 p-2 text-background"
            onClick={() => setPreviewUrl(null)}
            aria-label={labels.closePreview}
          >
            <X className="size-5" />
          </button>
          <img src={previewUrl} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
        </div>
      ) : null}
    </>
  );
});
