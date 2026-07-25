import { TextMessageContent } from "./text-message-content";

type MediaMessageContentProps = {
  url: string;
  caption?: string;
  mediaType?: string;
};

export function MediaMessageContent({ url, caption, mediaType }: MediaMessageContentProps) {
  const isImage = !mediaType || mediaType === "image";

  return (
    <div className="space-y-2">
      {isImage ? (
        <img
          src={url}
          alt={caption ?? "Attachment"}
          className="max-h-48 rounded-lg border border-white/10 object-cover"
          loading="lazy"
        />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline break-all"
        >
          {mediaType ?? "media"} attachment
        </a>
      )}
      {caption ? <TextMessageContent text={caption} /> : null}
    </div>
  );
}
