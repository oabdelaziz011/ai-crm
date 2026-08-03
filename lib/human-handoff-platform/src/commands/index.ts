export { HandoffCommandService } from "../services/handoff-command-service.js";

export async function transferConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["transferConversation"]>[1],
) {
  return service.transferConversation(ctx, input);
}

export async function acceptConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["acceptConversation"]>[1],
) {
  return service.acceptConversation(ctx, input);
}

export async function rejectConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["rejectConversation"]>[1],
) {
  return service.rejectConversation(ctx, input);
}

export async function returnConversationToAi(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["returnConversationToAi"]>[1],
) {
  return service.returnConversationToAi(ctx, input);
}

export async function assignConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["assignConversation"]>[1],
) {
  return service.assignConversation(ctx, input);
}

export async function reassignConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["reassignConversation"]>[1],
) {
  return service.reassignConversation(ctx, input);
}

export async function queueConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["queueConversation"]>[1],
) {
  return service.queueConversation(ctx, input);
}

export async function removeFromQueue(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["removeFromQueue"]>[1],
) {
  return service.removeFromQueue(ctx, input);
}

export async function pauseConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["pauseConversation"]>[1],
) {
  return service.pauseConversation(ctx, input);
}

export async function resumeConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["resumeConversation"]>[1],
) {
  return service.resumeConversation(ctx, input);
}

export async function closeConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["closeConversation"]>[1],
) {
  return service.closeConversation(ctx, input);
}

export async function escalateConversation(
  service: import("../services/handoff-command-service.js").HandoffCommandService,
  ctx: import("../types/handoff-types.js").HandoffServiceContext,
  input: Parameters<import("../services/handoff-command-service.js").HandoffCommandService["escalateConversation"]>[1],
) {
  return service.escalateConversation(ctx, input);
}
