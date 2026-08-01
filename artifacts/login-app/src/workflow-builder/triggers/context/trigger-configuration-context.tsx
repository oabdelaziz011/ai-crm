import { createContext, useContext, type ReactNode } from "react";
import type { WorkflowTriggerConfigurationController } from "../hooks/use-workflow-trigger-configuration";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";

type TriggerConfigurationContextValue = {
  trigger: WorkflowTriggerConfigurationController;
  simulation: WorkflowSimulationController | null;
};

const TriggerConfigurationContext = createContext<TriggerConfigurationContextValue | null>(null);

export function TriggerConfigurationProvider({
  trigger,
  simulation,
  children,
}: TriggerConfigurationContextValue & { children: ReactNode }) {
  return (
    <TriggerConfigurationContext.Provider value={{ trigger, simulation }}>
      {children}
    </TriggerConfigurationContext.Provider>
  );
}

export function useTriggerConfigurationContext() {
  return useContext(TriggerConfigurationContext);
}
