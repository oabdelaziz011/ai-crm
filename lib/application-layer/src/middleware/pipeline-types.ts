import type { ApplicationContext } from "../contracts/application-context.js";

export type PipelineStage = "validation" | "permission" | "tenant" | "execution" | "audit" | "mapping";

export type PipelineLogEntry = Readonly<{
  stage: PipelineStage;
  commandOrQueryType: string;
  correlationId: string;
  durationMs: number;
  timestamp: string;
}>;

export type MiddlewareContext<TRequest> = Readonly<{
  request: TRequest;
  applicationContext: ApplicationContext;
  commandOrQueryType: string;
  startedAt: number;
  logs: PipelineLogEntry[];
}>;

export type PipelineMiddleware<TRequest, TResponse> = {
  readonly name: string;
  execute(
    ctx: MiddlewareContext<TRequest>,
    next: () => Promise<TResponse>,
  ): Promise<TResponse>;
};

export type TracingSnapshot = Readonly<{
  correlationId: string;
  totalDurationMs: number;
  stages: readonly PipelineLogEntry[];
}>;

export class PipelineTracer {
  private readonly logs: PipelineLogEntry[] = [];

  record(entry: PipelineLogEntry): void {
    this.logs.push(entry);
  }

  snapshot(correlationId: string, totalDurationMs: number): TracingSnapshot {
    return Object.freeze({
      correlationId,
      totalDurationMs,
      stages: Object.freeze([...this.logs]),
    });
  }

  clear(): void {
    this.logs.length = 0;
  }
}
