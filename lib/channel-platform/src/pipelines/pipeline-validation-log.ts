import type { NormalizedInboundMessageDto } from "../dto/channel-dto.js";
import { hasValidInboundContent } from "./inbound-message-content.js";

/** Bump when validation logic changes so production logs prove which build is running. */
export const PIPELINE_VALIDATION_IMPL = "hasValidInboundContent-v1";

export type PipelineValidationLogEvent =
  | "pipeline.validation.before"
  | "pipeline.validation.after"
  | "pipeline.validation.failed";

export function logPipelineValidation(
  event: PipelineValidationLogEvent,
  payload: Record<string, unknown>,
): void {
  console.info(JSON.stringify({ event, pipelineValidationImpl: PIPELINE_VALIDATION_IMPL, ...payload }));
}

export function summarizeNormalizedForValidationLog(
  normalized: NormalizedInboundMessageDto,
): Record<string, unknown> {
  return {
    externalThreadId: normalized.externalThreadId,
    externalMessageId: normalized.externalMessageId,
    senderExternalId: normalized.senderExternalId,
    text: normalized.text,
    textTrimmedLength: normalized.text.trim().length,
    attachmentCount: normalized.attachments.length,
    metadata: normalized.metadata ?? null,
  };
}

export function buildPipelineValidationBeforePayload(input: {
  channelKey: string;
  normalized: NormalizedInboundMessageDto;
}): Record<string, unknown> {
  const valid = hasValidInboundContent(input.normalized);
  return {
    channelKey: input.channelKey,
    normalized: summarizeNormalizedForValidationLog(input.normalized),
    hasValidInboundContent: valid,
    validationPath: "inbound-message-pipeline.ts:hasValidInboundContent",
  };
}
