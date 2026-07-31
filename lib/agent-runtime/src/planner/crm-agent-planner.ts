import { createTaskNode, buildSequentialGraph } from "../task-graph/task-graph.js";
import type { AgentTaskEdge, AgentTaskGraph, AgentTaskNode } from "../types.js";

type CrmPlanContext = {
  workflowId: string;
  goal: string;
  pageContext?: Record<string, unknown>;
};

type CrmPlanTemplate = {
  match: RegExp;
  build: (ctx: CrmPlanContext) => AgentTaskGraph;
};

function id(prefix: string, index: number) {
  return `${prefix}_${index}`;
}

function extractCustomerName(goal: string): string | null {
  const named = goal.match(/(?:named|called)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s.'-]{1,80})/i);
  return named?.[1]?.trim() ?? null;
}

function extractPhone(goal: string): string | null {
  const phone = goal.match(/(?:phone|mobile|tel)\s*[:\s]?\s*([+\d][\d\s\-().]{6,20})/i);
  return phone?.[1]?.trim() ?? null;
}

function extractInactiveDays(goal: string): number {
  const match = goal.match(/(\d+)\s*days?/i);
  return match ? Number.parseInt(match[1], 10) : 30;
}

function pageCustomerId(pageContext?: Record<string, unknown>): string | null {
  const entity = pageContext?.currentEntity as { type?: string; id?: string } | undefined;
  if (entity?.type === "customer" && entity.id) return entity.id;
  const selected = pageContext?.selectedCustomer as { id?: string } | undefined;
  return selected?.id ?? null;
}

function pageSelectedCustomerIds(pageContext?: Record<string, unknown>): string[] {
  const rows = pageContext?.selectedRows as Array<{ id?: string; type?: string }> | undefined;
  if (!rows?.length) return [];
  return rows.filter((r) => r.id).map((r) => String(r.id));
}

function reportNode(taskId: string, title = "Generate CRM report"): AgentTaskNode {
  return createTaskNode({
    id: taskId,
    title,
    description: "Summarize workflow outcome with completed tasks, warnings, and follow-up actions",
    tool: null,
    dependencies: [],
    estimatedDurationMs: 1200,
  });
}

function buildParallelCrmGraph(
  workflowId: string,
  goal: string,
  afterNode: AgentTaskNode,
  parallelTasks: AgentTaskNode[],
  finalNode: AgentTaskNode,
): AgentTaskGraph {
  for (const parallel of parallelTasks) {
    parallel.dependencies = [afterNode.id];
    parallel.parallelGroup = "crm_parallel";
  }
  finalNode.dependencies = parallelTasks.map((task) => task.id);

  const nodes = [afterNode, ...parallelTasks, finalNode];
  const edges: AgentTaskEdge[] = [];

  for (const parallel of parallelTasks) {
    edges.push({ from: afterNode.id, to: parallel.id, condition: "on_success" });
    edges.push({ from: parallel.id, to: finalNode.id, condition: "on_success" });
  }

  return { workflowId, goal, agentType: "crm", nodes, edges };
}

const CRM_PLAN_TEMPLATES: CrmPlanTemplate[] = [
  {
    match: /create\s+(a\s+)?customer|new\s+customer|add\s+customer/i,
    build: ({ workflowId, goal, pageContext }) => {
      const name = extractCustomerName(goal);
      const phone = extractPhone(goal);
      return buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Validate customer details",
          description: "Review goal and page context for required customer fields",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 500,
        }),
        createTaskNode({
          id: id("crm", 2),
          title: "Create customer",
          description: "Execute create_customer tool",
          tool: "create_customer",
          toolInput: {
            name: name ?? undefined,
            phone: phone ?? undefined,
            customerId: pageCustomerId(pageContext) ?? undefined,
            source: "crm_agent",
          },
          dependencies: [],
          verificationRule: "customer_exists",
          estimatedDurationMs: 2000,
        }),
        reportNode(id("crm", 3)),
      ]);
    },
  },
  {
    match: /duplicate|dedup|merge.*customer/i,
    build: ({ workflowId, goal, pageContext }) => {
      const selectedIds = pageSelectedCustomerIds(pageContext);
      const isMerge = /merge/i.test(goal);
      const nodes: AgentTaskNode[] = [
        createTaskNode({
          id: id("crm", 1),
          title: "Find duplicate customers",
          description: "Scan CRM for matching phone or email groups",
          tool: "find_duplicate_customers",
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 2500,
        }),
      ];

      if (isMerge) {
        nodes.push(
        createTaskNode({
          id: id("crm", 2),
          title: "Merge duplicate customers",
          description: "Merge duplicates into primary record (requires confirmation)",
          tool: "merge_customers",
          toolInput: {
            primaryCustomerId: selectedIds[0] ?? undefined,
            duplicateCustomerIds: selectedIds.slice(1),
          },
            dependencies: [],
            verificationRule: "merge_completed",
            estimatedDurationMs: 3000,
          }),
        );
        nodes.push(reportNode(id("crm", 3), "Generate merge report"));
      } else {
        nodes.push(reportNode(id("crm", 2), "Generate duplicate detection report"));
      }

      const graph = buildSequentialGraph(workflowId, goal, nodes);
      return { ...graph, agentType: "crm" };
    },
  },
  {
    match: /import\s+(customer|list|csv|contacts)/i,
    build: ({ workflowId, goal, pageContext }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Parse import list",
          description: "Prepare customer rows from goal or uploaded context",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 800,
        }),
        createTaskNode({
          id: id("crm", 2),
          title: "Import customers",
          description: "Bulk create customers (requires confirmation)",
          tool: "import_customers",
          toolInput: { rows: [], goal },
          dependencies: [],
          verificationRule: "import_completed",
          estimatedDurationMs: 4000,
        }),
        reportNode(id("crm", 3)),
      ]),
  },
  {
    match: /overdue\s+invoice|invoice.*overdue|unpaid\s+invoice/i,
    build: ({ workflowId, goal }) => {
      const init = createTaskNode({
        id: id("crm", 1),
        title: "Load CRM context",
        description: "Gather customer scope from page context",
        tool: "search_customer",
        toolInput: { query: "" },
        dependencies: [],
        verificationRule: "lookup_has_results",
        estimatedDurationMs: 1500,
      });
      const invoiceTask = createTaskNode({
        id: id("crm", 2),
        title: "Search overdue invoices",
        description: "Find invoices past due date",
        tool: "invoice_search",
        toolInput: { overdueOnly: true },
        dependencies: [],
        verificationRule: "lookup_has_results",
        estimatedDurationMs: 2000,
      });
      const final = reportNode(id("crm", 3), "Generate overdue invoice report");
      return buildParallelCrmGraph(workflowId, goal, init, [invoiceTask], final);
    },
  },
  {
    match: /inactive|not\s+contacted|no\s+contact|haven.?t\s+contacted/i,
    build: ({ workflowId, goal }) => {
      const days = extractInactiveDays(goal);
      return buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Search CRM customers",
          description: "Load customer base for inactivity analysis",
          tool: "search_customer",
          toolInput: { query: "" },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 1500,
        }),
        createTaskNode({
          id: id("crm", 2),
          title: "Search recent bookings",
          description: "Find customers with recent booking activity",
          tool: "booking_search",
          toolInput: { daysBack: days },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 2000,
        }),
        createTaskNode({
          id: id("crm", 3),
          title: "Filter inactive customers",
          description: "Identify customers without contact in the analysis window",
          tool: "search_customer",
          toolInput: { inactiveDays: days },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 2000,
        }),
        reportNode(id("crm", 4), "Generate inactive customer report"),
      ]);
    },
  },
  {
    match: /summarize.*(customer|activity)|customer.*activity|activity\s+summary/i,
    build: ({ workflowId, goal, pageContext }) => {
      const customerId = pageCustomerId(pageContext);
      return buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Load customer profile",
          description: "Search CRM for target customer",
          tool: "search_customer",
          toolInput: { query: customerId ?? "" },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 1500,
        }),
        createTaskNode({
          id: id("crm", 2),
          title: "Load bookings",
          description: "Fetch recent booking history",
          tool: "booking_search",
          toolInput: { customerId: customerId ?? undefined, daysBack: 90 },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 2000,
        }),
        createTaskNode({
          id: id("crm", 3),
          title: "Load invoices",
          description: "Fetch customer invoice history",
          tool: "invoice_search",
          toolInput: {},
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 2000,
        }),
        reportNode(id("crm", 4), "Summarize customer activity"),
      ]);
    },
  },
  {
    match: /knowledge|onboarding|policy|faq|procedure|manual|documentation/i,
    build: ({ workflowId, goal }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Search knowledge base",
          description: "Hybrid RAG retrieval for policies, FAQs, and procedures",
          tool: "knowledge_search",
          toolInput: { query: goal },
          dependencies: [],
          verificationRule: "knowledge_has_results",
          estimatedDurationMs: 3500,
        }),
        reportNode(id("crm", 2), "Summarize knowledge findings"),
      ]),
  },
  {
    match: /search\s+customer|find\s+customer|lookup\s+customer/i,
    build: ({ workflowId, goal, pageContext }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("crm", 1),
          title: "Search customers",
          description: "Query CRM by name, email, or phone",
          tool: "search_customer",
          toolInput: { query: goal.replace(/search\s+customer/i, "").trim() || pageCustomerId(pageContext) || "" },
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 1500,
        }),
        reportNode(id("crm", 2)),
      ]),
  },
];

export class CrmAgentPlanner {
  tryPlan(input: CrmPlanContext): AgentTaskGraph | null {
    const normalized = input.goal.trim();
    for (const template of CRM_PLAN_TEMPLATES) {
      if (template.match.test(normalized)) {
        const graph = template.build(input);
        return { ...graph, agentType: "crm" };
      }
    }
    return null;
  }
}

export function isCrmAgentGoal(goal: string): boolean {
  return CRM_PLAN_TEMPLATES.some((template) => template.match.test(goal.trim()));
}

export { CRM_PLAN_TEMPLATES };
