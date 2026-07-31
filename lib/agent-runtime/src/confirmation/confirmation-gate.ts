import type { AgentMemoryState, AgentTaskGraph, AgentTaskNode, ServiceContext } from "../types.js";
import { buildConfirmationRequest } from "./confirmation-request-builder.js";
import { requiresConfirmationForTool } from "./confirmation-policy.js";
import {
  CONFIRMATION_TOKEN_STORE_KEY,
  consumeConfirmationToken,
  createConfirmationToken,
  getConfirmationTokenStore,
  isConfirmationInvalidated,
  validateConfirmationToken,
} from "./confirmation-token.js";
import type { AgentConfirmationRequest, ConfirmationTokenRecord } from "./confirmation-types.js";

export type ConfirmationGateResult =
  | { action: "proceed"; toolInput: Record<string, unknown>; memory: AgentMemoryState }
  | {
      action: "pause";
      request: AgentConfirmationRequest;
      memory: AgentMemoryState;
    }
  | { action: "reject"; code: string; message: string };

function withTokenStore(
  memory: AgentMemoryState,
  tokenStore: Record<string, ConfirmationTokenRecord>,
  pendingConfirmation?: AgentConfirmationRequest,
): AgentMemoryState {
  const { pendingConfirmation: _previous, ...restExecutionState } = memory.executionState;
  return {
    ...memory,
    executionState: {
      ...restExecutionState,
      [CONFIRMATION_TOKEN_STORE_KEY]: tokenStore,
      ...(pendingConfirmation ? { pendingConfirmation } : {}),
    },
  };
}

function findIssuedTokenForTask(
  tokenStore: Record<string, ConfirmationTokenRecord>,
  taskId: string,
  toolKey: string,
): ConfirmationTokenRecord | null {
  for (const record of Object.values(tokenStore)) {
    if (record.taskId === taskId && record.toolKey === toolKey && !record.consumedAt) {
      return record;
    }
  }
  return null;
}

function tryConsumeTrustedToken(input: {
  ctx: ServiceContext;
  workflowId: string;
  workflowUserId: string | null;
  task: AgentTaskNode;
  toolKey: string;
  toolInput: Record<string, unknown>;
  memory: AgentMemoryState;
  token: string;
  record: ConfirmationTokenRecord;
}): ConfirmationGateResult {
  if (isConfirmationInvalidated(input.memory)) {
    return {
      action: "reject",
      code: "CONFIRMATION_INVALIDATED",
      message: "Confirmation tokens for this workflow are no longer valid.",
    };
  }

  const validation = validateConfirmationToken(input.record, {
    token: input.token,
    workflowId: input.workflowId,
    taskId: input.task.id,
    toolKey: input.toolKey,
    userId: input.ctx.userId,
    isSuperAdmin: input.ctx.isSuperAdmin,
    workflowUserId: input.workflowUserId,
  });

  if (!validation.valid) {
    return {
      action: "reject",
      code: validation.code,
      message: validation.message,
    };
  }

  const tokenStore = getConfirmationTokenStore(input.memory);
  const consumed = consumeConfirmationToken(input.record);
  const updatedStore = { ...tokenStore, [input.token]: consumed };

  return {
    action: "proceed",
    toolInput: {
      ...input.toolInput,
      confirmed: true,
      confirmationToken: input.token,
    },
    memory: withTokenStore(input.memory, updatedStore),
  };
}

export function issuePreStartConfirmationTokens(input: {
  ctx: ServiceContext;
  workflowId: string;
  companyId: string;
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
}): AgentMemoryState {
  let memory = input.memory;
  let tokenStore = getConfirmationTokenStore(memory);

  for (const node of input.taskGraph.nodes) {
    if (!node.tool || !requiresConfirmationForTool(node.tool, node.toolInput)) {
      continue;
    }

    const tokenRecord = createConfirmationToken({
      workflowId: input.workflowId,
      taskId: node.id,
      toolKey: node.tool,
      userId: input.ctx.userId,
      companyId: input.companyId,
    });
    tokenStore = { ...tokenStore, [tokenRecord.token]: tokenRecord };
  }

  return withTokenStore(memory, tokenStore);
}

export function evaluateConfirmationGate(input: {
  ctx: ServiceContext;
  workflowId: string;
  companyId: string;
  workflowUserId: string | null;
  task: AgentTaskNode;
  memory: AgentMemoryState;
}): ConfirmationGateResult {
  const { task, ctx, memory } = input;
  const toolKey = task.tool;
  if (!toolKey) {
    return { action: "proceed", toolInput: task.toolInput ?? {}, memory };
  }

  if (!requiresConfirmationForTool(toolKey, task.toolInput)) {
    return { action: "proceed", toolInput: task.toolInput ?? {}, memory };
  }

  if (isConfirmationInvalidated(memory)) {
    return {
      action: "reject",
      code: "CONFIRMATION_INVALIDATED",
      message: "Confirmation tokens for this workflow are no longer valid.",
    };
  }

  const toolInput = task.toolInput ?? {};
  const tokenStore = getConfirmationTokenStore(memory);

  const explicitToken = asString(toolInput.confirmationToken);
  if (explicitToken) {
    const record = tokenStore[explicitToken];
    if (!record) {
      return {
        action: "reject",
        code: "CONFIRMATION_TOKEN_INVALID",
        message: "Confirmation token not found.",
      };
    }
    return tryConsumeTrustedToken({
      ctx,
      workflowId: input.workflowId,
      workflowUserId: input.workflowUserId,
      task,
      toolKey,
      toolInput,
      memory,
      token: explicitToken,
      record,
    });
  }

  const preIssued = findIssuedTokenForTask(tokenStore, task.id, toolKey);
  if (preIssued) {
    return tryConsumeTrustedToken({
      ctx,
      workflowId: input.workflowId,
      workflowUserId: input.workflowUserId,
      task,
      toolKey,
      toolInput,
      memory,
      token: preIssued.token,
      record: preIssued,
    });
  }

  const existingRequest = task.result?.confirmationRequest as AgentConfirmationRequest | undefined;
  if (existingRequest?.confirmationToken) {
    const record = tokenStore[existingRequest.confirmationToken];
    if (record && !record.consumedAt && new Date(record.expiresAt) > new Date()) {
      return {
        action: "pause",
        request: existingRequest,
        memory,
      };
    }
  }

  const tokenRecord = createConfirmationToken({
    workflowId: input.workflowId,
    taskId: task.id,
    toolKey,
    userId: ctx.userId,
    companyId: input.companyId,
  });
  const request = buildConfirmationRequest({
    workflowId: input.workflowId,
    task,
    tokenRecord,
  });
  const updatedStore = { ...tokenStore, [tokenRecord.token]: tokenRecord };

  return {
    action: "pause",
    request,
    memory: withTokenStore(memory, updatedStore, request),
  };
}

export function findPendingConfirmationTask(graph: { nodes: AgentTaskNode[] }): AgentTaskNode | null {
  return (
    graph.nodes.find(
      (node) =>
        node.status === "waiting" &&
        Boolean((node.result as Record<string, unknown> | undefined)?.confirmationRequired),
    ) ?? null
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
