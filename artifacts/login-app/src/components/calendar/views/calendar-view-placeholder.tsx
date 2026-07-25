import { useTranslation } from "react-i18next";

type CalendarViewPlaceholderProps = {
  view: "month" | "agenda" | "timeline";
};

export function CalendarViewPlaceholder({ view }: CalendarViewPlaceholderProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex items-center justify-center py-24 text-center">
      <div>
        <p className="text-sm font-medium">{t(`calendar.views.${view}`)}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("calendar.placeholders.comingSoon")}</p>
      </div>
    </div>
  );
}
