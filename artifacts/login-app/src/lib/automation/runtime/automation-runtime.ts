import type { NotificationService } from "@/lib/notifications/services/notification-service";
import type { AutomationContext, AutomationWorkflow } from "@/lib/automation/types";
import { ActionEngine } from "@/lib/automation/actions/action-engine";
import { conditionEngine } from "@/lib/automation/conditions/condition-engine";
import { delayScheduler } from "@/lib/automation/scheduler/delay-scheduler";
import type { AutomationRepository } from "@/lib/automation/repositories/automation-repository";
import { assertLegacyAutomationWorkflowEnabled } from "@/lib/automation/utils/workflow-guard";

export type RuntimeExecutionResult = {
  executionId: string;
  status: "completed" | "failed" | "scheduled";
  error?: string;
};

const MAX_RETRIES = 3;

/** Loads and executes automation pipelines — future-ready for distributed workers. */
export class AutomationRuntime {
  private readonly actionEngine: ActionEngine;

  constructor(
    private readonly repository: AutomationRepository,
    notificationService: NotificationService,
  ) {
    this.actionEngine = new ActionEngine(notificationService);
  }

  async execute(
    executionId: string,
    workflow: AutomationWorkflow,
    context: AutomationContext,
  ): Promise<RuntimeExecutionResult> {
    const started = Date.now();
    await this.repository.updateExecutionStatus(executionId, "running", { startedAt: new Date().toISOString() });

    try {
      await this.repository.appendHistory({
        executionId,
        companyId: context.companyId,
        workflowId: workflow.id,
        stepType: "trigger",
        stepIndex: 0,
        status: "completed",
        input: { trigger: workflow.trigger, event: context.eventName },
        output: {},
        durationMs: Date.now() - started,
      });

      const conditionStarted = Date.now();
      const conditionsPassed = conditionEngine.evaluate(workflow.conditions, context);
      await this.repository.appendHistory({
        executionId,
        companyId: context.companyId,
        workflowId: workflow.id,
        stepType: "condition",
        stepIndex: 1,
        status: conditionsPassed ? "completed" : "skipped",
        input: { conditions: workflow.conditions },
        output: { passed: conditionsPassed },
        durationMs: Date.now() - conditionStarted,
      });

      if (!conditionsPassed) {
        await this.repository.updateExecutionStatus(executionId, "completed", {
          completedAt: new Date().toISOString(),
        });
        return { executionId, status: "completed" };
      }

      const delayStarted = Date.now();
      const schedule = delayScheduler.resolve(workflow.schedule, context);
      await this.repository.appendHistory({
        executionId,
        companyId: context.companyId,
        workflowId: workflow.id,
        stepType: "delay",
        stepIndex: 2,
        status: schedule.shouldSchedule ? "skipped" : "completed",
        input: { schedule: workflow.schedule },
        output: { scheduledAt: schedule.scheduledAt, shouldSchedule: schedule.shouldSchedule },
        durationMs: Date.now() - delayStarted,
      });

      if (schedule.shouldSchedule && !delayScheduler.isDue(schedule.scheduledAt)) {
        await this.repository.updateExecutionStatus(executionId, "scheduled", {
          scheduledAt: schedule.scheduledAt,
        });
        return { executionId, status: "scheduled" };
      }

      const actionStarted = Date.now();
      const actionResults = await this.actionEngine.executeAll(workflow.actions, context);
      const failedAction = actionResults.find((result) => result.status === "failed");

      await this.repository.appendHistory({
        executionId,
        companyId: context.companyId,
        workflowId: workflow.id,
        stepType: "action",
        stepIndex: 3,
        status: failedAction ? "failed" : "completed",
        input: { actions: workflow.actions },
        output: { results: actionResults },
        error: failedAction?.error ?? null,
        durationMs: Date.now() - actionStarted,
      });

      if (failedAction) {
        throw new Error(failedAction.error ?? "Action pipeline failed");
      }

      await this.repository.updateExecutionStatus(executionId, "completed", {
        completedAt: new Date().toISOString(),
      });
      return { executionId, status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const execution = await this.repository.getExecutionById(executionId);
      const retryCount = (execution?.retryCount ?? 0) + 1;

      if (retryCount < MAX_RETRIES) {
        await this.repository.updateExecutionStatus(executionId, "pending", {
          retryCount,
          error: message,
        });
      } else {
        await this.repository.updateExecutionStatus(executionId, "failed", {
          retryCount,
          error: message,
          completedAt: new Date().toISOString(),
        });
      }

      return { executionId, status: "failed", error: message };
    }
  }

  async processDueSchedules(companyId: string, limit = 25): Promise<RuntimeExecutionResult[]> {
    assertLegacyAutomationWorkflowEnabled(companyId);
    const due = await this.repository.listDueSchedules(companyId, limit);
    const results: RuntimeExecutionResult[] = [];

    for (const schedule of due) {
      const execution = await this.repository.getExecutionById(schedule.executionId);
      const workflow = await this.repository.getById(companyId, schedule.workflowId);
      if (!execution || !workflow) continue;

      await this.repository.markScheduleConsumed(schedule.id);
      const result = await this.execute(execution.id, workflow, execution.context);
      results.push(result);
    }

    return results;
  }
}
