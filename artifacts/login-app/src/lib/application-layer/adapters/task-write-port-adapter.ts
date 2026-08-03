import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskWritePort, TaskReadModel, TaskPriority } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

type TaskRow = {
  id: string;
  title: string;
  assignee_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
};

function mapTaskRow(row: TaskRow): TaskReadModel {
  return Object.freeze({
    id: String(row.id),
    title: String(row.title),
    assigneeId: String(row.assignee_id ?? ""),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ?? undefined,
    dueAt: row.due_at ?? undefined,
    status: String(row.status),
    priority: (row.priority as TaskPriority) ?? "normal",
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
  });
}

function canWrite(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("tasks.write");
}

function canAssign(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("tasks.assign") || ctx.hasPermission("tasks.write");
}

async function updateTask(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
  tenantId: string,
  taskId: string,
  patch: Record<string, unknown>,
): Promise<TaskReadModel> {
  const { data, error } = await client
    .from("tasks")
    .update({ ...patch, updated_by: ctx.actorUserId, updated_at: new Date().toISOString() })
    .eq("company_id", tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .select("id, title, assignee_id, entity_type, entity_id, status, priority, due_at, created_at, completed_at")
    .single();

  if (error) throw new Error(error.message);
  return mapTaskRow(data as TaskRow);
}

export function createLoginAppTaskWritePort(client: SupabaseClient, ctx: LoginAppPortContext): TaskWritePort {
  return {
    async create(input) {
      if (input.tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");

      const { data, error } = await client
        .from("tasks")
        .insert({
          company_id: input.tenantId,
          title: input.title,
          description: input.description ?? null,
          assignee_id: input.assigneeId,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          due_at: input.dueAt ?? null,
          priority: input.priority ?? "normal",
          parent_task_id: input.parentTaskId ?? null,
          status: "open",
          created_by: ctx.actorUserId,
          updated_by: ctx.actorUserId,
        })
        .select("id, title, assignee_id, entity_type, entity_id, status, priority, due_at, created_at, completed_at")
        .single();

      if (error) throw new Error(error.message);
      return mapTaskRow(data as TaskRow);
    },

    async assign(tenantId, taskId, assigneeId) {
      if (tenantId !== ctx.companyId || !canAssign(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, { assignee_id: assigneeId });
    },

    async reassign(tenantId, taskId, assigneeId) {
      if (tenantId !== ctx.companyId || !canAssign(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, { assignee_id: assigneeId });
    },

    async start(tenantId, taskId) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, {
        status: "in_progress",
        started_at: new Date().toISOString(),
        paused_at: null,
      });
    },

    async pause(tenantId, taskId) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, {
        status: "paused",
        paused_at: new Date().toISOString(),
      });
    },

    async complete(tenantId, taskId, _completedBy) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
    },

    async cancel(tenantId, taskId) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      });
    },

    async updatePriority(tenantId, taskId, priority) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, { priority });
    },

    async updateDueDate(tenantId, taskId, dueAt) {
      if (tenantId !== ctx.companyId || !canWrite(ctx)) throw new Error("Permission denied");
      return updateTask(client, ctx, tenantId, taskId, { due_at: dueAt });
    },
  };
}
