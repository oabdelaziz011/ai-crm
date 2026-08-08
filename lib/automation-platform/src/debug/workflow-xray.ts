/**
 * Server-only Workflow Performance X-Ray (ALS).
 * Do not import from Vite/browser bundles — use workflow-xray-bridge.ts.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

export type WorkflowXRayQuery = {
  target: string;
  operation: string;
  durationMs: number;
  rowCount: number | null;
  nodeId: string | null;
  startedAt: number;
  endedAt: number;
};

export type WorkflowXRayNode = {
  id: string;
  name: string;
  type: string;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  queries: WorkflowXRayQuery[];
};

type OpenNode = {
  token: string;
  id: string;
  name: string;
  type: string;
  startedAt: number;
  queries: WorkflowXRayQuery[];
};

const GLOBAL_KEY = "__WORKFLOW_XRAY__";
const GLOBAL_GETTER_KEY = "__WORKFLOW_GET_XRAY__";
const ACTIVE_NODE_GETTER_KEY = "__WORKFLOW_GET_XRAY_ACTIVE_NODE__";

const xrayAls = new AsyncLocalStorage<WorkflowXRay>();

export class WorkflowXRay {
  readonly requestId: string;
  private startedAt = 0;
  private endedAt = 0;
  private meta: Record<string, unknown> = {};
  private readonly nodes: WorkflowXRayNode[] = [];
  private readonly openNodes = new Map<string, OpenNode>();
  private readonly orphanQueries: WorkflowXRayQuery[] = [];
  private readonly serviceResolutions = new Map<string, number>();
  private readonly dependencyConstructions = new Map<string, number>();
  private readonly sequentialChains: Array<{ label: string; tasks: string[] }> = [];
  private readonly miscOps: Array<{ name: string; durationMs: number }> = [];
  private reportPrinted = false;
  private tokenSeq = 0;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  beginWorkflow(meta?: Record<string, unknown>): void {
    this.startedAt = performance.now();
    this.meta = { ...(meta ?? {}) };
  }

  endWorkflow(): void {
    this.endedAt = performance.now();
  }

  beginNode(input: { id: string; name: string; type: string }): string {
    const token = `node-${++this.tokenSeq}-${input.id}`;
    this.openNodes.set(token, {
      token,
      id: input.id,
      name: input.name,
      type: input.type,
      startedAt: performance.now(),
      queries: [],
    });
    return token;
  }

  endNode(token: string): void {
    const open = this.openNodes.get(token);
    if (!open) return;
    this.openNodes.delete(token);
    const endedAt = performance.now();
    this.nodes.push({
      id: open.id,
      name: open.name,
      type: open.type,
      durationMs: Math.max(0, endedAt - open.startedAt),
      startedAt: open.startedAt,
      endedAt,
      queries: open.queries,
    });
  }

  activeNodeId(): string | null {
    const open = [...this.openNodes.values()].at(-1);
    return open?.id ?? null;
  }

  recordQuery(input: {
    target: string;
    operation: string;
    durationMs: number;
    rowCount: number | null;
    nodeId?: string | null;
  }): void {
    const endedAt = performance.now();
    const startedAt = endedAt - Math.max(0, input.durationMs);
    const nodeId = input.nodeId ?? this.activeNodeId();
    const query: WorkflowXRayQuery = {
      target: input.target,
      operation: input.operation,
      durationMs: Math.max(0, input.durationMs),
      rowCount: input.rowCount,
      nodeId,
      startedAt,
      endedAt,
    };

    const open = [...this.openNodes.values()].reverse().find((n) => n.id === nodeId);
    if (open) {
      open.queries.push(query);
      return;
    }
    this.orphanQueries.push(query);
  }

  recordServiceResolution(name: string): void {
    this.serviceResolutions.set(name, (this.serviceResolutions.get(name) ?? 0) + 1);
  }

  recordDependencyConstruction(name: string): void {
    this.dependencyConstructions.set(name, (this.dependencyConstructions.get(name) ?? 0) + 1);
  }

  recordSequentialChain(label: string, tasks: string[]): void {
    if (tasks.length < 2) return;
    this.sequentialChains.push({ label, tasks });
  }

  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      this.miscOps.push({ name, durationMs: Math.max(0, performance.now() - started) });
    }
  }

  private allQueries(): WorkflowXRayQuery[] {
    return [...this.nodes.flatMap((n) => n.queries), ...this.orphanQueries];
  }

  private detectSequentialChainsFromQueries(): Array<{ label: string; tasks: string[] }> {
    const chains: Array<{ label: string; tasks: string[] }> = [...this.sequentialChains];

    for (const node of this.nodes) {
      if (node.queries.length < 2) continue;
      const sorted = [...node.queries].sort((a, b) => a.startedAt - b.startedAt);
      let sequential = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.startedAt < sorted[i - 1]!.endedAt - 0.5) {
          sequential = false;
          break;
        }
      }
      if (sequential) {
        chains.push({
          label: `Node ${node.name || node.type} (${node.id}) queries`,
          tasks: sorted.map(
            (q) => `${q.operation} ${q.target} (${q.durationMs.toFixed(1)} ms)`,
          ),
        });
      }
    }

    // Engine node loop is always sequential by design.
    if (this.nodes.length >= 2) {
      chains.push({
        label: "Workflow node loop (engine.executeFromNode)",
        tasks: this.nodes.map(
          (n) => `${n.type}:${n.name || n.id} (${n.durationMs.toFixed(1)} ms)`,
        ),
      });
    }

    return chains;
  }

  private duplicateQueryStats(): Array<{
    key: string;
    count: number;
    totalMs: number;
    wastedMs: number;
  }> {
    const map = new Map<string, { count: number; totalMs: number }>();
    for (const q of this.allQueries()) {
      const key = `${q.operation}|${q.target}`;
      const prev = map.get(key) ?? { count: 0, totalMs: 0 };
      prev.count += 1;
      prev.totalMs += q.durationMs;
      map.set(key, prev);
    }
    return [...map.entries()]
      .map(([key, st]) => ({
        key,
        count: st.count,
        totalMs: st.totalMs,
        wastedMs: st.count > 1 ? st.totalMs - st.totalMs / st.count : 0,
      }))
      .filter((row) => row.count > 1)
      .sort((a, b) => b.wastedMs - a.wastedMs);
  }

  private top10(): Array<{ kind: string; name: string; durationMs: number }> {
    const ops: Array<{ kind: string; name: string; durationMs: number }> = [];
    for (const n of this.nodes) {
      ops.push({ kind: "Node", name: `${n.type} ${n.name || n.id}`, durationMs: n.durationMs });
    }
    for (const q of this.allQueries()) {
      const kind = q.operation === "rpc" ? "RPC" : "Query";
      ops.push({
        kind,
        name: `${q.operation} ${q.target}`,
        durationMs: q.durationMs,
      });
    }
    for (const m of this.miscOps) {
      const kind = /http|meta|openai|fetch/i.test(m.name) ? "HTTP" : "Op";
      ops.push({ kind, name: m.name, durationMs: m.durationMs });
    }
    return ops.sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
  }

  private flameTree(): string[] {
    const lines: string[] = ["Workflow"];
    const total = Math.max(0, (this.endedAt || performance.now()) - this.startedAt);
    lines[0] = `Workflow (${total.toFixed(1)} ms)`;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]!;
      const isLast = i === this.nodes.length - 1 && this.orphanQueries.length === 0;
      const branch = isLast ? "└──" : "├──";
      const childPrefix = isLast ? "    " : "│   ";
      lines.push(
        `${branch} Node ${node.name || node.id} [${node.type}] (${node.durationMs.toFixed(1)} ms)`,
      );
      for (let j = 0; j < node.queries.length; j++) {
        const q = node.queries[j]!;
        const qLast = j === node.queries.length - 1;
        const qBranch = qLast ? "└──" : "├──";
        lines.push(
          `${childPrefix}${qBranch} ${q.operation} ${q.target} (${q.durationMs.toFixed(1)} ms, rows=${q.rowCount ?? "?"})`,
        );
      }
    }

    if (this.orphanQueries.length > 0) {
      lines.push(`└── (outside node) (${this.orphanQueries.length} queries)`);
      for (let j = 0; j < this.orphanQueries.length; j++) {
        const q = this.orphanQueries[j]!;
        const qLast = j === this.orphanQueries.length - 1;
        lines.push(
          `    ${qLast ? "└──" : "├──"} ${q.operation} ${q.target} (${q.durationMs.toFixed(1)} ms, rows=${q.rowCount ?? "?"})`,
        );
      }
    }

    return lines;
  }

  private recommendations(): string[] {
    const recs: string[] = [];
    const dupes = this.duplicateQueryStats();
    const chains = this.detectSequentialChainsFromQueries();
    const constructions = [...this.dependencyConstructions.entries()].filter(([, n]) => n > 1);
    const services = [...this.serviceResolutions.entries()].filter(([, n]) => n > 1);
    const slowNodes = [...this.nodes].sort((a, b) => b.durationMs - a.durationMs);

    if (dupes[0]) {
      recs.push(
        [
          `Cache duplicate query "${dupes[0].key}" within a single workflow resume (seen ${dupes[0].count}x).`,
          `expected gain: ~${dupes[0].wastedMs.toFixed(0)} ms`,
          `implementation risk: low`,
          `business logic risk: none if keyed by identical args and request-scoped`,
        ].join(" | "),
      );
    }

    const nodeLoop = chains.find((c) => c.label.includes("node loop"));
    if (nodeLoop && slowNodes.length >= 2) {
      recs.push(
        [
          "Node loop is inherently sequential (outcome of node N may feed N+1). Do not parallelize across nodes.",
          `expected gain: 0 ms (unsafe)`,
          `implementation risk: high`,
          `business logic risk: high — would change control flow`,
        ].join(" | "),
      );
    }

    const queryChain = chains.find((c) => c.label.includes("queries"));
    if (queryChain && queryChain.tasks.length >= 2) {
      recs.push(
        [
          `Within "${queryChain.label}", evaluate independent reads for Promise.all.`,
          `expected gain: up to ~${Math.max(
            0,
            queryChain.tasks
              .map((t) => Number(/([\d.]+) ms/.exec(t)?.[1] ?? 0))
              .sort((a, b) => b - a)
              .slice(1)
              .reduce((s, n) => s + n, 0),
          ).toFixed(0)} ms (sum of non-critical-path reads)`,
          `implementation risk: medium`,
          `business logic risk: low if reads share no write dependency`,
        ].join(" | "),
      );
    }

    for (const [name, count] of constructions) {
      recs.push(
        [
          `Reuse ${name} across lookup/booking calls in one request (constructed ${count}x).`,
          `expected gain: 5–50 ms CPU + avoided cold setup (larger if it re-queries)`,
          `implementation risk: low`,
          `business logic risk: none if instance is request- or process-scoped and stateless`,
        ].join(" | "),
      );
    }

    for (const [name, count] of services) {
      recs.push(
        [
          `Avoid re-resolving ${name} (${count}x) — inject once via actionDeps.`,
          `expected gain: <20 ms unless resolution hits DB`,
          `implementation risk: low`,
          `business logic risk: none`,
        ].join(" | "),
      );
    }

    if (slowNodes[0] && slowNodes[0].durationMs > 500) {
      recs.push(
        [
          `Focus first on node ${slowNodes[0].type}/${slowNodes[0].id} (${slowNodes[0].durationMs.toFixed(0)} ms) — largest slice of the ~workflow budget.`,
          `expected gain: majority of remaining server-side workflow time after Meta`,
          `implementation risk: depends on node internals`,
          `business logic risk: none if only caching/parallelizing independent reads`,
        ].join(" | "),
      );
    }

    if (recs.length === 0) {
      recs.push(
        [
          "No clear behavior-preserving wins from this sample — capture another resume with lookup-heavy nodes.",
          `expected gain: n/a`,
          `implementation risk: n/a`,
          `business logic risk: n/a`,
        ].join(" | "),
      );
    }

    return recs;
  }

  /** Measured Sprint 2.3 validation snapshot (no estimates). */
  getValidationSnapshot(): {
    totalWorkflowMs: number;
    totalDbQueryMs: number;
    serviceConstructions: number;
    bookingFactoryConstructions: number;
    createSchedulingServicesCalls: number;
    createSchedulingServicesConstructions: number;
    duplicatedQueryGroups: number;
    duplicatedQueryExtraExecutions: number;
  } {
    if (!this.endedAt && this.startedAt) this.endWorkflow();
    for (const token of [...this.openNodes.keys()]) {
      this.endNode(token);
    }
    const queries = this.allQueries();
    const dupes = this.duplicateQueryStats();
    return {
      totalWorkflowMs: Math.max(0, (this.endedAt || performance.now()) - this.startedAt),
      totalDbQueryMs: queries.reduce((sum, q) => sum + q.durationMs, 0),
      serviceConstructions: [...this.dependencyConstructions.values()].reduce((a, b) => a + b, 0),
      bookingFactoryConstructions: this.dependencyConstructions.get("BookingFactory.create") ?? 0,
      createSchedulingServicesCalls: this.serviceResolutions.get("createSchedulingServices.call") ?? 0,
      createSchedulingServicesConstructions:
        this.dependencyConstructions.get("createSchedulingServices") ?? 0,
      duplicatedQueryGroups: dupes.length,
      duplicatedQueryExtraExecutions: dupes.reduce((sum, d) => sum + Math.max(0, d.count - 1), 0),
    };
  }

  printSprint23Validation(input?: {
    label?: string;
    cacheHits?: number;
    cacheMisses?: number;
  }): void {
    const snap = this.getValidationSnapshot();
    const lines = [
      "",
      "========== [SPRINT 2.3 VALIDATION] ==========",
      `label: ${input?.label ?? "measured"}`,
      `requestId: ${this.requestId}`,
      `Total workflow time: ${snap.totalWorkflowMs.toFixed(1)} ms`,
      `Total DB query time: ${snap.totalDbQueryMs.toFixed(1)} ms`,
      `Service constructions: ${snap.serviceConstructions}`,
      `BookingFactory constructions: ${snap.bookingFactoryConstructions}`,
      `createSchedulingServices calls: ${snap.createSchedulingServicesCalls}`,
      `createSchedulingServices constructions: ${snap.createSchedulingServicesConstructions}`,
      `Duplicated query groups: ${snap.duplicatedQueryGroups}`,
      `Duplicated query extra executions: ${snap.duplicatedQueryExtraExecutions}`,
      `Request Cache Hits: ${input?.cacheHits ?? "n/a"}`,
      `Request Cache Misses: ${input?.cacheMisses ?? "n/a"}`,
      "===========================================",
      "",
    ];
    console.log(lines.join("\n"));
  }

  printReport(): void {
    if (this.reportPrinted) return;
    this.reportPrinted = true;
    if (!this.endedAt) this.endWorkflow();

    // Close any leaked open nodes.
    for (const token of [...this.openNodes.keys()]) {
      this.endNode(token);
    }

    const totalMs = Math.max(0, this.endedAt - this.startedAt);
    const chains = this.detectSequentialChainsFromQueries();
    const dupes = this.duplicateQueryStats();
    const top = this.top10();

    const lines: string[] = [
      "",
      "========== [WORKFLOW X-RAY] ==========",
      `requestId: ${this.requestId}`,
      ...Object.entries(this.meta).map(([k, v]) => `${k}: ${String(v)}`),
      "",
      "1) Total workflow execution time",
      `${totalMs.toFixed(1)} ms`,
      "",
      "2) Nodes",
      "",
    ];

    for (const node of this.nodes) {
      lines.push(`node id: ${node.id}`);
      lines.push(`node name: ${node.name || "(unnamed)"}`);
      lines.push(`node type: ${node.type}`);
      lines.push(`execution time: ${node.durationMs.toFixed(1)} ms`);
      lines.push("");
    }

    lines.push("3) Database queries");
    lines.push("");
    for (const q of this.allQueries()) {
      lines.push(`table / rpc: ${q.target}`);
      lines.push(`operation: ${q.operation}`);
      lines.push(`duration: ${q.durationMs.toFixed(1)} ms`);
      lines.push(`rows returned: ${q.rowCount ?? "unknown"}`);
      lines.push(`node id: ${q.nodeId ?? "(none)"}`);
      lines.push("");
    }

    lines.push("4) Duplicate queries");
    lines.push("");
    if (dupes.length === 0) {
      lines.push("(none detected)");
      lines.push("");
    } else {
      for (const d of dupes) {
        lines.push(`repeated query: ${d.key}`);
        lines.push(`count: ${d.count}`);
        lines.push(`total time wasted: ${d.wastedMs.toFixed(1)} ms`);
        lines.push("");
      }
    }

    lines.push("5) Sequential awaits");
    lines.push("");
    for (const chain of chains) {
      lines.push(chain.label);
      for (let i = 0; i < chain.tasks.length; i++) {
        lines.push(chain.tasks[i]!);
        if (i < chain.tasks.length - 1) lines.push("↓");
      }
      const parallelSafe = chain.label.includes("queries") && !chain.label.includes("node loop");
      lines.push(
        parallelSafe
          ? "Parallelizable?: MAYBE — only if later reads do not depend on earlier writes/results."
          : "Parallelizable?: NO — engine node order / control-flow dependency.",
      );
      lines.push("");
    }

    lines.push("6) Repeated service resolution");
    lines.push("");
    if (this.serviceResolutions.size === 0) {
      lines.push("(none recorded)");
      lines.push("");
    } else {
      for (const [name, count] of [...this.serviceResolutions.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`${name}: ${count}`);
      }
      lines.push("");
    }

    lines.push("7) Repeated dependency construction");
    lines.push("");
    if (this.dependencyConstructions.size === 0) {
      lines.push("(none recorded)");
      lines.push("");
    } else {
      for (const [name, count] of [...this.dependencyConstructions.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        lines.push(`${name}: ${count}`);
      }
      lines.push("");
    }

    lines.push("8) Top 10 slowest operations");
    lines.push("");
    for (const [i, op] of top.entries()) {
      lines.push(`${i + 1}. [${op.kind}] ${op.name} — ${op.durationMs.toFixed(1)} ms`);
    }
    lines.push("");

    lines.push("9) Flame-style report");
    lines.push("");
    lines.push(...this.flameTree());
    lines.push("");

    lines.push("10) Recommendations (behavior-preserving only)");
    lines.push("");
    for (const rec of this.recommendations()) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
    lines.push("======================================");
    lines.push("");

    console.log(lines.join("\n"));
  }
}

type GlobalXRayHost = typeof globalThis & {
  [GLOBAL_KEY]?: WorkflowXRay | null;
  [GLOBAL_GETTER_KEY]?: () => WorkflowXRay | null;
  [ACTIVE_NODE_GETTER_KEY]?: () => string | null;
};

export function getWorkflowXRay(): WorkflowXRay | null {
  return xrayAls.getStore() ?? (globalThis as GlobalXRayHost)[GLOBAL_KEY] ?? null;
}

export function setWorkflowXRay(xray: WorkflowXRay | null): void {
  const host = globalThis as GlobalXRayHost;
  host[GLOBAL_KEY] = xray;
  host[GLOBAL_GETTER_KEY] = getWorkflowXRay;
  host[ACTIVE_NODE_GETTER_KEY] = () => getWorkflowXRay()?.activeNodeId() ?? null;
}

export async function runWithWorkflowXRay<T>(
  xray: WorkflowXRay,
  fn: () => Promise<T>,
): Promise<T> {
  setWorkflowXRay(xray);
  return xrayAls.run(xray, async () => {
    try {
      return await fn();
    } finally {
      // Caller prints + clears.
    }
  });
}
