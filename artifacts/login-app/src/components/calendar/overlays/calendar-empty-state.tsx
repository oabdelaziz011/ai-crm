import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type CalendarEmptyStateProps = {
  onCreateBooking?: () => void;
  canCreate?: boolean;
};

export function CalendarEmptyState({ onCreateBooking, canCreate }: CalendarEmptyStateProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <CalendarDays className="h-10 w-10 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">{t("calendar.empty.title")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("calendar.empty.subtitle")}</p>
      </div>
      {canCreate && onCreateBooking && (
        <Button size="sm" onClick={onCreateBooking} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("buttons.newBooking")}
        </Button>
      )}
    </div>
  );
}
