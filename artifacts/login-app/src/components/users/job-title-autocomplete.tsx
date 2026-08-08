import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Distinct job titles already used by company employees. */
  suggestions: string[];
  disabled?: boolean;
  className?: string;
};

/**
 * Job title field with autocomplete from existing company titles.
 * Free text remains allowed (typed value is always kept).
 */
export function JobTitleAutocomplete({
  value,
  onChange,
  suggestions,
  disabled,
  className,
}: Props) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => {
    const unique = new Map<string, string>();
    for (const raw of suggestions) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!unique.has(key)) unique.set(key, trimmed);
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }, [suggestions]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((item) => item.toLowerCase().includes(q));
  }, [sorted, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between rounded-xl border-white/10 bg-background/50 font-normal hover:bg-background/50",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {value.trim() || t("users.form.jobTitlePlaceholder")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-card border-white/10"
        align="start"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            value={value}
            onValueChange={onChange}
            placeholder={t("users.form.jobTitleSearchPlaceholder")}
            className="h-10"
          />
          <CommandList>
            <CommandEmpty>
              {value.trim()
                ? t("users.form.jobTitleUseCustom", { title: value.trim() })
                : t("users.form.jobTitleNoSuggestions")}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item}
                  value={item}
                  onSelect={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "me-2 h-4 w-4",
                      value.trim().toLowerCase() === item.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="truncate text-sm">{item}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
