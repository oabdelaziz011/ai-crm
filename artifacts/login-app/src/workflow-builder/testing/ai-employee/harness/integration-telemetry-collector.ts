import type {
  AiEmployeeIntegrationTelemetryEvent,
  AiEmployeeIntegrationTelemetrySnapshot,
} from "../types/ai-employee-integration-types";

export class IntegrationTelemetryCollector {
  private readonly events: AiEmployeeIntegrationTelemetryEvent[] = [];

  record(event: Omit<AiEmployeeIntegrationTelemetryEvent, "timestamp">): void {
    this.events.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  snapshot(): AiEmployeeIntegrationTelemetrySnapshot {
    return { events: [...this.events] };
  }

  reset(): void {
    this.events.length = 0;
  }

  findEvents(type: AiEmployeeIntegrationTelemetryEvent["type"]): AiEmployeeIntegrationTelemetryEvent[] {
    return this.events.filter((event) => event.type === type);
  }
}
