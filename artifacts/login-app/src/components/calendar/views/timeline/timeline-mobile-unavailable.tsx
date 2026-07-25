import { MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TimelineMobileUnavailable() {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
      <MonitorSmartphone className="h-10 w-10 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">{t("calendar.timeline.mobileUnavailable.title")}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          {t("calendar.timeline.mobileUnavailable.subtitle")}
        </p>
      </div>
    </div>
  );
}
