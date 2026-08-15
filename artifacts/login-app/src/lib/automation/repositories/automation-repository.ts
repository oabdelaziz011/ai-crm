import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationContext,
  AutomationExecution,
  AutomationExecutionPage,
  AutomationHistory,
  AutomationScheduleRecord,
  AutomationStatus,
  AutomationWorkflow,
  AutomationWorkflowInput,
  ConditionGroup,
} from "@/lib/automation/types";
import {
  buildWorkflowGraph,
  mapExecutionRow,
  mapHistoryRow,
  mapScheduleRow,
  mapWorkflowRow,
} from "@/lib/automation/domain/automation-mapper";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/templates/workflow-templates";
import { assertLegacyAutomationWorkflowEnabled } from "@/lib/automation/utils/workflow-guard";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";

/** CRUD + execution persistence — no business logic. */
export class AutomationRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async assertWorkflowAutomationEntitled(companyId: string): Promise<void> {
    assertLegacyAutomationWorkflowEnabled(companyId);
    await requireCompanyFeature(this.client, companyId, "workflow_automation");
  }

  async list(companyId: string): Promise<AutomationWorkflow[]> {
    const { data, error } = await this.client
      .from("automation_workflows")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_template", false)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapWorkflowRow(row as never));
  }

  async listEnabled(companyId: string): Promise<AutomationWorkflow[]> {
    const { data, error } = await this.client
      .from("automation_workflows")
      .select("*")
      .eq("company_id", companyId)
      .eq("enabled", true)
      .eq("is_template", false);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapWorkflowRow(row as never));
  }

  async listTemplates(): Promise<AutomationWorkflow[]> {
    return WORKFLOW_TEMPLATES.map((template) => ({
      id: template.templateKey,
      companyId: "",
      name: template.name,
      description: template.description ?? "",
      enabled: true,
      version: 1,
      trigger: template.trigger,
      conditions: template.conditions ?? { operator: "and", conditions: [] },
      actions: template.actions,
      schedule: template.schedule ?? { type: "immediate" },
      graph: buildWorkflowGraph({
        trigger: template.trigger,
        conditions: template.conditions ?? { operator: "and", conditions: [] },
        schedule: template.schedule ?? { type: "immediate" },
        actions: template.actions,
      }),
      isTemplate: true,
      templateKey: template.templateKey,
      createdAt: "",
      updatedAt: "",
    }));
  }

  async getById(companyId: string, workflowId: string): Promise<AutomationWorkflow | null> {
    const { data, error } = await this.client
      .from("automation_workflows")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", workflowId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapWorkflowRow(data as never) : null;
  }

  async create(companyId: string, input: AutomationWorkflowInput): Promise<AutomationWorkflow> {
    await this.assertWorkflowAutomationEntitled(companyId);
    const conditions: ConditionGroup = input.conditions ?? { operator: "and", conditions: [] };
    const schedule = input.schedule ?? { type: "immediate" };
    const graph = input.graph ?? buildWorkflowGraph({ trigger: input.trigger, conditions, schedule, actions: input.actions });

    const { data, error } = await this.client
      .from("automation_workflows")
      .insert({
        company_id: companyId,
        name: input.name,
        description: input.description ?? "",
        enabled: false,
        version: 1,
        trigger: input.trigger,
        conditions,
        actions: input.actions,
        schedule,
        graph,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapWorkflowRow(data as never);
  }

  async update(
    companyId: string,
    workflowId: string,
    input: Partial<AutomationWorkflowInput>,
  ): Promise<AutomationWorkflow> {
    await this.assertWorkflowAutomationEntitled(companyId);
    const existing = await this.getById(companyId, workflowId);
    if (!existing) throw new Error("Workflow not found");

    const trigger = input.trigger ?? existing.trigger;
    const conditions = input.conditions ?? existing.conditions;
    const schedule = input.schedule ?? existing.schedule;
    const actions = input.actions ?? existing.actions;
    const graph = input.graph ?? buildWorkflowGraph({ trigger, conditions, schedule, actions });

    const { data, error } = await this.client
      .from("automation_workflows")
      .update({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        trigger,
        conditions,
        actions,
        schedule,
        graph,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", workflowId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapWorkflowRow(data as never);
  }

  async setEnabled(companyId: string, workflowId: string, enabled: boolean): Promise<AutomationWorkflow> {
    await this.assertWorkflowAutomationEntitled(companyId);
    const { data, error } = await this.client
      .from("automation_workflows")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", workflowId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapWorkflowRow(data as never);
  }

  async delete(companyId: string, workflowId: string): Promise<void> {
    await this.assertWorkflowAutomationEntitled(companyId);
    const { error } = await this.client
      .from("automation_workflows")
      .delete()
      .eq("company_id", companyId)
      .eq("id", workflowId);

    if (error) throw new Error(error.message);
  }

  async createExecution(input: {
    companyId: string;
    workflowId: string;
    workflowVersion: number;
    triggerEvent: string;
    context: AutomationContext;
    status: AutomationStatus;
    scheduledAt: string | null;
  }): Promise<AutomationExecution> {
    await this.assertWorkflowAutomationEntitled(input.companyId);
    const { data, error } = await this.client
      .from("automation_executions")
      .insert({
        company_id: input.companyId,
        workflow_id: input.workflowId,
        workflow_version: input.workflowVersion,
        status: input.status,
        trigger_event: input.triggerEvent,
        context: input.context,
        scheduled_at: input.scheduledAt,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapExecutionRow(data as never);
  }

  async getExecutionById(executionId: string): Promise<AutomationExecution | null> {
    const { data, error } = await this.client
      .from("automation_executions")
      .select("*")
      .eq("id", executionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapExecutionRow(data as never) : null;
  }

  async updateExecutionStatus(
    executionId: string,
    status: AutomationStatus,
    patch: Partial<{
      startedAt: string;
      completedAt: string;
      scheduledAt: string;
      error: string;
      retryCount: number;
    }> = {},
  ): Promise<void> {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (patch.startedAt) update.started_at = patch.startedAt;
    if (patch.completedAt) update.completed_at = patch.completedAt;
    if (patch.scheduledAt) update.scheduled_at = patch.scheduledAt;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.retryCount != null) update.retry_count = patch.retryCount;

    const { error } = await this.client.from("automation_executions").update(update).eq("id", executionId);
    if (error) throw new Error(error.message);
  }

  async listExecutions(
    companyId: string,
    page = 1,
    pageSize = 20,
    workflowId?: string,
  ): Promise<AutomationExecutionPage> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.client
      .from("automation_executions")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (workflowId) query = query.eq("workflow_id", workflowId);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      items: (data ?? []).map((row) => mapExecutionRow(row as never)),
      total,
      page,
      pageSize,
      hasMore: from + (data?.length ?? 0) < total,
    };
  }

  async appendHistory(input: {
    executionId: string;
    companyId: string;
    workflowId: string;
    stepType: AutomationHistory["stepType"];
    stepIndex: number;
    status: AutomationHistory["status"];
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    error?: string | null;
    durationMs: number;
  }): Promise<AutomationHistory> {
    const { data, error } = await this.client
      .from("automation_execution_history")
      .insert({
        execution_id: input.executionId,
        company_id: input.companyId,
        workflow_id: input.workflowId,
        step_type: input.stepType,
        step_index: input.stepIndex,
        status: input.status,
        input: input.input,
        output: input.output,
        error: input.error ?? null,
        duration_ms: input.durationMs,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapHistoryRow(data as never);
  }

  async listHistory(executionId: string): Promise<AutomationHistory[]> {
    const { data, error } = await this.client
      .from("automation_execution_history")
      .select("*")
      .eq("execution_id", executionId)
      .order("step_index", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapHistoryRow(row as never));
  }

  async createSchedule(input: {
    companyId: string;
    executionId: string;
    workflowId: string;
    scheduledAt: string;
    delayType: string;
    delayConfig: Record<string, unknown>;
  }): Promise<AutomationScheduleRecord> {
    const { data, error } = await this.client
      .from("automation_schedules")
      .insert({
        company_id: input.companyId,
        execution_id: input.executionId,
        workflow_id: input.workflowId,
        scheduled_at: input.scheduledAt,
        delay_type: input.delayType,
        delay_config: input.delayConfig,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapScheduleRow(data as never);
  }

  async listDueSchedules(companyId: string, limit = 25): Promise<AutomationScheduleRecord[]> {
    const { data, error } = await this.client
      .from("automation_schedules")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapScheduleRow(row as never));
  }

  async markScheduleConsumed(scheduleId: string): Promise<void> {
    const { error } = await this.client
      .from("automation_schedules")
      .update({ status: "consumed" })
      .eq("id", scheduleId);

    if (error) throw new Error(error.message);
  }
}
