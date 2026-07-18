import type { ChannelTelemetryPort } from "../ports/telemetry-port.js";
import type { OutboundDispatchRequestDto, OutboundDispatchResponseDto } from "../dto/channel-dto.js";
import type { ServiceContext } from "../types.js";
import { OutboundMessagePipeline } from "../pipelines/outbound-message-pipeline.js";

export class ChannelDispatcher {
  constructor(
    private readonly outboundPipeline: OutboundMessagePipeline,
    private readonly telemetry: ChannelTelemetryPort,
  ) {}

  async dispatch(ctx: ServiceContext, request: OutboundDispatchRequestDto): Promise<OutboundDispatchResponseDto> {
    const response = await this.outboundPipeline.process(ctx, request);

    await this.telemetry.recordOutboundDispatched({
      deliveryEventId: response.deliveryEventId,
      companyId: request.companyId,
      companyChannelId: request.companyChannelId,
      channelKey: request.channelKey,
      conversationId: request.conversationId,
      deliveryStatus: response.deliveryStatus,
    });

    return response;
  }
}
