import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";

type CapabilityItem = {
  id: string;
  label: string;
  meta?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  items: CapabilityItem[];
  selectedIds: string[];
  isLoading?: boolean;
  canEdit: boolean;
  isSaving?: boolean;
  emptyMessage: string;
  onSave: (selectedIds: string[]) => void;
};

export function CapabilityMappingPanel({
  title,
  subtitle,
  items,
  selectedIds,
  isLoading,
  canEdit,
  isSaving,
  emptyMessage,
  onSave,
}: Props) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<string[]>(selectedIds);

  useEffect(() => {
    setDraft(selectedIds);
  }, [selectedIds]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.label.localeCompare(b.label)),
    [items],
  );

  const isDirty =
    draft.length !== selectedIds.length ||
    draft.some((id) => !selectedIds.includes(id));

  const toggle = (id: string, checked: boolean) => {
    setDraft((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((value) => value !== id),
    );
  };

  return (
    <DashboardCard className="overflow-hidden">
      <div className="p-5 border-b border-border/40 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {canEdit && (
          <Button
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={() => onSave(draft)}
            className="gap-2 shrink-0"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("buttons.save")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <DashboardTableSkeleton />
      ) : sortedItems.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground px-6">{emptyMessage}</div>
      ) : (
        <div className="divide-y divide-border/40">
          {sortedItems.map((item) => {
            const checked = draft.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex items-center gap-3 px-6 py-3.5 hover:bg-muted/10 cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  disabled={!canEdit || isSaving}
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
          })}
        </div>
      )}
    </DashboardCard>
  );
}
