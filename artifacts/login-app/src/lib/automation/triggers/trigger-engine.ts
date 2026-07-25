import type { AutomationTrigger, AutomationWorkflow } from "@/lib/automation/types";
import { triggerMatchesEvent } from "@/lib/automation/triggers/trigger-registry";

/** Evaluates which workflows match an incoming business event. */
export class TriggerEngine {
  findMatching(workflows: AutomationWorkflow[], businessEventName: string): AutomationWorkflow[] {
    return workflows.filter(
      (workflow) => workflow.enabled && triggerMatchesEvent(workflow.trigger, businessEventName),
    );
  }

  matches(trigger: AutomationTrigger, businessEventName: string): boolean {
    return triggerMatchesEvent(trigger, businessEventName);
  }
}

export const triggerEngine = new TriggerEngine();
