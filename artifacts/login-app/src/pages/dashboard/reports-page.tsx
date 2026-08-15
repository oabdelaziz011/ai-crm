import { useHasPermission } from "@/hooks/use-rbac";
import { ReportsHub } from "@/components/reports/reports-hub";

export default function ReportsPage() {
  const canViewReports = useHasPermission("reports.view");
  if (!canViewReports) return null;
  return <ReportsHub />;
}
