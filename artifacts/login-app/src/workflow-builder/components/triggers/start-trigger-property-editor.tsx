import { lazy, Suspense, memo } from "react";
import { DashboardPageFallback } from "@/components/dashboard/ui";
import { useTriggerConfigurationContext } from "../../triggers/context/trigger-configuration-context";

const TriggerConfigurationWorkspace = lazy(() =>
  import("./trigger-configuration-workspace").then((module) => ({
    default: module.TriggerConfigurationWorkspace,
  })),
);

export const StartTriggerPropertyEditor = memo(function StartTriggerPropertyEditor() {
  const context = useTriggerConfigurationContext();
  if (!context) return null;

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <TriggerConfigurationWorkspace trigger={context.trigger} simulation={context.simulation} />
    </Suspense>
  );
});
