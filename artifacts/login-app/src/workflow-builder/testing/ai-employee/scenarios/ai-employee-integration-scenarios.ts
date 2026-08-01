import {
  AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY,
  createAgentEmployeeExecutionContext,
  readAgentEmployeeExecutionContext,
} from "../../../../lib/ai-employees/utilities/agent-employee-execution-context";
import { EMPLOYEE_TOOL_SCOPE_DENIED_CODE } from "../../../../lib/ai-employees/utilities/tool-scope-filter";
import { prepareEmployeeChatRuntime } from "../../../../lib/ai-employees/utilities/prepare-employee-chat-runtime";
import { clearConversationExecutionContext } from "../../../../lib/ai-employees/utilities/employee-conversation-binding";
import {
  createIntegrationChannelRuntime,
  createIntegrationEmployee,
  createIntegrationEmployeeB,
  EMPLOYEE_PROVIDER_CONNECTION_ID,
  INTEGRATION_COMPANY_ID,
  TENANT_PROVIDER_CONNECTION_ID,
} from "../fixtures/integration-fixtures";
import {
  createAgentWorkflowHarness,
  readExecutionContextFromWorkflow,
} from "../harness/workflow-start-harness";
import { createCoordinatorRuntimeHarness } from "../harness/coordinator-runtime-harness";
import { createToolCallLoopCoordinatorHarness } from "../harness/tool-call-loop-coordinator-harness";
import {
  hydrateEmployeeExecutionContext,
  buildEmployeeConversationMetadataPatch,
} from "../../../../lib/ai-employees/utilities/conversation-employee-context-hydrator";
import { assertCondition, buildScenarioResult } from "../assertions/integration-assertions";
import type {
  AiEmployeeIntegrationScenarioId,
  AiEmployeeIntegrationScenarioResult,
} from "../types/ai-employee-integration-types";

const SCENARIO_NAMES: Record<AiEmployeeIntegrationScenarioId, string> = {
  "execution-context-created-once": "ExecutionContext created exactly once at start",
  "execution-context-stable-across-ai-tasks": "ExecutionContext reference stable across AI tasks",
  "execution-context-reused-on-resume": "ExecutionContext reused on resume",
  "execution-context-reused-on-continue": "ExecutionContext reused on continue",
  "allowed-tool-executes-with-rbac": "Allowed tool executes with RBAC",
  "denied-tool-returns-scope-denial": "Denied tool returns EMPLOYEE_TOOL_SCOPE_DENIED",
  "knowledge-retrieval-from-execution-context": "Knowledge retrieval from ExecutionContext",
  "provider-selection-from-execution-context": "Provider selection from ExecutionContext",
  "draft-employee-cannot-execute": "Draft employee cannot execute",
  "unpublished-employee-gating": "Unpublished employee gating",
  "multiple-employees-isolated-contexts": "Multiple employees isolated contexts",
  "telemetry-stamps-runtime-decisions": "Telemetry stamps runtime decisions",
  "workflow-testing-suite-registration": "Workflow Testing suite registration",
  "coordinator-execution-context-flows-to-prompt": "Coordinator receives ExecutionContext in prompt stage",
  "coordinator-uses-employee-provider-from-context": "Coordinator uses employee provider from ExecutionContext",
  "floating-chat-reuses-execution-context": "Floating chat reuses ExecutionContext without re-resolve",
  "confirmation-pauses-before-merge-tool": "Confirmation pauses before merge_customers tool",
  "confirmation-resumes-with-token": "Confirmation resume executes merge after token",
  "conversation-metadata-hydrates-execution-context": "Conversation metadata hydrates ExecutionContext",
  "tool-call-loop-allowed-tool-routes-once": "ToolCallLoop allowed tool routes once",
  "tool-call-loop-denied-tool-structured-denial": "ToolCallLoop denied tool returns structured denial",
  "tool-call-loop-coordinator-path": "ToolCallLoop executes through coordinator path",
};

export async function runAiEmployeeIntegrationScenario(
  scenarioId: AiEmployeeIntegrationScenarioId,
): Promise<AiEmployeeIntegrationScenarioResult> {
  const startedMs = Date.now();
  const scenarioName = SCENARIO_NAMES[scenarioId];

  switch (scenarioId) {
    case "execution-context-created-once":
      return runExecutionContextCreatedOnce(startedMs, scenarioId, scenarioName);
    case "execution-context-stable-across-ai-tasks":
      return runExecutionContextStableAcrossAiTasks(startedMs, scenarioId, scenarioName);
    case "execution-context-reused-on-resume":
      return runExecutionContextReusedOnResume(startedMs, scenarioId, scenarioName);
    case "execution-context-reused-on-continue":
      return runExecutionContextReusedOnContinue(startedMs, scenarioId, scenarioName);
    case "allowed-tool-executes-with-rbac":
      return runAllowedToolExecutesWithRbac(startedMs, scenarioId, scenarioName);
    case "denied-tool-returns-scope-denial":
      return runDeniedToolReturnsScopeDenial(startedMs, scenarioId, scenarioName);
    case "knowledge-retrieval-from-execution-context":
      return runKnowledgeRetrievalFromExecutionContext(startedMs, scenarioId, scenarioName);
    case "provider-selection-from-execution-context":
      return runProviderSelectionFromExecutionContext(startedMs, scenarioId, scenarioName);
    case "draft-employee-cannot-execute":
      return runDraftEmployeeCannotExecute(startedMs, scenarioId, scenarioName);
    case "unpublished-employee-gating":
      return runUnpublishedEmployeeGating(startedMs, scenarioId, scenarioName);
    case "multiple-employees-isolated-contexts":
      return runMultipleEmployeesIsolatedContexts(startedMs, scenarioId, scenarioName);
    case "telemetry-stamps-runtime-decisions":
      return runTelemetryStampsRuntimeDecisions(startedMs, scenarioId, scenarioName);
    case "workflow-testing-suite-registration":
      return runWorkflowTestingSuiteRegistration(startedMs, scenarioId, scenarioName);
    case "coordinator-execution-context-flows-to-prompt":
      return runCoordinatorExecutionContextFlowsToPrompt(startedMs, scenarioId, scenarioName);
    case "coordinator-uses-employee-provider-from-context":
      return runCoordinatorUsesEmployeeProviderFromContext(startedMs, scenarioId, scenarioName);
    case "floating-chat-reuses-execution-context":
      return runFloatingChatReusesExecutionContext(startedMs, scenarioId, scenarioName);
    case "confirmation-pauses-before-merge-tool":
      return runConfirmationPausesBeforeMergeTool(startedMs, scenarioId, scenarioName);
    case "confirmation-resumes-with-token":
      return runConfirmationResumesWithToken(startedMs, scenarioId, scenarioName);
    case "conversation-metadata-hydrates-execution-context":
      return runConversationMetadataHydratesExecutionContext(startedMs, scenarioId, scenarioName);
    case "tool-call-loop-allowed-tool-routes-once":
      return runToolCallLoopAllowedToolRoutesOnce(startedMs, scenarioId, scenarioName);
    case "tool-call-loop-denied-tool-structured-denial":
      return runToolCallLoopDeniedToolStructuredDenial(startedMs, scenarioId, scenarioName);
    case "tool-call-loop-coordinator-path":
      return runToolCallLoopCoordinatorPath(startedMs, scenarioId, scenarioName);
    default:
      return buildScenarioResult({
        scenarioId,
        scenarioName,
        startedMs,
        assertions: [
          assertCondition("unknown-scenario", "Scenario exists", false, `Unknown scenario: ${scenarioId}`),
        ],
        telemetry: { events: [] },
      });
  }
}

async function runExecutionContextCreatedOnce(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({ tenantProviderConnectionId: TENANT_PROVIDER_CONNECTION_ID });

  const workflow = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-context-once",
    goal: "Create a customer named Integration User",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const stored = await harness.getWorkflow(workflow.workflowId);
  const storedContext = readExecutionContextFromWorkflow(stored);
  const harnessStart = workflow.harnessStart;

  const assertions = [
    assertCondition(
      "resolve-once",
      "Binding resolved exactly once",
      harness.resolveCount === 1,
      `Expected one resolve, got ${harness.resolveCount}`,
    ),
    assertCondition(
      "context-exists",
      "employeeExecutionContext exists",
      harnessStart.executionContext != null,
      "ExecutionContext missing after start",
    ),
    assertCondition(
      "context-frozen",
      "ExecutionContext is frozen",
      harnessStart.executionContext != null && Object.isFrozen(harnessStart.executionContext),
      "ExecutionContext is not frozen",
    ),
    assertCondition(
      "context-in-memory",
      "ExecutionContext stored in execution memory",
      storedContext != null &&
        (stored?.memory.executionState?.pageContext as Record<string, unknown> | undefined)?.[
          AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY
        ] != null,
      "ExecutionContext not persisted in workflow memory",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { workflowId: workflow.workflowId },
  });
}

async function runExecutionContextStableAcrossAiTasks(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-multi-ai",
    goal: "Summarize customer activity for account review",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
    basePageContext: { customerId: "cust-integration-1" },
  });

  await harness.simulateAiTask(started.workflowId, "conv-multi-ai");
  await harness.simulateAiTask(started.workflowId, "conv-multi-ai");

  const references = harness.runtimeChatCalls
    .map((call) => call.executionContext)
    .filter((context): context is NonNullable<typeof context> => context != null);
  const firstReference = references[0] ?? null;
  const allSameReference =
    references.length >= 2 && references.every((reference) => reference === firstReference);

  const assertions = [
    assertCondition(
      "multiple-ai-calls",
      "Multiple AI tasks executed",
      harness.runtimeChatCalls.length >= 2,
      `Expected >= 2 runtimeChat calls, got ${harness.runtimeChatCalls.length}`,
    ),
    assertCondition(
      "same-reference",
      "ExecutionContext object reference never changes",
      allSameReference,
      "ExecutionContext reference changed across AI tasks",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { runtimeChatCalls: harness.runtimeChatCalls.length },
  });
}

async function runExecutionContextReusedOnResume(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-resume",
    goal: "Create a customer named Resume Context",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const before = readExecutionContextFromWorkflow(await harness.getWorkflow(started.workflowId));
  const resumed = await harness.resume(started.workflowId);
  const after = readExecutionContextFromWorkflow(await harness.getWorkflow(resumed.workflowId));

  const assertions = [
    assertCondition("context-before-resume", "Context exists before resume", before != null, "Missing context"),
    assertCondition(
      "same-context-after-resume",
      "Same ExecutionContext reused on resume",
      before != null && after === before,
      "ExecutionContext changed on resume",
    ),
    assertCondition(
      "no-second-resolve",
      "No second binding resolve on resume",
      harness.resolveCount === 1,
      `Expected resolve count 1, got ${harness.resolveCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { workflowId: started.workflowId },
  });
}

async function runExecutionContextReusedOnContinue(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-continue",
    goal: "Create a customer named Continue Context",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const before = readExecutionContextFromWorkflow(await harness.getWorkflow(started.workflowId));
  const continued = await harness.recover(started.workflowId);
  const after = readExecutionContextFromWorkflow(await harness.getWorkflow(continued.workflowId));

  const assertions = [
    assertCondition("context-before-continue", "Context exists before continue", before != null, "Missing context"),
    assertCondition(
      "same-context-after-continue",
      "Same ExecutionContext reused on continue/recover",
      before != null && after === before,
      "ExecutionContext changed on continue",
    ),
    assertCondition(
      "no-second-resolve-continue",
      "No second binding resolve on continue",
      harness.resolveCount === 1,
      `Expected resolve count 1, got ${harness.resolveCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { workflowId: started.workflowId },
  });
}

async function runAllowedToolExecutesWithRbac(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-allowed-tool",
    goal: "Find inactive customers not contacted in 90 days",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const searchCalls = harness.toolRouteCalls.filter((call) => call.toolKey === "search_customer");
  const rbacEvents = harness.telemetry.findEvents("rbac_evaluated");

  const assertions = [
    assertCondition(
      "tool-executed",
      "Allowed CRM search_customer executes",
      searchCalls.some((call) => call.status === "succeeded"),
      "search_customer did not execute",
    ),
    assertCondition(
      "rbac-evaluated",
      "RBAC still evaluated",
      rbacEvents.length > 0 && searchCalls.every((call) => call.rbacChecked),
      "RBAC was not evaluated for allowed tool",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { toolRouteCalls: harness.toolRouteCalls },
  });
}

async function runDeniedToolReturnsScopeDenial(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({ toolRouterShouldExecute: false });

  await harness.prepareStart({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-denied-tool",
    goal: "Integration denied tool scenario",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  await harness.routeTool("conv-denied-tool", "booking_search");

  const deniedCalls = harness.toolRouteCalls.filter((call) => call.toolKey === "booking_search");
  const deniedTelemetry = harness.telemetry
    .snapshot()
    .events.filter(
      (event) =>
        event.type === "tool_scope_decision" &&
        event.toolKey === "booking_search" &&
        event.denied === true,
    );
  const routerEvents = harness.telemetry.findEvents("tool_router_executed");

  const assertions = [
    assertCondition(
      "scope-denied",
      "Denied tool returns EMPLOYEE_TOOL_SCOPE_DENIED",
      deniedCalls.some((call) => call.errorCode === EMPLOYEE_TOOL_SCOPE_DENIED_CODE) ||
        deniedTelemetry.length > 0,
      "Expected EMPLOYEE_TOOL_SCOPE_DENIED for booking_search",
    ),
    assertCondition(
      "router-not-executed",
      "ToolRouterService not executed for denied tool",
      !routerEvents.some((event) => event.toolKey === "booking_search"),
      "ToolRouterService executed for denied tool",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { deniedCalls },
  });
}

async function runKnowledgeRetrievalFromExecutionContext(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-knowledge",
    goal: "Summarize customer activity for account review",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
    basePageContext: { customerId: "cust-integration-1" },
  });
  await harness.simulateAiTask(started.workflowId, "conv-knowledge");

  const knowledgeEvents = harness.telemetry.findEvents("knowledge_retrieval_configured");
  const event = knowledgeEvents[0];

  const assertions = [
    assertCondition(
      "knowledge-configured",
      "Knowledge retrieval configured from ExecutionContext",
      knowledgeEvents.length > 0,
      "No knowledge retrieval telemetry event",
    ),
    assertCondition(
      "employee-collection",
      "Employee knowledge collection used",
      event?.knowledgeCollectionId === "collection-integration-1",
      `Expected collection-integration-1, got ${event?.knowledgeCollectionId ?? "null"}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { knowledgeEvents },
  });
}

async function runProviderSelectionFromExecutionContext(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({ tenantProviderConnectionId: TENANT_PROVIDER_CONNECTION_ID });

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-provider",
    goal: "Summarize customer activity for account review",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
    basePageContext: { customerId: "cust-integration-1" },
  });
  await harness.simulateAiTask(started.workflowId, "conv-provider");

  const providerEvents = harness.telemetry.findEvents("provider_selected");
  const usedEmployeeProvider = providerEvents.some(
    (event) => event.providerConnectionId === EMPLOYEE_PROVIDER_CONNECTION_ID,
  );

  const assertions = [
    assertCondition(
      "employee-provider",
      "Runtime uses employee provider instead of tenant default",
      usedEmployeeProvider,
      `Expected ${EMPLOYEE_PROVIDER_CONNECTION_ID}, got tenant default`,
    ),
    assertCondition(
      "not-tenant-default",
      "Tenant default provider not selected for employee workflow",
      providerEvents.every((event) => event.providerConnectionId !== TENANT_PROVIDER_CONNECTION_ID),
      "Tenant default provider was used",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { providerEvents },
  });
}

async function runDraftEmployeeCannotExecute(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const draftEmployee = createIntegrationEmployee({ status: "draft" });
  const harness = createAgentWorkflowHarness();

  const harnessStart = await harness.prepareStart({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-draft",
    goal: "Draft employee should not bind",
    aiEmployeeId: draftEmployee.id,
    employee: draftEmployee,
    channelRuntime: null,
  });

  const assertions = [
    assertCondition(
      "no-context",
      "Draft employee does not create ExecutionContext",
      harnessStart.executionContext == null,
      "Draft employee incorrectly created ExecutionContext",
    ),
    assertCondition(
      "resolve-once-draft",
      "Binding attempted once",
      harness.resolveCount === 1,
      `Expected one resolve attempt, got ${harness.resolveCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
  });
}

async function runUnpublishedEmployeeGating(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness();

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-unpublish",
    goal: "Create a customer named Frozen Context",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const frozenBefore = readExecutionContextFromWorkflow(await harness.getWorkflow(started.workflowId));

  const newStart = await harness.prepareStart({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-unpublish-new",
    goal: "New workflow after unpublish",
    aiEmployeeId: employee.id,
    employee: createIntegrationEmployee({ status: "draft" }),
    channelRuntime: null,
  });

  const continued = await harness.recover(started.workflowId);
  const frozenAfter = readExecutionContextFromWorkflow(await harness.getWorkflow(continued.workflowId));

  const assertions = [
    assertCondition(
      "old-workflow-keeps-context",
      "Running workflow continues with frozen context",
      frozenBefore != null && frozenAfter === frozenBefore,
      "Frozen context changed for running workflow",
    ),
    assertCondition(
      "new-workflow-denied",
      "New workflow denied after unpublish",
      newStart.executionContext == null,
      "New workflow incorrectly received ExecutionContext",
    ),
    assertCondition(
      "single-resolve-per-start",
      "Each new start resolves binding once",
      harness.resolveCount === 2,
      `Expected 2 resolve calls, got ${harness.resolveCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { oldWorkflowId: started.workflowId },
  });
}

async function runMultipleEmployeesIsolatedContexts(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employeeA = createIntegrationEmployee();
  const employeeB = createIntegrationEmployeeB();
  const harnessA = createAgentWorkflowHarness();
  const harnessB = createAgentWorkflowHarness();

  const startA = await harnessA.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-employee-a",
    goal: "Create a customer named Employee A",
    aiEmployeeId: employeeA.id,
    employee: employeeA,
    channelRuntime: createIntegrationChannelRuntime(employeeA),
  });

  const startB = await harnessB.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-employee-b",
    goal: "Create a customer named Employee B",
    aiEmployeeId: employeeB.id,
    employee: employeeB,
    channelRuntime: createIntegrationChannelRuntime(employeeB),
  });

  const contextA = readExecutionContextFromWorkflow(await harnessA.getWorkflow(startA.workflowId));
  const contextB = readExecutionContextFromWorkflow(await harnessB.getWorkflow(startB.workflowId));

  const assertions = [
    assertCondition("context-a", "Employee A context exists", contextA?.aiEmployeeId === "employee-a", "Missing A"),
    assertCondition("context-b", "Employee B context exists", contextB?.aiEmployeeId === "employee-b", "Missing B"),
    assertCondition(
      "no-leakage",
      "Execution contexts are isolated",
      contextA !== contextB &&
        Boolean(contextA?.allowedToolKeys.includes("search_customer")) &&
        !Boolean(contextB?.allowedToolKeys.includes("search_customer")),
      "Employee contexts leaked or shared tool scope",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: {
      events: [...harnessA.telemetry.snapshot().events, ...harnessB.telemetry.snapshot().events],
    },
    details: {
      employeeA: contextA?.aiEmployeeId,
      employeeB: contextB?.aiEmployeeId,
    },
  });
}

async function runTelemetryStampsRuntimeDecisions(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({ tenantProviderConnectionId: TENANT_PROVIDER_CONNECTION_ID });

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-telemetry",
    goal: "Summarize customer activity for account review",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
    basePageContext: { customerId: "cust-integration-1" },
  });
  await harness.simulateAiTask(started.workflowId, "conv-telemetry");
  await harness.routeTool("conv-telemetry", "search_customer");
  await harness.routeTool("conv-telemetry", "booking_search");

  const events = harness.telemetry.snapshot().events;
  const hasEmployee = events.some((event) => event.employeeId === employee.id);
  const hasToolDecision = events.some((event) => event.type === "tool_scope_decision");
  const hasProvider = events.some((event) => event.type === "provider_selected");
  const hasKnowledge = events.some((event) => event.type === "knowledge_retrieval_configured");

  const assertions = [
    assertCondition("telemetry-employee", "employeeId stamped", hasEmployee, "employeeId missing in telemetry"),
    assertCondition("telemetry-tools", "tool decisions stamped", hasToolDecision, "tool decisions missing"),
    assertCondition("telemetry-provider", "provider stamped", hasProvider, "provider missing in telemetry"),
    assertCondition("telemetry-knowledge", "knowledge stamped", hasKnowledge, "knowledge missing in telemetry"),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { eventCount: events.length },
  });
}

async function runWorkflowTestingSuiteRegistration(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const { builtInAiEmployeeIntegrationSuites } = await import("../suites/register-built-in-ai-employee-integration-suites");
  const suites = builtInAiEmployeeIntegrationSuites();
  const enterpriseSuite = suites.find((suite) => suite.id === "suite-ai-employee-enterprise");

  const assertions = [
    assertCondition(
      "suite-registered",
      "AI Employee enterprise suite registered",
      enterpriseSuite != null,
      "Enterprise AI Employee suite missing",
    ),
    assertCondition(
      "all-scenarios-present",
      "All enterprise scenarios present",
      (enterpriseSuite?.scenarioIds.length ?? 0) === 22,
      `Expected 22 scenarios, got ${enterpriseSuite?.scenarioIds.length ?? 0}`,
    ),
    assertCondition(
      "registration-scenario-included",
      "Registration scenario included in platform",
      enterpriseSuite?.scenarioIds.includes("workflow-testing-suite-registration") === true,
      "Registration scenario missing from suite",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
    details: { suites: suites.map((suite) => ({ id: suite.id, scenarios: suite.scenarioIds.length })) },
  });
}

async function runCoordinatorExecutionContextFlowsToPrompt(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const harness = createCoordinatorRuntimeHarness();
  const { pageContext, executionContext } = harness.buildEmployeePageContext("conv-coordinator-prompt");

  const response = await harness.executeWithEmployeeContext({
    conversationId: "conv-coordinator-prompt",
    messageText: "Summarize account activity",
    pageContext,
    providerConnectionId: executionContext.providerConnectionId,
    knowledgeRetrieval: executionContext.knowledgeRetrieval
      ? {
          embeddingConnectionId: executionContext.knowledgeRetrieval.embeddingConnectionId,
          vectorStoreConnectionId: executionContext.knowledgeRetrieval.vectorStoreConnectionId,
          collectionId: executionContext.knowledgeRetrieval.collectionId,
        }
      : undefined,
  });

  const promptContext = readAgentEmployeeExecutionContext(harness.capturedPromptPageContext);
  const stageOrder = response.steps.map((step) => step.stage);

  const assertions = [
    assertCondition(
      "pipeline-complete",
      "Coordinator pipeline completes",
      response.responseContent.length > 0,
      "Empty coordinator response",
    ),
    assertCondition(
      "full-pipeline-order",
      "All pipeline stages execute in order",
      JSON.stringify(stageOrder) === JSON.stringify([...harness.pipelineStages]),
      `Unexpected stage order: ${stageOrder.join(",")}`,
    ),
    assertCondition(
      "prompt-has-context",
      "Prompt stage receives employeeExecutionContext",
      promptContext?.aiEmployeeId === executionContext.aiEmployeeId,
      "ExecutionContext missing in prompt stage",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
  });
}

async function runCoordinatorUsesEmployeeProviderFromContext(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const harness = createCoordinatorRuntimeHarness();
  const { pageContext, executionContext } = harness.buildEmployeePageContext("conv-coordinator-provider");

  await harness.executeWithEmployeeContext({
    conversationId: "conv-coordinator-provider",
    messageText: "Hello from employee runtime",
    pageContext,
    providerConnectionId: executionContext.providerConnectionId,
  });

  const assertions = [
    assertCondition(
      "employee-provider-used",
      "Coordinator execution uses employee provider connection",
      harness.capturedExecutionInput?.providerConnectionId === EMPLOYEE_PROVIDER_CONNECTION_ID,
      `Expected ${EMPLOYEE_PROVIDER_CONNECTION_ID}, got ${harness.capturedExecutionInput?.providerConnectionId ?? "null"}`,
    ),
    assertCondition(
      "not-tenant-default",
      "Tenant default provider not used",
      harness.capturedExecutionInput?.providerConnectionId !== TENANT_PROVIDER_CONNECTION_ID,
      "Tenant default provider was used",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
  });
}

async function runFloatingChatReusesExecutionContext(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  let resolveCount = 0;

  const first = await prepareEmployeeChatRuntime({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-floating-chat",
    basePageContext: { module: "agents", aiEmployeeId: employee.id },
    bindingResolver: async () => {
      resolveCount += 1;
      return channelRuntime;
    },
  });

  const second = await prepareEmployeeChatRuntime({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-floating-chat",
    basePageContext: { module: "agents" },
    bindingResolver: async () => {
      resolveCount += 1;
      return channelRuntime;
    },
  });

  clearConversationExecutionContext("conv-floating-chat");

  const assertions = [
    assertCondition(
      "first-bind",
      "First chat message creates ExecutionContext",
      first.executionContext != null,
      "Missing ExecutionContext on first message",
    ),
    assertCondition(
      "reuse-context",
      "Second message reuses same ExecutionContext reference",
      second.reusedExistingContext && second.executionContext === first.executionContext,
      "ExecutionContext was re-resolved for second message",
    ),
    assertCondition(
      "single-resolve",
      "Binding resolved only once",
      resolveCount === 1,
      `Expected one resolve, got ${resolveCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
  });
}

async function runConfirmationPausesBeforeMergeTool(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee({
    allowedToolKeys: ["search_customer", "knowledge_search", "find_duplicate_customers", "merge_customers"],
    toolSummary: "search_customer, knowledge_search, find_duplicate_customers, merge_customers",
  });
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({
    rbacPermissionCodes: [
      "agents.view",
      "agents.execute",
      "tools.execute",
      "customers.view",
      "customers.search",
      "customers.merge",
      "knowledge.view",
    ],
  });

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-confirm-pause",
    goal: "Merge duplicate customers",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const mergeRouteCalls = harness.toolRouteCalls.filter((call) => call.toolKey === "merge_customers");

  const assertions = [
    assertCondition(
      "waiting-user",
      "Workflow pauses for confirmation",
      started.startResult.status === "waiting_user",
      `Expected waiting_user, got ${started.startResult.status}`,
    ),
    assertCondition(
      "confirmation-request",
      "Confirmation request issued for merge_customers",
      started.startResult.confirmationRequest?.tool === "merge_customers",
      "Missing merge_customers confirmation request",
    ),
    assertCondition(
      "tool-not-routed",
      "merge_customers not routed before confirmation",
      mergeRouteCalls.length === 0,
      "ToolRouter executed merge_customers before confirmation",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { workflowId: started.workflowId },
  });
}

async function runConfirmationResumesWithToken(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee({
    allowedToolKeys: ["search_customer", "knowledge_search", "find_duplicate_customers", "merge_customers"],
    toolSummary: "search_customer, knowledge_search, find_duplicate_customers, merge_customers",
  });
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const harness = createAgentWorkflowHarness({
    rbacPermissionCodes: [
      "agents.view",
      "agents.execute",
      "tools.execute",
      "customers.view",
      "customers.search",
      "customers.merge",
      "knowledge.view",
    ],
  });

  const started = await harness.start({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-confirm-resume",
    goal: "Merge duplicate customers",
    aiEmployeeId: employee.id,
    employee,
    channelRuntime,
  });

  const token = started.startResult.confirmationRequest?.confirmationToken;
  const resumed = await harness.resume(started.workflowId, token);
  const mergeCalls = harness.toolRouteCalls.filter(
    (call) => call.toolKey === "merge_customers" && call.status === "succeeded",
  );
  const contextBefore = readExecutionContextFromWorkflow(await harness.getWorkflow(started.workflowId));
  const contextAfter = readExecutionContextFromWorkflow(await harness.getWorkflow(resumed.workflowId));

  const assertions = [
    assertCondition("token-present", "Confirmation token issued", Boolean(token), "Missing confirmation token"),
    assertCondition(
      "merge-after-resume",
      "merge_customers executes after confirmation resume",
      mergeCalls.length > 0,
      "merge_customers did not execute after resume",
    ),
    assertCondition(
      "context-stable",
      "ExecutionContext unchanged after confirmation resume",
      contextBefore != null && contextAfter === contextBefore,
      "ExecutionContext changed during confirmation resume",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: harness.telemetry.snapshot(),
    details: { workflowId: started.workflowId, resumedStatus: resumed.status },
  });
}

async function runConversationMetadataHydratesExecutionContext(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const executionContext = createAgentEmployeeExecutionContext(channelRuntime, {
    module: "agents",
    aiEmployeeId: employee.id,
  });
  const metadata = buildEmployeeConversationMetadataPatch(
    { source: "floating_ai_assistant" },
    executionContext,
  );

  clearConversationExecutionContext("conv-metadata-hydrate");

  const prepareResult = await prepareEmployeeChatRuntime({
    companyId: INTEGRATION_COMPANY_ID,
    conversationId: "conv-metadata-hydrate",
    basePageContext: { module: "agents" },
    conversationMetadata: metadata,
    bindingResolver: async () => {
      throw new Error("resolveEmployeeChannelRuntime should not be called");
    },
  });

  clearConversationExecutionContext("conv-metadata-hydrate");

  const assertions = [
    assertCondition(
      "metadata-hydrated",
      "ExecutionContext hydrated from conversation metadata",
      prepareResult.executionContext != null &&
        prepareResult.hydrationSource === "conversation_metadata",
      "Metadata hydration failed",
    ),
    assertCondition(
      "metadata-shape",
      "Metadata stores employeeExecutionContext reference",
      metadata[AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY] != null,
      "employeeExecutionContext missing from metadata patch",
    ),
    assertCondition(
      "prepare-reuses-metadata",
      "prepareEmployeeChatRuntime reuses metadata without resolve",
      prepareResult.reusedExistingContext &&
        prepareResult.resolveCount === 0 &&
        prepareResult.hydrationSource === "conversation_metadata",
      "prepareEmployeeChatRuntime re-resolved instead of hydrating metadata",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
  });
}

async function runToolCallLoopAllowedToolRoutesOnce(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const harness = createToolCallLoopCoordinatorHarness("conv-tool-loop-allowed");
  const result = await harness.runToolLoop(
    [{ id: "call-allowed-1", name: "search_customer", arguments: { query: "inactive" } }],
  );

  const assertions = [
    assertCondition(
      "tool-succeeded",
      "Allowed tool executes through ToolCallLoop",
      result.toolExecutions.some(
        (execution) => execution.toolKey === "search_customer" && execution.status === "succeeded",
      ),
      "search_customer did not succeed",
    ),
    assertCondition(
      "single-route",
      "ToolRouter invoked exactly once",
      harness.routerCallCount === 1 && harness.routerCalls.join(",") === "search_customer",
      `Expected one router call, got ${harness.routerCallCount}`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
    details: { routerCalls: harness.routerCalls },
  });
}

async function runToolCallLoopDeniedToolStructuredDenial(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const harness = createToolCallLoopCoordinatorHarness("conv-tool-loop-denied");
  const result = await harness.runToolLoop(
    [{ id: "call-denied-1", name: "booking_search", arguments: { query: "slot" } }],
    { includeOutOfScopeToolKeys: ["booking_search"] },
  );

  const denialMessage = result.messages.find((message) => message.role === "tool");
  let denialPayload: Record<string, unknown> | null = null;
  if (denialMessage && typeof denialMessage.content === "string") {
    denialPayload = JSON.parse(denialMessage.content) as Record<string, unknown>;
  }

  const assertions = [
    assertCondition(
      "scope-denied-code",
      "Denied tool returns EMPLOYEE_TOOL_SCOPE_DENIED",
      denialPayload?.errorCode === harness.denialCodes.employeeScopeDenied,
      `Expected ${harness.denialCodes.employeeScopeDenied}, got ${String(denialPayload?.errorCode)}`,
    ),
    assertCondition(
      "structured-reason",
      "Structured denial includes reason",
      typeof denialPayload?.reason === "string" && (denialPayload.reason as string).length > 0,
      "Missing structured denial reason",
    ),
    assertCondition(
      "router-not-called",
      "ToolRouter not invoked for denied tool",
      harness.routerCallCount === 0,
      `ToolRouter invoked ${harness.routerCallCount} times for denied tool`,
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
    details: { denialPayload, routerCalls: harness.routerCalls },
  });
}

async function runToolCallLoopCoordinatorPath(
  startedMs: number,
  scenarioId: AiEmployeeIntegrationScenarioId,
  scenarioName: string,
) {
  const harness = createToolCallLoopCoordinatorHarness("conv-tool-loop-coordinator");
  const { response } = await harness.runThroughCoordinator([
    { id: "call-coordinator-1", name: "search_customer", arguments: { query: "active" } },
  ]);

  const assertions = [
    assertCondition(
      "coordinator-complete",
      "Coordinator completes with ToolCallLoop-backed execution",
      response.responseContent.length > 0,
      "Coordinator response empty",
    ),
    assertCondition(
      "router-once",
      "ToolRouter invoked once through coordinator path",
      harness.routerCallCount === 1,
      `Expected one router call, got ${harness.routerCallCount}`,
    ),
    assertCondition(
      "execution-stage",
      "Execution stage completed in coordinator pipeline",
      response.steps.some((step) => step.stage === "execution" && step.status === "completed"),
      "Execution stage missing or incomplete",
    ),
  ];

  return buildScenarioResult({
    scenarioId,
    scenarioName,
    startedMs,
    assertions,
    telemetry: { events: [] },
    details: { routerCalls: harness.routerCalls, stepCount: response.steps.length },
  });
}
