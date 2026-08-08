import { memo, useMemo, type ReactNode } from "react";
import type { EntityNoteMention } from "@/lib/entity-workspace";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  mentions: readonly EntityNoteMention[];
  className?: string;
};

/** Renders note text with @mentions as interactive links (notification-ready metadata). */
export const NoteBodyText = memo(function NoteBodyText({ text, mentions, className }: Props) {
  const nodes = useMemo(() => renderMentionNodes(text, mentions), [mentions, text]);
  return <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", className)}>{nodes}</p>;
});

function renderMentionNodes(text: string, mentions: readonly EntityNoteMention[]): ReactNode[] {
  if (!text) return [];
  if (mentions.length === 0) return [text];

  const byHandle = new Map(mentions.map((mention) => [mention.handle.toLowerCase(), mention]));
  const pattern = /@([\w\u0600-\u06FF.-]+)/gu;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(pattern)) {
    const handle = match[1];
    const start = match.index ?? 0;
    if (!handle) continue;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const mention = byHandle.get(handle.toLowerCase());
    if (mention) {
      nodes.push(
        <a
          key={`m-${key++}`}
          href={`#mention-${mention.userId}`}
          data-mention-user-id={mention.userId}
          data-mention-handle={mention.handle}
          className="font-semibold text-primary underline-offset-2 hover:underline"
          title={mention.label}
          onClick={(event) => {
            // Keep in-module; future: open user card / notify.
            event.preventDefault();
          }}
        >
          @{mention.handle}
        </a>,
      );
    } else {
      nodes.push(match[0]);
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
