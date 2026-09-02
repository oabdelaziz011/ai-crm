import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  description?: string;
  fillHeight?: boolean;
};

export function TimelineEmptyState({ message, description, fillHeight }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background px-6 py-12 text-center",
        fillHeight && "min-h-full flex-1",
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl border border-border/60 bg-background">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <p className="mt-4 max-w-sm text-sm font-medium text-foreground">{message}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
