import type {
  AnalyticsOptimizationData,
  AnalyticsOptimizationProviderContract,
  OptimizationDocumentContext,
  ValidationOptimizationData,
  ValidationOptimizationProviderContract,
  WorkflowOptimizationDataProvider,
} from "./optimization-data-provider-types";
import type { WorkflowOptimizationInput } from "../types/optimization-types";

export class AnalyticsOptimizationProvider implements AnalyticsOptimizationProviderContract {
  readonly id = "analytics" as const;

  constructor(private readonly readData: () => AnalyticsOptimizationData) {}

  read(): AnalyticsOptimizationData {
    return this.readData();
  }
}

export class ValidationOptimizationProvider implements ValidationOptimizationProviderContract {
  readonly id = "validation" as const;

  constructor(private readonly readData: () => ValidationOptimizationData) {}

  read(): ValidationOptimizationData {
    return this.readData();
  }
}

export class CompositeWorkflowOptimizationDataProvider implements WorkflowOptimizationDataProvider {
  constructor(
    private readonly context: OptimizationDocumentContext,
    private readonly analyticsProvider: AnalyticsOptimizationProvider,
    private readonly validationProvider: ValidationOptimizationProvider,
  ) {}

  read(): WorkflowOptimizationInput {
    const analytics = this.analyticsProvider.read();
    const validation = this.validationProvider.read();

    return {
      document: this.context.document,
      analytics: analytics.analytics,
      validationIssues: validation.validationIssues,
    };
  }
}

export function createWorkflowOptimizationDataProvider(options: {
  document: OptimizationDocumentContext["document"];
  readAnalytics: () => AnalyticsOptimizationData;
  readValidation: () => ValidationOptimizationData;
}): CompositeWorkflowOptimizationDataProvider {
  return new CompositeWorkflowOptimizationDataProvider(
    { document: options.document },
    new AnalyticsOptimizationProvider(options.readAnalytics),
    new ValidationOptimizationProvider(options.readValidation),
  );
}
