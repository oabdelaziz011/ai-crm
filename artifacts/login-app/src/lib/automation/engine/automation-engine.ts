import type {
  AutomationBusinessEvent,
  AutomationContext,
  AutomationEngineResult,
  AutomationWorkflow,
  ExecutionPlan,
} from "@/lib/automation/types";
import { TRIGGER_DEFINITIONS } from "@/lib/automation/triggers/trigger-registry";
import { businessEventToContext } from "@/lib/automation/domain/automation-mapper";
import { conditionEngine, memoizeConditionKey } from "@/lib/automation/conditions/condition-engine";
import { triggerEngine } from "@/lib/automation/triggers/trigger-engine";
import { delayScheduler } from "@/lib/automation/scheduler/delay-scheduler";
import { assertLegacyAutomationWorkflowEnabled } from "@/lib/automation/utils/workflow-guard";
import type { AutomationRepository } from "@/lib/automation/repositories/automation-repository";
import type { AutomationRuntime } from "@/lib/automation/runtime/automation-runtime";

/** Orchestrates event intake, matching, planning — no provider logic. */
export class AutomationEngine {
  private readonly conditionCache = new Map<string, boolean>();

  constructor(
    private readonly repository: AutomationRepository,
    private readonly runtime: AutomationRuntime,
  ) {}

  async handleEvent(event: AutomationBusinessEvent): Promise<AutomationEngineResult> {
    assertLegacyAutomationWorkflowEnabled(event.companyId);
    const workflows = await this.repository.listEnabled(event.companyId);
    const matching = triggerEngine.findMatching(workflows, event.name);
    const context = businessEventToContext(event);

    const result: AutomationEngineResult = {
      executionsCreated: 0,
      scheduled: 0,
      completed: 0,
      failed: 0,
      executionIds: [],
    };

    for (const workflow of matching) {
      const plan = this.buildExecutionPlan(workflow, context);
      if (!plan) continue;

      const execution = await this.repository.createExecution({
        companyId: event.companyId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        triggerEvent: event.name,
        context: plan.context,
        status: plan.shouldSchedule ? "scheduled" : "pending",
        scheduledAt: plan.scheduledAt,
      });

      result.executionsCreated += 1;
      result.executionIds.push(execution.id);

      if (plan.shouldSchedule && plan.scheduledAt) {
        await this.repository.createSchedule({
          companyId: event.companyId,
          executionId: execution.id,
          workflowId: workflow.id,
          scheduledAt: plan.scheduledAt,
          delayType: workflow.schedule.type,
          delayConfig: workflow.schedule,
        });
        result.scheduled += 1;
        continue;
      }

      const runtimeResult = await this.runtime.execute(execution.id, workflow, plan.context);
      if (runtimeResult.status === "completed") result.completed += 1;
      else result.failed += 1;
    }

    return result;
  }

  async runManual(companyId: string, workflowId: string, contextOverride?: Partial<AutomationContext>) {
    assertLegacyAutomationWorkflowEnabled(companyId);
    const workflow = await this.repository.getById(companyId, workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const businessEvent =
      TRIGGER_DEFINITIONS[workflow.trigger.type]?.businessEvent ?? "system.generic";

    const context: AutomationContext = {
      companyId,
      eventName: businessEvent,
      params: contextOverride?.params ?? {},
      userId: contextOverride?.userId,
      triggeredAt: new Date().toISOString(),
      ...contextOverride,
    };

    const execution = await this.repository.createExecution({
      companyId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      triggerEvent: "manual.run",
      context,
      status: "pending",
      scheduledAt: null,
    });

    return this.runtime.execute(execution.id, workflow, context);
  }

  buildExecutionPlan(workflow: AutomationWorkflow, context: AutomationContext): ExecutionPlan | null {
    const cacheKey = memoizeConditionKey(workflow.conditions, context);
    let passed = this.conditionCache.get(cacheKey);
    if (passed === undefined) {
      passed = conditionEngine.evaluate(workflow.conditions, context);
      this.conditionCache.set(cacheKey, passed);
    }
    if (!passed) return null;

    const schedule = delayScheduler.resolve(workflow.schedule, context);
    return {
      workflow,
      context,
      scheduledAt: schedule.scheduledAt,
      shouldSchedule: schedule.shouldSchedule,
    };
  }

  clearConditionCache(): void {
    this.conditionCache.clear();
  }
}
