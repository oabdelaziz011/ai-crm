export class NoopChannelTelemetryPort {
  async recordInboundRouted(): Promise<void> {}
  async recordOutboundDispatched(): Promise<void> {}
  async recordPipelineError(): Promise<void> {}
}

export type ChannelTelemetryPort = {
  recordInboundRouted(input: Record<string, unknown>): Promise<void>;
  recordOutboundDispatched(input: Record<string, unknown>): Promise<void>;
  recordPipelineError(input: Record<string, unknown>): Promise<void>;
};
