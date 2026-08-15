import { ZoomIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { CalendarTimelineZoom } from "@/lib/calendar/types/calendar-view-state";

type CalendarZoomControlProps = {
  zoomLevel: CalendarTimelineZoom;
  onZoomChange: (level: CalendarTimelineZoom) => void;
};

export function CalendarZoomControl({ zoomLevel, onZoomChange }: CalendarZoomControlProps) {
  const { t } = useTranslation("common");

  const cycle = () => {
    const next: CalendarTimelineZoom =
      zoomLevel === "compact"
        ? "comfortable"
        : zoomLevel === "comfortable"
          ? "expanded"
          : "compact";
    onZoomChange(next);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-border gap-2"
      onClick={cycle}
      title={t("calendar.interaction.zoomHint")}
    >
      <ZoomIn className="h-4 w-4" />
      {t(`calendar.interaction.zoom.${zoomLevel}`)}
    </Button>
  );
}
