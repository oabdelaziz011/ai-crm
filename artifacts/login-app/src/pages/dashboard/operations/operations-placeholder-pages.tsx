import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkspaceEmptyState } from "@/components/customer-workspace/workspace-ui";

export function OperationsCalendarPage() {
  const { t } = useTranslation("common");
  return (
    <WorkspaceEmptyState
      icon={CalendarDays}
      title={t("universalOperations.calendar.title")}
      description={t("universalOperations.calendar.description")}
    />
  );
}

export function OperationsKanbanPage() {
  const { t } = useTranslation("common");
  return (
    <WorkspaceEmptyState
      icon={CalendarDays}
      title={t("universalOperations.kanban.title")}
      description={t("universalOperations.kanban.description")}
    />
  );
}

export function OperationsTimelinePage() {
  const { t } = useTranslation("common");
  return (
    <WorkspaceEmptyState
      icon={CalendarDays}
      title={t("universalOperations.timeline.title")}
      description={t("universalOperations.timeline.description")}
    />
  );
}
