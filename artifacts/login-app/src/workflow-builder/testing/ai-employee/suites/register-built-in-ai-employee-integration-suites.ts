import type { AiEmployeeIntegrationScenarioId, AiEmployeeIntegrationSuite } from "../types/ai-employee-integration-types";

export function builtInAiEmployeeIntegrationSuites(): AiEmployeeIntegrationSuite[] {
  const runtimeScenarioIds: AiEmployeeIntegrationScenarioId[] = [
    "execution-context-created-once",
    "execution-context-stable-across-ai-tasks",
    "execution-context-reused-on-resume",
    "execution-context-reused-on-continue",
    "allowed-tool-executes-with-rbac",
    "denied-tool-returns-scope-denial",
    "knowledge-retrieval-from-execution-context",
    "provider-selection-from-execution-context",
    "draft-employee-cannot-execute",
    "unpublished-employee-gating",
    "multiple-employees-isolated-contexts",
    "telemetry-stamps-runtime-decisions",
    "coordinator-execution-context-flows-to-prompt",
    "coordinator-uses-employee-provider-from-context",
    "floating-chat-reuses-execution-context",
    "confirmation-pauses-before-merge-tool",
    "confirmation-resumes-with-token",
    "conversation-metadata-hydrates-execution-context",
    "tool-call-loop-allowed-tool-routes-once",
    "tool-call-loop-denied-tool-structured-denial",
    "tool-call-loop-coordinator-path",
  ];

  return [
    {
      id: "suite-ai-employee-enterprise",
      name: "Enterprise AI Employee Runtime",
      description:
        "End-to-end integration scenarios for runtime binding, execution context, tool scoping, and telemetry.",
      scenarioIds: [...runtimeScenarioIds, "workflow-testing-suite-registration"],
    },
    {
      id: "suite-ai-employee-context",
      name: "AI Employee Execution Context",
      description: "Verifies immutable ExecutionContext creation, stability, resume, and continue behavior.",
      scenarioIds: [
        "execution-context-created-once",
        "execution-context-stable-across-ai-tasks",
        "execution-context-reused-on-resume",
        "execution-context-reused-on-continue",
      ],
    },
    {
      id: "suite-ai-employee-tool-scope",
      name: "AI Employee Tool Scoping",
      description: "Verifies allowed and denied tool behavior with RBAC parity.",
      scenarioIds: ["allowed-tool-executes-with-rbac", "denied-tool-returns-scope-denial"],
    },
  ];
}
