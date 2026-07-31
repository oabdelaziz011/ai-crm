import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationEngine,
  AutomationNodeRegistry,
  buildResumeInput,
  cleanupStaleExecutionsForUser,
  countNonTerminalExecutions,
  createBuiltInAutomationNodeHandlers,
  InteractiveResumeValidationError,
  listActiveExecutions,
  resolveInboundAutomationRoute,
  validateInteractiveResumeInput,
} from "../index.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationSessionRecord,
  ServiceContext,
} from "../types.js";
import {
  createInMemoryAutomationFlowVersionRepository,
  createMutableFlowRecord,
  seedPublishedVersionGraph,
} from "../lifecycle/test-version-fixtures.js";
import { createInMemoryAutomationFlowVersionGraphRepository } from "../lifecycle/test-version-graph-repository.js";
import { DefaultBookingServicePort } from "../ports/booking-service-port.js";
import { InMemoryBookingRepository } from "../crm/booking-repository-port.js";
import type { LookupOptionsPort } from "../ports/lookup-options-port.js";
import { staticBinding, variableBinding } from "../field-binding/normalize.js";
import { isNonTerminalRunStatus } from "./session-policy.js";

const EXTERNAL_USER = "201023169075";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "automation.execute" || code === "automation.view",
    ...overrides,
  };
}

function createLookupPort(): LookupOptionsPort {
  return {
    async fetchListOptions(_companyId, config) {
      if (config.lookup === "services") {
        return [{ id: "svc1", title: "Consultation", record: { id: "svc1", name: "Consultation" } }];
      }
      if (config.lookup === "resources") {
        return [{ id: "adam", title: "ADAM", record: { id: "adam", name: "ADAM" } }];
      }
      if (config.lookup === "available_dates") {
        return [{ id: "2026-07-31", title: "Jul 31, 2026", value: "2026-07-31" }];
      }
      if (config.lookup === "available_times" || config.lookup === "available_slots") {
        return [{ id: "10:00", title: "10:00 AM", value: "10:00" }];
      }
      return [];
    },
  };
}

function createLifecycleEnvironment() {
  const flow = createMutableFlowRecord({ status: "active" });
  const nodes: AutomationNodeRecord[] = [];
  const edges: AutomationEdgeRecord[] = [];
  const runs: AutomationRunRecord[] = [];
  const sessions: ConversationSessionRecord[] = [];
  const versionRepository = createInMemoryAutomationFlowVersionRepository();
  const versionGraph = createInMemoryAutomationFlowVersionGraphRepository();
  const bookingRepository = new InMemoryBookingRepository();
  const bookingService = new DefaultBookingServicePort(bookingRepository);
  const lookupOptions = createLookupPort();

  const flowRepository: AutomationFlowRepository = {
    create: async () => flow,
    update: async (input) => {
      if (input.status !== undefined) flow.status = input.status;
      if (input.activeVersionId !== undefined) flow.active_version_id = input.activeVersionId;
      if (input.version !== undefined) flow.version = input.version;
      if (input.hasUnpublishedDraft !== undefined) flow.has_unpublished_draft = input.hasUnpublishedDraft;
      return flow;
    },
    updateStatus: async (_flowId, status) => {
      flow.status = status;
      return flow;
    },
    softDelete: async () => flow,
    findById: async () => flow,
    findByName: async () => null,
    list: async () => [flow],
  };

  const nodeRepository: AutomationNodeRepository = {
    create: async (input) => {
      const record: AutomationNodeRecord = {
        id: `node-${nodes.length + 1}`,
        flow_id: input.flowId,
        type: input.type,
        config: input.config ?? {},
        position_x: input.positionX ?? 0,
        position_y: input.positionY ?? 0,
        created_at: new Date().toISOString(),
      };
      nodes.push(record);
      return record;
    },
    listByFlowId: async () => [...nodes],
    deleteByFlowId: async () => {
      nodes.length = 0;
    },
  };

  const edgeRepository: AutomationEdgeRepository = {
    create: async (input) => {
      const record: AutomationEdgeRecord = {
        id: `edge-${edges.length + 1}`,
        flow_id: input.flowId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
        condition: input.condition ?? {},
        created_at: new Date().toISOString(),
      };
      edges.push(record);
      return record;
    },
    listByFlowId: async () => [...edges],
    deleteByFlowId: async () => {
      edges.length = 0;
    },
  };

  const runRepository: AutomationRunRepository = {
    create: async (input) => {
      const record: AutomationRunRecord = {
        id: `run-${runs.length + 1}`,
        company_id: input.companyId,
        flow_id: input.flowId,
        status: input.status ?? "pending",
        trigger_source: input.triggerSource ?? "manual",
        started_at: new Date().toISOString(),
        finished_at: null,
        error_message: null,
        metadata: input.metadata ?? {},
        flow_version_id: input.flowVersionId ?? null,
        current_node_id: input.currentNodeId ?? null,
        session_id: input.sessionId ?? null,
        variables: input.variables ?? {},
      };
      runs.push(record);
      return record;
    },
    findById: async (id) => runs.find((item) => item.id === id) ?? null,
    findBySessionId: async (sessionId) => runs.find((item) => item.session_id === sessionId) ?? null,
    list: async (filter) =>
      runs.filter((item) => {
        if (filter.companyId && item.company_id !== filter.companyId) return false;
        if (filter.flowId && item.flow_id !== filter.flowId) return false;
        if (filter.status && item.status !== filter.status) return false;
        return true;
      }),
    updateState: async (input) => {
      const record = runs.find((item) => item.id === input.runId)!;
      if (input.status !== undefined) record.status = input.status;
      if (input.flowVersionId !== undefined) record.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.sessionId !== undefined) record.session_id = input.sessionId;
      if (input.variables !== undefined) record.variables = input.variables;
      if (input.errorMessage !== undefined) record.error_message = input.errorMessage;
      if (input.finishedAt !== undefined) record.finished_at = input.finishedAt;
      return { ...record };
    },
  };

  const sessionRepository: ConversationSessionRepository = {
    create: async (input) => {
      const record: ConversationSessionRecord = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        channel: input.channel,
        external_user_id: input.externalUserId ?? null,
        customer_id: input.customerId ?? null,
        flow_id: input.flowId ?? null,
        flow_version_id: input.flowVersionId ?? null,
        run_id: input.runId ?? null,
        current_node_id: input.currentNodeId ?? null,
        status: input.status ?? "active",
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        metadata: input.metadata ?? {},
        variables: input.variables ?? {},
      };
      sessions.push(record);
      return record;
    },
    findById: async (id) => sessions.find((item) => item.id === id) ?? null,
    findActiveSession: async (input) => {
      const candidates = sessions.filter(
        (item) =>
          item.company_id === input.companyId &&
          item.channel === input.channel &&
          item.external_user_id === input.externalUserId &&
          !["completed", "cancelled", "expired"].includes(item.status),
      );
      if (input.activitySince) {
        const cutoff = new Date(input.activitySince).getTime();
        const active = candidates.filter((item) => new Date(item.last_activity_at).getTime() >= cutoff);
        if (active.length === 0) return null;
        if (input.preferStatus) {
          return active.find((item) => item.status === input.preferStatus) ?? active[0] ?? null;
        }
        return active[0] ?? null;
      }
      if (input.preferStatus) {
        return candidates.find((item) => item.status === input.preferStatus) ?? candidates[0] ?? null;
      }
      return candidates[0] ?? null;
    },
    list: async (filter) =>
      sessions.filter((item) => {
        if (item.company_id !== filter.companyId) return false;
        if (filter.channel && item.channel !== filter.channel) return false;
        if (filter.externalUserId && item.external_user_id !== filter.externalUserId) return false;
        if (filter.flowId && item.flow_id !== filter.flowId) return false;
        if (filter.status && item.status !== filter.status) return false;
        if (filter.activeOnly && ["completed", "cancelled", "expired"].includes(item.status)) return false;
        return true;
      }),
    updateState: async (input) => {
      const record = sessions.find((item) => item.id === input.sessionId)!;
      if (input.status !== undefined) record.status = input.status;
      if (input.flowVersionId !== undefined) record.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.runId !== undefined) record.run_id = input.runId;
      if (input.variables !== undefined) record.variables = input.variables;
      record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
      return { ...record };
    },
  };

  const registry = new AutomationNodeRegistry().registerMany(
    createBuiltInAutomationNodeHandlers({ bookingService, lookupOptions }),
  );

  const engine = new AutomationEngine({
    flows: flowRepository,
    runs: runRepository,
    sessions: sessionRepository,
    versions: versionRepository,
    versionGraph,
    registry,
  });

  return {
    engine,
    flow,
    flowRepository,
    nodes,
    edges,
    runs,
    sessions,
    nodeRepository,
    edgeRepository,
    runRepository,
    sessionRepository,
    versionRepository,
    versionGraph,
    bookingRepository,
  };
}

async function publishGraph(env: ReturnType<typeof createLifecycleEnvironment>) {
  await seedPublishedVersionGraph({
    flowId: env.flow.id,
    companyId: env.flow.company_id,
    nodes: env.nodes,
    edges: env.edges,
    versions: env.versionRepository,
    versionGraph: env.versionGraph,
    flows: env.flowRepository,
  });
}

async function buildBookingFlow(env: ReturnType<typeof createLifecycleEnvironment>) {
  const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
  const welcome = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: { action: "send_message", message: "Welcome!" },
  });
  const buttons = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "send_buttons",
      message: "How can we help?",
      buttons: [
        { id: "book", label: "Book" },
        { id: "support", label: "Support" },
      ],
    },
  });
  const bookIf = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "condition",
    config: {
      ruleSet: {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "r1", field: "conversation.last_button_id", operator: "equals", value: "book" }],
        },
      },
    },
  });
  const phone = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: { action: "wait_for_input", inputKey: "phone", prompt: "Enter phone" },
  });
  const services = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      mode: "lookup",
      lookup: "services",
      title: "Services",
      body: "Choose a service",
      buttonLabel: "Services",
      outputVariable: "selected_service",
    },
  });
  const doctors = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      mode: "lookup",
      lookup: "resources",
      title: "Doctors",
      body: "Choose a doctor",
      buttonLabel: "Doctors",
      outputVariable: "selected_resource",
      filters: { service_id: "{{selected_service.id}}" },
    },
  });
  const dates = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      mode: "lookup",
      lookup: "available_dates",
      title: "Available Dates",
      body: "Choose a date",
      buttonLabel: "Dates",
      outputVariable: "selected_date",
      filters: { resource_id: "{{selected_resource.id}}" },
    },
  });
  const times = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      mode: "lookup",
      lookup: "available_times",
      title: "Available Times",
      body: "Choose a time",
      buttonLabel: "Times",
      outputVariable: "selected_time",
      filters: {
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date.value}}",
      },
    },
  });
  const booking = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: {
      action: "create_booking",
      service: staticBinding("Consultation"),
      doctor: variableBinding("selected_resource.id"),
      location: staticBinding("main"),
      appointmentDate: variableBinding("selected_date"),
      appointmentTime: variableBinding("selected_time"),
      customer: staticBinding("cust-1"),
    },
  });
  const confirmation = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: { action: "send_message", message: "Booking confirmed!" },
  });
  const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
  const supportEnd = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "support" } });

  const connect = (source: AutomationNodeRecord, target: AutomationNodeRecord, condition: Record<string, unknown> = {}) =>
    env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: source.id, targetNodeId: target.id, condition });

  await connect(trigger, welcome);
  await connect(welcome, buttons);
  await connect(buttons, bookIf);
  await connect(bookIf, phone, { branch: "yes" });
  await connect(bookIf, supportEnd, { branch: "no" });
  await connect(phone, services);
  await connect(services, doctors);
  await connect(doctors, dates);
  await connect(dates, times);
  await connect(times, booking);
  await connect(booking, confirmation);
  await connect(confirmation, end);

  await publishGraph(env);

  return { trigger, welcome, buttons, bookIf, phone, services, doctors, dates, times, booking, confirmation, end };
}

type StepTrace = {
  step: string;
  executionMode: string;
  runId: string;
  sessionId: string;
  currentNodeId: string | null;
  nodeAction: string | null;
  status: string;
  waitingFor: string | null;
};

function readNodeAction(nodeId: string | null, nodes: AutomationNodeRecord[]): string | null {
  if (!nodeId) return null;
  const node = nodes.find((item) => item.id === nodeId);
  return typeof node?.config.action === "string" ? node.config.action : node?.type ?? null;
}

function traceStep(
  step: string,
  executionMode: string,
  result: { run: AutomationRunRecord; session: ConversationSessionRecord; currentNodeId: string | null; variables: Record<string, unknown> },
  nodes: AutomationNodeRecord[],
): StepTrace {
  const entry: StepTrace = {
    step,
    executionMode,
    runId: result.run.id,
    sessionId: result.session.id,
    currentNodeId: result.currentNodeId,
    nodeAction: readNodeAction(result.currentNodeId, nodes),
    status: result.run.status,
    waitingFor: typeof result.variables.__waitingFor === "string" ? result.variables.__waitingFor : null,
  };
  console.info(JSON.stringify({ event: "booking_flow_step", ...entry }));
  return entry;
}

async function assertSingleActiveExecution(
  env: ReturnType<typeof createLifecycleEnvironment>,
  label: string,
): Promise<void> {
  const active = await listActiveExecutions(
    { sessions: env.sessionRepository, runs: env.runRepository },
    {
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
      boundFlowId: env.flow.id,
    },
  );
  assert.equal(
    countNonTerminalExecutions(active),
    0,
    `${label}: expected zero non-terminal executions, found ${active.length}`,
  );
  const nonTerminalRuns = env.runs.filter((run) => isNonTerminalRunStatus(run.status));
  assert.equal(nonTerminalRuns.length, 0, `${label}: expected zero non-terminal runs, found ${nonTerminalRuns.length}`);
}

describe("automation execution lifecycle", () => {
  it("completes Hello → Confirmation with one active run and displays dates/times after doctor/date selection", async () => {
    const env = createLifecycleEnvironment();
    const graph = await buildBookingFlow(env);
    const ctx = createContext();
    const traces: StepTrace[] = [];

    const hello = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
      initialVariables: { inbound_text: "Hello", customer: { id: "cust-1" }, __actorUserId: "user-1" },
    });
    traces.push(traceStep("Hello", "start", hello, env.nodes));
    assert.equal(hello.lifecycle, "waiting_input");
    assert.equal(hello.currentNodeId, graph.buttons.id);

    const book = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: buildResumeInput(hello.run, "Book", {
        kind: "interactive_reply",
        replyId: "book",
        title: "Book",
        interactionType: "button_reply",
      }),
    });
    traces.push(traceStep("Book", "resume", book, env.nodes));
    assert.equal(book.lifecycle, "waiting_input");
    assert.equal(book.currentNodeId, graph.phone.id);

    const phone = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: { phone: "+201023169075" },
    });
    traces.push(traceStep("Phone", "resume", phone, env.nodes));
    assert.equal(phone.lifecycle, "waiting_input");
    assert.equal(phone.currentNodeId, graph.services.id);
    assert.equal(phone.variables.__waitingFor, "interactive_selection");

    const service = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: buildResumeInput(phone.run, "Consultation", {
        kind: "interactive_reply",
        replyId: "svc1",
        title: "Consultation",
        interactionType: "list_reply",
      }),
    });
    traces.push(traceStep("Services", "resume", service, env.nodes));
    assert.equal(service.lifecycle, "waiting_input");
    assert.equal(service.currentNodeId, graph.doctors.id);

    const doctor = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: buildResumeInput(service.run, "ADAM", {
        kind: "interactive_reply",
        replyId: "adam",
        title: "ADAM",
        interactionType: "list_reply",
      }),
    });
    traces.push(traceStep("Doctor", "resume", doctor, env.nodes));
    assert.equal(doctor.lifecycle, "waiting_input");
    assert.equal(doctor.currentNodeId, graph.dates.id);
    assert.equal(doctor.variables.__waitingFor, "interactive_selection");
    const datesOutbound = doctor.variables.__outbound as { kind?: string; title?: string };
    assert.equal(datesOutbound?.kind, "list");
    assert.match(String(datesOutbound?.title ?? ""), /Available Dates|Dates/i);

    const date = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: buildResumeInput(doctor.run, "Jul 31, 2026", {
        kind: "interactive_reply",
        replyId: "2026-07-31",
        title: "Jul 31, 2026",
        interactionType: "list_reply",
      }),
    });
    traces.push(traceStep("Available Dates", "resume", date, env.nodes));
    assert.equal(date.lifecycle, "waiting_input");
    assert.equal(date.currentNodeId, graph.times.id);
    const timesOutbound = date.variables.__outbound as { kind?: string; title?: string };
    assert.equal(timesOutbound?.kind, "list");
    assert.match(String(timesOutbound?.title ?? ""), /Available Times|Times/i);

    const time = await env.engine.resume(ctx, {
      runId: hello.run.id,
      input: buildResumeInput(date.run, "10:00 AM", {
        kind: "interactive_reply",
        replyId: "10:00",
        title: "10:00 AM",
        interactionType: "list_reply",
      }),
    });
    traces.push(traceStep("Available Times", "resume", time, env.nodes));
    assert.equal(time.lifecycle, "completed", time.run.error_message ?? "create_booking failed");
    assert.ok(time.variables.booking_id);

    const confirmationQueue = time.variables.__outboundQueue as Array<{ kind: string; text?: string }>;
    assert.ok(confirmationQueue.some((entry) => entry.text === "Booking confirmed!"));
    assert.equal(env.bookingRepository.list().length, 1);

    assert.equal(new Set(traces.map((entry) => entry.runId)).size, 1, "duplicate runs were created during booking flow");
    await assertSingleActiveExecution(env, "after confirmation");
  });

  it("terminates lookup send_list failures instead of leaving running orphans", async () => {
    const env = createLifecycleEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const dates = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        mode: "lookup",
        lookup: "available_dates",
        title: "Dates",
        body: "Choose",
        buttonLabel: "Dates",
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: dates.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: dates.id, targetNodeId: end.id });
    await publishGraph(env);

    const engineWithoutLookup = new AutomationEngine({
      flows: env.flowRepository,
      runs: env.runRepository,
      sessions: env.sessionRepository,
      versions: env.versionRepository,
      versionGraph: env.versionGraph,
      registry: new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers()),
    });

    const result = await engineWithoutLookup.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
    });

    assert.equal(result.lifecycle, "failed");
    assert.equal(result.run.status, "failed");
    assert.notEqual(result.run.status, "running");
    assert.ok(result.run.finished_at);
    assert.match(String(result.run.error_message), /LookupOptionsPort/);
  });

  it("abandon_and_start terminalizes running orphans before creating a new run", async () => {
    const env = createLifecycleEnvironment();
    await buildBookingFlow(env);
    const graph = await buildBookingFlow(env);
    const ctx = createContext();

    const first = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
    });

    const orphanRun = env.runs.find((item) => item.id === first.run.id)!;
    orphanRun.status = "running";
    orphanRun.current_node_id = graph.dates.id;
    orphanRun.started_at = new Date(Date.now() - 60_000).toISOString();
    orphanRun.variables = { ...orphanRun.variables, __waitingFor: null };
    const orphanSession = env.sessions.find((item) => item.id === first.session.id)!;
    orphanSession.status = "running";
    orphanSession.current_node_id = graph.dates.id;

    const route = resolveInboundAutomationRoute({
      boundFlowId: env.flow.id,
      session: orphanSession,
      run: orphanRun,
    });
    assert.equal(route.mode, "abandon_and_start");

    await env.engine.abandonActiveRun(ctx, { runId: orphanRun.id, reason: route.reason });
    const restarted = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
      initialVariables: { inbound_text: "Hello again" },
    });

    assert.notEqual(restarted.run.id, orphanRun.id);
    assert.equal(orphanRun.status, "cancelled");
    assert.equal(restarted.lifecycle, "waiting_input");
    const activeRuns = env.runs.filter((run) => isNonTerminalRunStatus(run.status));
    assert.equal(activeRuns.length, 1);
    assert.equal(activeRuns[0]?.id, restarted.run.id);
  });

  it("cleans expired waiting sessions before routing", async () => {
    const env = createLifecycleEnvironment();
    await buildBookingFlow(env);
    const ctx = createContext();
    const staleStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    env.sessions.push({
      id: "stale-session",
      company_id: "company-1",
      channel: "whatsapp",
      external_user_id: EXTERNAL_USER,
      customer_id: null,
      flow_id: env.flow.id,
      flow_version_id: "version-1",
      run_id: "stale-run",
      current_node_id: "buttons",
      status: "waiting_input",
      started_at: staleStartedAt,
      last_activity_at: staleStartedAt,
      metadata: {},
      variables: { __waitingFor: "interactive_selection" },
    });
    env.runs.push({
      id: "stale-run",
      company_id: "company-1",
      flow_id: env.flow.id,
      status: "waiting_input",
      trigger_source: "inbound_message",
      started_at: staleStartedAt,
      finished_at: null,
      error_message: null,
      metadata: {},
      flow_version_id: "version-1",
      current_node_id: "buttons",
      session_id: "stale-session",
      variables: { __waitingFor: "interactive_selection" },
    });

    const cleaned = await cleanupStaleExecutionsForUser(
      env.engine,
      ctx,
      { sessions: env.sessionRepository, runs: env.runRepository },
      {
        companyId: "company-1",
        channel: "whatsapp",
        externalUserId: EXTERNAL_USER,
        boundFlowId: env.flow.id,
        now: new Date(),
      },
    );

    assert.deepEqual(cleaned, ["stale-run"]);
    assert.equal(env.runs.find((run) => run.id === "stale-run")?.status, "cancelled");
  });

  it("rejects interactive resume mismatches with diagnostics", () => {
    const listNode: AutomationNodeRecord = {
      id: "dates",
      flow_id: "flow-1",
      type: "action",
      config: { action: "send_list" },
      position_x: 0,
      position_y: 0,
      created_at: new Date().toISOString(),
    };
    const run: AutomationRunRecord = {
      id: "run-1",
      company_id: "company-1",
      flow_id: "flow-1",
      status: "waiting_input",
      trigger_source: "inbound_message",
      started_at: new Date().toISOString(),
      finished_at: null,
      error_message: null,
      metadata: {},
      flow_version_id: "version-1",
      current_node_id: "dates",
      session_id: "session-1",
      variables: {
        __waitingFor: "interactive_selection",
        __outbound: { kind: "list", title: "Dates" },
      },
    };

    assert.throws(
      () =>
        validateInteractiveResumeInput({
          run,
          currentNode: listNode,
          resumeInput: {
            kind: "interactive_reply",
            replyId: "book",
            title: "Book",
            interactionType: "button_reply",
          },
        }),
      InteractiveResumeValidationError,
    );
  });

  it("deduplicates duplicate start attempts to a single active run", async () => {
    const env = createLifecycleEnvironment();
    await buildBookingFlow(env);
    const ctx = createContext();

    const first = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
    });
    const activeBeforeSecond = await listActiveExecutions(
      { sessions: env.sessionRepository, runs: env.runRepository },
      { companyId: "company-1", channel: "whatsapp", externalUserId: EXTERNAL_USER, boundFlowId: env.flow.id },
    );
    assert.equal(activeBeforeSecond.length, 1, "expected one active execution before duplicate start");

    const second = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: EXTERNAL_USER,
    });

    assert.notEqual(second.run.id, first.run.id);
    const firstRunRecord = env.runs.find((run) => run.id === first.run.id);
    assert.equal(firstRunRecord?.status, "cancelled");
    assert.equal(second.lifecycle, "waiting_input");
    const activeRuns = env.runs.filter((run) => isNonTerminalRunStatus(run.status));
    assert.equal(activeRuns.length, 1);
    assert.equal(activeRuns[0]?.id, second.run.id);
  });
});
