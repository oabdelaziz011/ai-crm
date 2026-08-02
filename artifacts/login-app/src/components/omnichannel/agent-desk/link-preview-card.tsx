import { memo } from "react";
import { ExternalLink } from "lucide-react";
import type { LinkPreviewData } from "@/lib/omnichannel/presentation/link-preview";

type LinkPreviewCardProps = {
  preview: LinkPreviewData;
};

export const LinkPreviewCard = memo(function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block overflow-hidden rounded-lg border border-[var(--ad-border-subtle)]/60 bg-[var(--ad-surface)]/60 transition-colors hover:border-[var(--ad-accent)]/30"
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-[11px] font-medium text-[var(--ad-text)]" dir="auto">{preview.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--ad-text-muted)]" dir="ltr">
          <ExternalLink className="size-2.5 shrink-0" aria-hidden />
          {preview.hostname}
        </p>
      </div>
    </a>
  );
});
