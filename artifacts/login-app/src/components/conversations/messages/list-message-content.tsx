import type { ListSectionView } from "@workspace/ai-conversation";
import { ListTree } from "lucide-react";
import { TextMessageContent } from "./text-message-content";

type ListMessageContentProps = {
  title: string;
  body: string;
  buttonLabel: string;
  sections: ListSectionView[];
};

export function ListMessageContent({ title, body, buttonLabel, sections }: ListMessageContentProps) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p> : null}
      <TextMessageContent text={body} />
      <div className="pt-1">
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
          aria-disabled="true"
        >
          <ListTree className="h-3.5 w-3.5" />
          {buttonLabel}
        </span>
      </div>
      <div className="space-y-2 pt-1">
        {sections.map((section) => (
          <div key={section.title} className="rounded-lg border border-white/10 bg-black/10 p-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{section.title}</p>
            <div className="space-y-1">
              {section.rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 cursor-not-allowed"
                  aria-disabled="true"
                  title={row.id}
                >
                  <p className="text-xs font-medium">{row.title}</p>
                  {row.description ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{row.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
