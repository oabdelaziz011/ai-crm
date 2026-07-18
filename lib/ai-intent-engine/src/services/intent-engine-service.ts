import { INTENT_PERMISSIONS } from "../constants.js";
import {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import type { ConversationReader } from "../ports/conversation-reader.js";
import type { IntentDefinitionRepository, IntentMatchRepository } from "../repositories/intent-repositories.js";
import { truncateMessagePreview } from "../repositories/intent-repositories.js";
import type { IntentMatchingService } from "./intent-matching-service.js";
import type { IntentMatchingEvaluation } from "./intent-matching-service.js";
import type { IntentMatchResult, ResolveIntentInput, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new ConversationAccessDeniedError();
  }
}

export class IntentEngineService {
  constructor(
    private readonly definitionRepository: IntentDefinitionRepository,
    private readonly matchRepository: IntentMatchRepository,
    private readonly conversationReader: ConversationReader,
    private readonly matchingService: IntentMatchingService,
  ) {}

  async resolve(ctx: ServiceContext, input: ResolveIntentInput): Promise<IntentMatchResult> {
    assertPermission(ctx, INTENT_PERMISSIONS.view);

    const conversation = await this.conversationReader.findById(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }
    assertCompanyAccess(ctx, conversation.company_id);

    const intents = await this.definitionRepository.listEnabled();
    const fallbackIntent =
      intents.find((intent) => intent.key === "fallback") ??
      (await this.definitionRepository.findByKey("fallback"));
    if (!fallbackIntent) {
      throw new Error("Fallback intent definition is missing.");
    }

    const classificationContext = {
      companyId: conversation.company_id,
      conversationId: conversation.id,
      conversationState: conversation.state,
      messageText: input.messageText,
    };

    const candidates = await this.matchingService.classifyMessage(classificationContext, intents);

    const permissionDenied = this.matchingService.evaluatePermissionDenied(
      ctx,
      conversation.state,
      candidates,
      intents,
      fallbackIntent,
    );
    if (permissionDenied) {
      return this.persistDecision(ctx, conversation.company_id, input, permissionDenied);
    }

    const unsupportedState = this.matchingService.evaluateUnsupportedState(
      candidates,
      intents,
      conversation.state,
      fallbackIntent,
    );
    if (unsupportedState) {
      return this.persistDecision(ctx, conversation.company_id, input, unsupportedState);
    }

    const evaluation = this.matchingService.evaluateCandidates(
      ctx,
      conversation.state,
      candidates,
      intents,
      fallbackIntent,
    );

    return this.persistDecision(ctx, conversation.company_id, input, evaluation);
  }

  private async persistDecision(
    ctx: ServiceContext,
    companyId: string,
    input: ResolveIntentInput,
    evaluation: IntentMatchingEvaluation,
  ): Promise<IntentMatchResult> {
    const confidence = evaluation.candidate?.confidence ?? 0;
    const classifierKey = evaluation.candidate?.classifierKey ?? "composite";

    const match = await this.matchRepository.create({
      companyId,
      conversationId: input.conversationId,
      intentDefinitionId: evaluation.selected.id,
      intentKey: evaluation.selected.key,
      classifierKey,
      messagePreview: truncateMessagePreview(input.messageText),
      confidence,
      matchedToolKey: evaluation.selected.matched_tool_key,
      reason: evaluation.reason,
      alternatives: evaluation.alternatives,
      requiresHuman: evaluation.requiresHuman,
      requiresLlm: evaluation.requiresLlm,
      status: evaluation.status,
      createdBy: ctx.userId,
    });

    return {
      intent_key: evaluation.selected.key,
      confidence,
      matched_tool: evaluation.selected.matched_tool_key,
      reason: evaluation.reason,
      alternatives: evaluation.alternatives,
      requires_human: evaluation.requiresHuman,
      requires_llm: evaluation.requiresLlm,
      classifier_key: classifierKey,
      status: evaluation.status,
      match_id: match.id,
    };
  }
}
