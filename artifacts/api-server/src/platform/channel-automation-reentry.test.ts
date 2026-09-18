/**
 * Post-handoff Return-to-AI intent reentry: start(reason=no_active_session)
 * must reuse __reentrySkipWelcome / __reentryConsumeIntent instead of replaying welcome.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  AUTOMATION_PERMISSIONS,
  createActionNodeHandler,
  type ExecutionContext,
} from "@workspace/automation-platform";
import { extractAutomationOutboundMessages } from "@workspace/channel-platform";
import {
  createChannelAutomationPort,
  isIntentReentryStartReason,
  type ChannelAutomationAuth,
} from "./channel-automation-port.js";

const WELCOME = "Hello 👋 Welcome to our clinic.";
const ASK = "اهلا بيك يا فندم اقدر اساعدك ازاي ؟";
const PRICING = "عايز اسعار";

function allowAuth(): ChannelAutomationAuth {
  return {
    resolveServiceContext: async (companyId) => ({
      userId: null,
      companyId,
      isSuperAdmin: false,
      hasPermission: (code) => code === AUTOMATION_PERMISSIONS.execute,
      isWorkflowFeatureEnabled: () => true,
    }),
  };
}

function workflowInput(messageText: string) {
  return {
    companyId: "company-1",
    flowId: "flow-1",
    channelKey: "instagram",
    externalUserId: "ig-user-1",
    messageText,
  };
}

function completedHandoffSession() {
  return {
    id: "sess-handoff-completed",
    company_id: "company-1",
    channel: "instagram",
    external_user_id: "ig-user-1",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "v18",
    run_id: "run-handoff-completed",
    current_node_id: "handoff-node",
    status: "completed",
    started_at: "2026-09-17T23:00:00.000Z",
    last_activity_at: "2026-09-17T23:33:39.000Z",
    metadata: {},
    variables: { __handoffCompleted: true },
  };
}

function waitingIntentSession() {
  return {
    id: "sess-waiting-intent",
    company_id: "company-1",
    channel: "instagram",
    external_user_id: "ig-user-1",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "v18",
    run_id: "run-waiting-intent",
    current_node_id: "ask-node",
    status: "waiting_input",
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    metadata: {},
    variables: { __waitingFor: "customer_intent" },
  };
}

function waitingIntentRun() {
  return {
    id: "run-waiting-intent",
    company_id: "company-1",
    flow_id: "flow-1",
    status: "waiting_input",
    trigger_source: "inbound_message",
    started_at: new Date().toISOString(),
    finished_at: null,
    error_message: null,
    metadata: { flowVersionId: "v18" },
    flow_version_id: "v18",
    current_node_id: "ask-node",
    session_id: "sess-waiting-intent",
    variables: { __waitingFor: "customer_intent" },
  };
}

function orphanedRunningSession() {
  return {
    id: "sess-orphan",
    company_id: "company-1",
    channel: "instagram",
    external_user_id: "ig-user-1",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "v18",
    run_id: "run-orphan",
    current_node_id: "node-mid",
    status: "running",
    started_at: "2026-07-24T00:00:00.000Z",
    last_activity_at: new Date().toISOString(),
    metadata: {},
    variables: {},
  };
}

function orphanedRunningRun() {
  return {
    id: "run-orphan",
    company_id: "company-1",
    flow_id: "flow-1",
    status: "running",
    trigger_source: "inbound_message",
    started_at: "2026-07-24T00:00:00.000Z",
    finished_at: null,
    error_message: null,
    metadata: { flowVersionId: "v18" },
    flow_version_id: "v18",
    current_node_id: "node-mid",
    session_id: "sess-orphan",
    variables: {},
  };
}

function createSessionRepos(options: {
  activeSession?: ReturnType<typeof waitingIntentSession> | ReturnType<typeof orphanedRunningSession> | null;
  priorSessions?: Array<ReturnType<typeof completedHandoffSession> | ReturnType<typeof orphanedRunningSession>>;
  activeRun?: ReturnType<typeof waitingIntentRun> | ReturnType<typeof orphanedRunningRun> | null;
}) {
  const activeSession = options.activeSession ?? null;
  const priorSessions = options.priorSessions ?? [];
  const activeRun = options.activeRun ?? null;

  return {
    sessions: {
      async findById(id: string) {
        if (activeSession?.id === id) return activeSession;
        return priorSessions.find((row) => row.id === id) ?? null;
      },
      async findActiveSession(input: {
        preferStatus?: string;
        activitySince?: string;
      }) {
        if (!activeSession) return null;
        if (input.preferStatus && activeSession.status !== input.preferStatus) return null;
        if (input.activitySince && activeSession.last_activity_at < input.activitySince) return null;
        return activeSession;
      },
      async list(filter: { activeOnly?: boolean }) {
        if (filter.activeOnly) {
          return activeSession && ["active", "running", "waiting_input", "paused"].includes(activeSession.status)
            ? [activeSession]
            : [];
        }
        const rows = [...priorSessions];
        if (activeSession && !rows.some((row) => row.id === activeSession.id)) rows.push(activeSession);
        return rows;
      },
      async updateState() {
        return activeSession;
      },
    },
    runs: {
      async findById(id: string) {
        return activeRun?.id === id ? activeRun : null;
      },
      async findBySessionId(sessionId: string) {
        return activeRun?.session_id === sessionId ? activeRun : null;
      },
    },
  };
}

function actionContext(
  config: Record<string, unknown>,
  variables: Record<string, unknown>,
): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1", company_id: "company-1", name: "Clinic", status: "active" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: {} } as ExecutionContext["run"],
    session: { id: "session-1", metadata: {}, channel: "instagram" } as ExecutionContext["session"],
    variables,
    customer: { id: null },
    currentNode: { id: "node-1", type: "action", config } as ExecutionContext["currentNode"],
    nodes: [],
    edges: [],
  };
}

async function executeWelcomeThenAsk(initialVariables: Record<string, unknown>) {
  const handler = createActionNodeHandler();
  const welcome = await handler.execute(
    actionContext({ action: "send_message", message: WELCOME }, initialVariables),
  );
  const variables = { ...initialVariables, ...(welcome.variables ?? {}) };
  const ask = await handler.execute(
    actionContext(
      { action: "wait_for_input", inputKey: "customer_intent", prompt: ASK },
      variables,
    ),
  );
  const merged = { ...variables, ...(ask.variables ?? {}) };
  return {
    run: { id: "run-new", flow_version_id: "v18", current_node_id: "ask-node" },
    session: { id: "sess-new", current_node_id: "ask-node" },
    lifecycle: ask.outcome === "waiting_input" ? "waiting_input" : ask.outcome,
    currentNodeId: "ask-node",
    variables: merged,
  };
}

function createRecordingEngine() {
  const starts: Array<{ initialVariables?: Record<string, unknown> }> = [];
  const resumes: Array<{ runId: string; input?: Record<string, unknown> }> = [];
  const abandons: string[] = [];
  return {
    starts,
    resumes,
    abandons,
    async start(_ctx: unknown, input: { initialVariables?: Record<string, unknown> }) {
      starts.push(input);
      return executeWelcomeThenAsk(input.initialVariables ?? {});
    },
    async resume(_ctx: unknown, input: { runId: string; input?: Record<string, unknown> }) {
      resumes.push(input);
      return {
        run: { id: input.runId, flow_version_id: "v18", current_node_id: "ask-node" },
        session: { id: "sess-waiting-intent", current_node_id: "ask-node" },
        lifecycle: "waiting_input",
        currentNodeId: "ask-node",
        variables: {
          __waitingFor: "customer_intent",
          customer_intent: typeof input.input?.customer_intent === "string" ? input.input.customer_intent : PRICING,
        },
      };
    },
    async abandonActiveRun(_ctx: unknown, input: { runId: string }) {
      abandons.push(input.runId);
    },
  };
}

function captureRoutingDecisions() {
  const decisions: Array<Record<string, unknown>> = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    const msg = args[0];
    if (typeof msg === "string" && msg.includes("automation.inbound_routing_decision")) {
      try {
        decisions.push(JSON.parse(msg) as Record<string, unknown>);
      } catch {
        // ignore non-JSON
      }
    }
  };
  return {
    decisions,
    restore() {
      console.info = original;
    },
  };
}

function outboundTexts(result: { lifecycle: string; variables: Record<string, unknown> }): string {
  return extractAutomationOutboundMessages(result)
    .map((message) => message.text)
    .join("\n");
}

describe("isIntentReentryStartReason", () => {
  it("treats no_active_session and abandon_and_start reasons as reentry starts", () => {
    assert.equal(isIntentReentryStartReason("no_active_session"), true);
    assert.equal(isIntentReentryStartReason("prior_session_terminal_or_missing_run"), true);
    assert.equal(isIntentReentryStartReason("session_expired"), true);
    assert.equal(isIntentReentryStartReason("stale_waiting_input_missing_execution_pins"), true);
    assert.equal(isIntentReentryStartReason("orphaned_active_run_not_waiting_for_input"), true);
    assert.equal(isIntentReentryStartReason("session_run_status_mismatch"), true);
    assert.equal(isIntentReentryStartReason("bound_flow_mismatch"), false);
    assert.equal(isIntentReentryStartReason("waiting_input_with_valid_execution_pins"), false);
  });
});

describe("channel automation intent reentry after Return to AI", () => {
  const captures: Array<{ restore(): void }> = [];
  afterEach(() => {
    while (captures.length) captures.pop()?.restore();
  });

  it("1-3 completed handoff + no active session starts with reentry flags and skips welcome/ask", async () => {
    const capture = captureRoutingDecisions();
    captures.push(capture);
    const engine = createRecordingEngine();
    const port = createChannelAutomationPort(
      engine as never,
      allowAuth(),
      createSessionRepos({ priorSessions: [completedHandoffSession()] }) as never,
    );

    const result = await port.startWorkflow(workflowInput(PRICING));
    const startDecision = capture.decisions.find((row) => row.engineStartCalled === true);

    assert.equal(startDecision?.executionMode, "start");
    assert.equal(startDecision?.routingReason, "no_active_session");
    assert.equal(engine.resumes.length, 0);
    assert.equal(engine.starts.length, 1);

    const vars = engine.starts[0]!.initialVariables ?? {};
    assert.equal(vars.__reentrySkipWelcome, true);
    assert.equal(vars.__reentryConsumeIntent, true);
    assert.equal(vars.customer_intent, PRICING);

    const texts = (result.outboundMessages ?? []).map((message) => message.text).join("\n");
    assert.doesNotMatch(texts, /Welcome to our clinic/);
    assert.doesNotMatch(texts, /اهلا بيك/);
    assert.notEqual(result.lifecycle, "waiting_input");
  });

  it("2-3 existing handlers skip welcome and consume customer_intent without repeating the ask", async () => {
    const executed = await executeWelcomeThenAsk({
      lastMessage: PRICING,
      customer_intent: PRICING,
      __reentrySkipWelcome: true,
      __reentryConsumeIntent: true,
    });
    const texts = outboundTexts(executed);
    assert.doesNotMatch(texts, /Welcome to our clinic/);
    assert.doesNotMatch(texts, /اهلا بيك/);
    assert.equal(executed.variables.customer_intent, PRICING);
    assert.equal(executed.variables.__prompt, null);
    assert.notEqual(executed.lifecycle, "waiting_input");
  });

  it("4 resume path still works when waiting on customer_intent", async () => {
    const capture = captureRoutingDecisions();
    captures.push(capture);
    const engine = createRecordingEngine();
    const port = createChannelAutomationPort(
      engine as never,
      allowAuth(),
      createSessionRepos({
        activeSession: waitingIntentSession(),
        activeRun: waitingIntentRun(),
      }) as never,
    );

    const result = await port.startWorkflow(workflowInput(PRICING));
    const resumeDecision = capture.decisions.find((row) => row.engineResumeCalled === true);

    assert.equal(result.resumed, true);
    assert.equal(engine.starts.length, 0);
    assert.equal(engine.resumes.length, 1);
    assert.equal(resumeDecision?.executionMode, "resume");
    assert.equal(resumeDecision?.routingReason, "waiting_input_with_valid_execution_pins");
  });

  it("5 genuinely new conversation with no prior workflow/session still receives welcome", async () => {
    const capture = captureRoutingDecisions();
    captures.push(capture);
    const engine = createRecordingEngine();
    const port = createChannelAutomationPort(
      engine as never,
      allowAuth(),
      createSessionRepos({}) as never,
    );

    const result = await port.startWorkflow(workflowInput("مرحبا"));
    const startDecision = capture.decisions.find((row) => row.engineStartCalled === true);
    const vars = engine.starts[0]!.initialVariables ?? {};

    assert.equal(startDecision?.executionMode, "start");
    assert.equal(startDecision?.routingReason, "no_active_session");
    assert.equal(vars.__reentrySkipWelcome, undefined);
    assert.equal(vars.__reentryConsumeIntent, undefined);

    const texts = (result.outboundMessages ?? []).map((message) => message.text).join("\n");
    assert.match(texts, /Welcome to our clinic/);
    assert.match(texts, /اهلا بيك/);
  });

  it("6 abandon_and_start gets the same reentry flags and skips welcome", async () => {
    const capture = captureRoutingDecisions();
    captures.push(capture);
    const engine = createRecordingEngine();
    const port = createChannelAutomationPort(
      engine as never,
      allowAuth(),
      createSessionRepos({
        activeSession: orphanedRunningSession(),
        activeRun: orphanedRunningRun(),
        priorSessions: [orphanedRunningSession()],
      }) as never,
    );

    const result = await port.startWorkflow(workflowInput(PRICING));
    const startDecision = capture.decisions.find((row) => row.engineStartCalled === true);
    const vars = engine.starts[0]!.initialVariables ?? {};

    assert.equal(startDecision?.executionMode, "abandon_and_start");
    assert.equal(startDecision?.routingReason, "orphaned_active_run_not_waiting_for_input");
    assert.equal(vars.__reentrySkipWelcome, true);
    assert.equal(vars.__reentryConsumeIntent, true);
    assert.ok(engine.abandons.includes("run-orphan"));

    const texts = (result.outboundMessages ?? []).map((message) => message.text).join("\n");
    assert.doesNotMatch(texts, /Welcome to our clinic/);
    assert.doesNotMatch(texts, /اهلا بيك/);
  });
});
