import type {
  DebuggerAnalyticsData,
  DebuggerAnalyticsProviderContract,
  SimulationAnalyticsData,
  SimulationAnalyticsProviderContract,
  TestingAnalyticsData,
  TestingAnalyticsProviderContract,
  TriggerAnalyticsData,
  TriggerAnalyticsProviderContract,
  WorkflowAnalyticsDataProvider,
} from "./analytics-data-provider-types";
import type { WorkflowAnalyticsInput } from "../types/analytics-types";
import type { WorkflowDocument } from "../../core/types";

export class SimulationAnalyticsProvider implements SimulationAnalyticsProviderContract {
  readonly id = "simulation" as const;

  constructor(private readonly readData: () => SimulationAnalyticsData) {}

  read(): SimulationAnalyticsData {
    return this.readData();
  }
}

export class TestingAnalyticsProvider implements TestingAnalyticsProviderContract {
  readonly id = "testing" as const;

  constructor(private readonly readData: () => TestingAnalyticsData) {}

  read(): TestingAnalyticsData {
    return this.readData();
  }
}

export class DebuggerAnalyticsProvider implements DebuggerAnalyticsProviderContract {
  readonly id = "debugger" as const;

  constructor(private readonly readData: () => DebuggerAnalyticsData) {}

  read(): DebuggerAnalyticsData {
    return this.readData();
  }
}

export class TriggerAnalyticsProvider implements TriggerAnalyticsProviderContract {
  readonly id = "trigger" as const;

  constructor(private readonly readData: () => TriggerAnalyticsData) {}

  read(): TriggerAnalyticsData {
    return this.readData();
  }
}

export class CompositeWorkflowAnalyticsDataProvider implements WorkflowAnalyticsDataProvider {
  constructor(
    private readonly document: WorkflowDocument,
    private readonly simulationProvider: SimulationAnalyticsProvider,
    private readonly testingProvider: TestingAnalyticsProvider,
    private readonly debuggerProvider: DebuggerAnalyticsProvider,
    private readonly triggerProvider: TriggerAnalyticsProvider,
  ) {}

  read(): WorkflowAnalyticsInput {
    const simulation = this.simulationProvider.read();
    const testing = this.testingProvider.read();
    const debuggerData = this.debuggerProvider.read();
    const trigger = this.triggerProvider.read();

    return {
      document: this.document,
      runHistory: testing.runHistory,
      latestRun: testing.latestRun,
      simulationReport: simulation.simulationReport,
      profilerEntries: debuggerData.profilerEntries,
      hotPaths: debuggerData.hotPaths,
      triggerAnalytics: trigger.triggerAnalytics,
    };
  }
}

export function createWorkflowAnalyticsDataProvider(input: {
  document: WorkflowDocument;
  readSimulation: () => SimulationAnalyticsData;
  readTesting: () => TestingAnalyticsData;
  readDebugger: () => DebuggerAnalyticsData;
  readTrigger: () => TriggerAnalyticsData;
}): WorkflowAnalyticsDataProvider {
  return new CompositeWorkflowAnalyticsDataProvider(
    input.document,
    new SimulationAnalyticsProvider(input.readSimulation),
    new TestingAnalyticsProvider(input.readTesting),
    new DebuggerAnalyticsProvider(input.readDebugger),
    new TriggerAnalyticsProvider(input.readTrigger),
  );
}
