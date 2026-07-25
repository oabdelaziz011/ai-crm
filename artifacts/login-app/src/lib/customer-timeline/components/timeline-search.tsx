import { Search } from "lucide-react";

type Props = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function TimelineSearch({ value, placeholder, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
      />
    </div>
  );
}
