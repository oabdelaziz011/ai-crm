import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffPlatformServices,
  HANDOFF_PERMISSIONS,
  type HandoffPlatformServices,
  type HandoffServiceContext,
} from "@workspace/human-handoff-platform";
import type { HandoffAgentToolPorts } from "../tools/handoff-agent-ports.js";
import {
  classifyHandoffRoleTier,
  decideDepartmentHandoff,
  foldHandoffRoleTiers,
  type DepartmentAgentCandidate,
  type DepartmentCandidate,
  type HandoffRoleTier,
} from "../tools/department-handoff-route.js";

/**
 * Domain-layer permissions for AI Employee handoff tools after ToolRouter + commercial gates.
 * Constrained allowlist — not isSuperAdmin and not blanket () => true.
 */
const HANDOFF_AGENT_DOMAIN_PERMISSIONS: ReadonlySet<string> = new Set([
  HANDOFF_PERMISSIONS.escalate,
  HANDOFF_PERMISSIONS.queue,
  HANDOFF_PERMISSIONS.returnToAi,
  HANDOFF_PERMISSIONS.view,
  HANDOFF_PERMISSIONS.transfer,
  HANDOFF_PERMISSIONS.assign,
]);

export type CreateHandoffAgentToolPortsOptions = {
  platform?: HandoffPlatformServices;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

function buildFixedServiceContext(context: {
  userId: string | null;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}): HandoffServiceContext {
  return {
    userId: context.userId,
    companyId: context.companyId,
    isSuperAdmin: context.isSuperAdmin,
    hasPermission: context.hasPermission,
  };
}

function buildWebhookServiceContext(companyId: string, userId: string | null): HandoffServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => HANDOFF_AGENT_DOMAIN_PERMISSIONS.has(code),
  };
}

export function createHandoffAgentToolPortsFromPlatform(
  platform: HandoffPlatformServices,
  context: {
    userId: string | null;
    companyId: string;
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  },
): HandoffAgentToolPorts {
  const serviceContext = buildFixedServiceContext(context);

  return {
    async escalateToHuman(input) {
      const result = await platform.commands.requestCustomerHandoff(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        triggerCode: input.triggerCode,
        reason: input.reason,
        queueId: input.targetQueueId,
        requestedByAiAssistantId: input.aiAssistantId,
        trustedSystemExecution: true,
      });
      return {
        ownership: {
          ownerType: result.ownership.ownerType,
          ownerLabel: result.ownership.ownerLabel,
        },
        requestId: result.request?.id ?? result.assigneeUserId ?? "assigned",
        assigned: result.assigned,
        queued: result.queued,
        assigneeUserId: result.assigneeUserId,
      };
    },

    async queueForHuman(input) {
      const result = await platform.commands.queueConversation(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: input.queueId,
        reason: input.reason,
        requestedByAiAssistantId: input.aiAssistantId,
        trustedSystemExecution: true,
      });
      return {
        queuePosition: result.queuePosition.position,
        estimatedWaitSeconds: result.queuePosition.estimatedWaitSeconds,
      };
    },

    async returnToAi(input) {
      const result = await platform.commands.returnConversationToAi(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        reason: input.reason,
      });
      return {
        ownership: { ownerType: result.ownership.ownerType },
      };
    },
  };
}

/**
 * Webhook / multi-tenant factory: builds company-scoped service context per call.
 * Product authorization remains ToolRouter + commercial gate + assignment; this layer
 * only satisfies handoff domain company/permission interfaces (isSuperAdmin always false).
 */
async function loadDepartmentHandoffDecision(
  client: SupabaseClient,
  input: { companyId: string; conversationId: string; reason: string; aiAssistantId?: string },
) {
  const [departmentsResult, queuesResult, presenceResult, ownershipResult, conversationResult] =
    await Promise.all([
      client
        .from("organization_departments")
        .select("id,name,code,department_type")
        .eq("company_id", input.companyId)
        .eq("is_active", true),
      client
        .from("handoff_queues")
        .select("id,department_id")
        .eq("company_id", input.companyId)
        .eq("is_active", true)
        .is("deleted_at", null),
      client
        .from("agent_presence")
        .select("user_id,state,last_heartbeat_at,viewing_conversation_id")
        .eq("company_id", input.companyId)
        .eq("state", "online"),
      client
        .from("handoff_conversation_ownership")
        .select("assigned_user_id")
        .eq("company_id", input.companyId)
        .eq("owner_type", "human_agent")
        .in("lifecycle_state", ["ASSIGNED", "PENDING_CUSTOMER", "PENDING_INTERNAL", "ESCALATED"]),
      client.from("conversations").select("metadata").eq("id", input.conversationId).maybeSingle(),
    ]);

  const departments: DepartmentCandidate[] = (departmentsResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    code: row.code ? String(row.code) : null,
    departmentType: row.department_type ? String(row.department_type) : null,
  }));
  const onlineIds = (presenceResult.data ?? []).map((row) => String(row.user_id));
  const profilesResult = onlineIds.length
    ? await client
        .from("profiles")
        .select("id,department_id")
        .eq("company_id", input.companyId)
        .in("id", onlineIds)
    : { data: [] };
  const departmentByUser = new Map(
    (profilesResult.data ?? []).map((row) => [String(row.id), row.department_id ? String(row.department_id) : null]),
  );
  const roleTierByUser = new Map<string, HandoffRoleTier>();
  if (onlineIds.length) {
    const memberships = await client.from("user_roles").select("user_id,role_id").in("user_id", onlineIds);
    const roleIds = [...new Set((memberships.data ?? []).map((row) => String(row.role_id)).filter(Boolean))];
    const roles = roleIds.length
      ? await client.from("roles").select("id,name,template_key,company_id").in("id", roleIds).eq("company_id", input.companyId)
      : { data: [] as Array<{ id: string; name: string | null; template_key: string | null }> };
    const roleById = new Map(
      (roles.data ?? []).map((role) => [
        String(role.id),
        classifyHandoffRoleTier({ name: role.name, templateKey: role.template_key }),
      ]),
    );
    const tiersByUser = new Map<string, HandoffRoleTier[]>();
    for (const row of memberships.data ?? []) {
      const tier = roleById.get(String(row.role_id));
      if (!tier) continue;
      const userId = String(row.user_id);
      tiersByUser.set(userId, [...(tiersByUser.get(userId) ?? []), tier]);
    }
    for (const [userId, tiers] of tiersByUser) roleTierByUser.set(userId, foldHandoffRoleTiers(tiers));
  }
  const loadByUser = new Map<string, number>();
  for (const row of ownershipResult.data ?? []) {
    const userId = row.assigned_user_id ? String(row.assigned_user_id) : "";
    if (!userId) continue;
    loadByUser.set(userId, (loadByUser.get(userId) ?? 0) + 1);
  }
  const agents: DepartmentAgentCandidate[] = (presenceResult.data ?? []).map((row) => {
    const userId = String(row.user_id);
    return {
      userId,
      departmentId: departmentByUser.get(userId) ?? null,
      roleTier: roleTierByUser.get(userId) ?? "staff",
      activeConversationCount: loadByUser.get(userId) ?? 0,
      state: String(row.state ?? "offline"),
      lastHeartbeatAt: row.last_heartbeat_at ? String(row.last_heartbeat_at) : null,
      viewingConversationId: row.viewing_conversation_id ? String(row.viewing_conversation_id) : null,
    };
  });

  const metadata = conversationResult.data?.metadata;
  const metadataEmployeeId =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as { aiEmployeeId?: unknown; ai_employee_id?: unknown }).aiEmployeeId ??
        (metadata as { ai_employee_id?: unknown }).ai_employee_id
      : null;
  const employeeId =
    input.aiAssistantId?.trim() ||
    (typeof metadataEmployeeId === "string" ? metadataEmployeeId : "");
  let defaultDepartmentLabel: string | null = null;
  if (employeeId) {
    const employee = await client
      .from("ai_employees")
      .select("department")
      .eq("id", employeeId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    defaultDepartmentLabel = employee.data?.department ? String(employee.data.department) : null;
  }

  return decideDepartmentHandoff({
    customerText: input.reason,
    departments,
    defaultDepartmentLabel,
    queues: (queuesResult.data ?? []).map((row) => ({
      id: String(row.id),
      departmentId: row.department_id ? String(row.department_id) : null,
    })),
    agents,
  });
}

export function createHandoffAgentToolPorts(
  client: SupabaseClient,
  options: CreateHandoffAgentToolPortsOptions = {},
): HandoffAgentToolPorts {
  const platform = options.platform ?? createHandoffPlatformServices(client);

  async function resolveServiceContext(companyId: string): Promise<HandoffServiceContext> {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) {
      throw new Error("companyId is required for handoff tools.");
    }
    const userId = options.resolveActorUserIdForCompany
      ? await options.resolveActorUserIdForCompany(normalizedCompanyId)
      : null;
    return buildWebhookServiceContext(normalizedCompanyId, userId);
  }

  return {
    async escalateToHuman(input) {
      const serviceContext = await resolveServiceContext(input.companyId);
      const decision = input.targetQueueId
        ? null
        : await loadDepartmentHandoffDecision(client, input).catch(() => null);
      if (decision?.departmentMissing) {
        return {
          ownership: { ownerType: "ai_employee", ownerLabel: "AI" },
          requestId: "missing-department",
          assigned: false,
          queued: false,
          departmentName: decision.departmentName,
          departmentMissing: true,
        };
      }
      const result = await platform.commands.requestCustomerHandoff(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        triggerCode: input.triggerCode,
        reason: input.reason,
        queueId: input.targetQueueId ?? decision?.queueId ?? undefined,
        assigneeUserId: decision?.assigneeUserId ?? undefined,
        departmentId: decision?.departmentId ?? undefined,
        fallbackPolicy:
          decision?.assigneeUserId || decision?.queueId ? undefined : decision?.fallbackPolicy ?? undefined,
        requestedByAiAssistantId: input.aiAssistantId,
        trustedSystemExecution: true,
      });
      return {
        ownership: {
          ownerType: result.ownership.ownerType,
          ownerLabel: result.ownership.ownerLabel,
        },
        requestId: result.request?.id ?? result.assigneeUserId ?? "assigned",
        assigned: result.assigned,
        queued: result.queued,
        assigneeUserId: result.assigneeUserId,
        departmentName: decision?.departmentName ?? null,
        departmentMissing: false,
        idempotent: result.idempotent === true,
      };
    },

    async queueForHuman(input) {
      const serviceContext = await resolveServiceContext(input.companyId);
      const result = await platform.commands.queueConversation(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: input.queueId,
        reason: input.reason,
        requestedByAiAssistantId: input.aiAssistantId,
        trustedSystemExecution: true,
      });
      return {
        queuePosition: result.queuePosition.position,
        estimatedWaitSeconds: result.queuePosition.estimatedWaitSeconds,
      };
    },

    async returnToAi(input) {
      const serviceContext = await resolveServiceContext(input.companyId);
      if (!serviceContext.userId?.trim()) {
        throw new Error("Authenticated user is required for this action.");
      }
      const result = await platform.commands.returnConversationToAi(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        reason: input.reason,
      });
      return {
        ownership: { ownerType: result.ownership.ownerType },
      };
    },
  };
}
