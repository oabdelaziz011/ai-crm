import type { JourneyStepDefinition, JourneyStepState } from "../types/intelligence-types.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

export class ContextEngine {
  buildJourney(journeySteps: JourneyStepDefinition[], currentStepId: string): JourneyStepState[] {
    if (!journeySteps.length) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.intelligence.journeySteps is required — no runtime journey fallback available",
      );
    }
    if (!currentStepId) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.businessContext.currentJourneyStepId is required for journey rendering",
      );
    }

    let passedCurrent = false;
    return journeySteps.map((step) => {
      const label = step.labelKey;
      if (step.id === currentStepId) {
        passedCurrent = true;
        return { id: step.id, label, icon: step.icon, status: "current" as const };
      }
      if (!passedCurrent) {
        return { id: step.id, label, icon: step.icon, status: "completed" as const };
      }
      return { id: step.id, label, icon: step.icon, status: "upcoming" as const };
    });
  }
}

export const contextEngine = new ContextEngine();
