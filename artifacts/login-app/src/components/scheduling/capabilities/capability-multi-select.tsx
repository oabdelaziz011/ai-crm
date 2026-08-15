import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CapabilitySelectItem = {
  id: string;
  label: string;
  meta?: string;
};

type Props = {
  label: string;
  items: CapabilitySelectItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
  emptyMessage: string;
  searchPlaceholder?: string;
};

export function CapabilityMultiSelect({
  label,
  items,
  selectedIds,
  onChange,
  disabled,
  isLoading,
  emptyMessage,
  searchPlaceholder,
}: Props) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.label.localeCompare(b.label)),
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sortedItems;
    return sortedItems.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.meta?.toLowerCase().includes(normalized),
    );
  }, [query, sortedItems]);

  const toggle = (id: string, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...selectedIds, id])]
        : selectedIds.filter((value) => value !== id),
    );
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder ?? t("scheduling.capabilities.searchPlaceholder")}
          disabled={disabled || isLoading}
          className="pl-9 bg-background border-border/60"
        />
      </div>
      <div className="rounded-xl border border-border/60 bg-background max-h-48 overflow-y-auto divide-y divide-border/40">
        {isLoading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t("scheduling.resources.servicesCountLoading")}</p>
        ) : sortedItems.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : filteredItems.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t("scheduling.capabilities.noSearchResults")}
          </p>
        ) : (
          filteredItems.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/10 cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) => toggle(item.id, value === true)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.meta && (
                    <p className="text-xs text-muted-foreground truncate">{item.meta}</p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("scheduling.capabilities.selectedCount", { count: selectedIds.length })}
        </p>
      )}
    </div>
  );
}
