import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getNotificationServices } from "@/lib/notifications";
import { AutomationRepository } from "@/lib/automation/repositories/automation-repository";
import { AutomationEngine } from "@/lib/automation/engine/automation-engine";
import { AutomationRuntime } from "@/lib/automation/runtime/automation-runtime";
import type { AutomationBusinessEvent } from "@/lib/automation/types";

export type AutomationServices = {
  repository: AutomationRepository;
  engine: AutomationEngine;
  runtime: AutomationRuntime;
};

export function createAutomationServices(client: SupabaseClient = supabase): AutomationServices {
  const repository = new AutomationRepository(client);
  const { notifications } = getNotificationServices();
  const runtime = new AutomationRuntime(repository, notifications);
  const engine = new AutomationEngine(repository, runtime);

  return { repository, engine, runtime };
}

let cached: AutomationServices | null = null;

export function getAutomationServices(): AutomationServices {
  if (!cached) cached = createAutomationServices();
  return cached;
}

export * from "@/lib/automation/types";
export { AutomationEngine } from "@/lib/automation/engine/automation-engine";
export { AutomationRuntime } from "@/lib/automation/runtime/automation-runtime";
export { AutomationRepository } from "@/lib/automation/repositories/automation-repository";
export { WORKFLOW_TEMPLATES, getWorkflowTemplate } from "@/lib/automation/templates/workflow-templates";
export { triggerEngine } from "@/lib/automation/triggers/trigger-engine";
export { conditionEngine } from "@/lib/automation/conditions/condition-engine";
export { delayScheduler } from "@/lib/automation/scheduler/delay-scheduler";

export function dispatchAutomationEvent(event: AutomationBusinessEvent) {
  return getAutomationServices().engine.handleEvent(event);
}

export {
  automationWorkflowsKey,
  automationWorkflowKey,
  automationHistoryKey,
  automationExecutionHistoryKey,
  automationTemplatesKey,
} from "@/lib/automation/cache/automation-query-keys";
