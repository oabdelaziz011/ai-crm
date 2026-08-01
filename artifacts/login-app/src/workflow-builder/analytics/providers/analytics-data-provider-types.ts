import type { HotPathSummary, NodeProfilerEntry } from "../../debugger/types/debugger-advanced-types";
import type { SimulationReport } from "../../simulation/types/simulation-types";
import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { TriggerAnalyticsModel } from "../../triggers/types/trigger-types";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowAnalyticsInput } from "../types/analytics-types";

export type SimulationAnalyticsData = {
  simulationReport: SimulationReport | null;
};

export type TestingAnalyticsData = {
  runHistory: readonly TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
};

export type DebuggerAnalyticsData = {
  profilerEntries: readonly NodeProfilerEntry[];
  hotPaths: readonly HotPathSummary[];
};

export type TriggerAnalyticsData = {
  triggerAnalytics: TriggerAnalyticsModel | null;
};

export interface WorkflowAnalyticsDataProvider {
  read(): WorkflowAnalyticsInput;
}

export interface SimulationAnalyticsProviderContract {
  readonly id: "simulation";
  read(): SimulationAnalyticsData;
}

export interface TestingAnalyticsProviderContract {
  readonly id: "testing";
  read(): TestingAnalyticsData;
}

export interface DebuggerAnalyticsProviderContract {
  readonly id: "debugger";
  read(): DebuggerAnalyticsData;
}

export interface TriggerAnalyticsProviderContract {
  readonly id: "trigger";
  read(): TriggerAnalyticsData;
}
