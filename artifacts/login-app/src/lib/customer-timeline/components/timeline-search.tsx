import { Search } from "lucide-react";

type Props = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function TimelineSearch({ value, placeholder, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
