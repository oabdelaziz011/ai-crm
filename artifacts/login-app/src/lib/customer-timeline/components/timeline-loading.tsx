import { Loader2 } from "lucide-react";

type Props = {
  label: string;
};

export function TimelineLoading({ label }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}
