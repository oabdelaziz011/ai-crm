import { createTaskNode, buildSequentialGraph } from "../task-graph/task-graph.js";
import type { AgentTaskGraph } from "../types.js";
import { CrmAgentPlanner } from "./crm-agent-planner.js";

type PlanContext = {
  workflowId: string;
  goal: string;
  pageContext?: Record<string, unknown>;
};

type PlanTemplate = {
  match: RegExp;
  build: (ctx: PlanContext) => AgentTaskGraph;
};

function id(prefix: string, index: number) {
  return `${prefix}_${index}`;
}

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    match: /create\s+(a\s+)?customer|new\s+customer/i,
    build: ({ workflowId, goal }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("task", 1),
          title: "Validate customer details",
          description: "Review goal and page context for required customer fields",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 500,
        }),
        createTaskNode({
          id: id("task", 2),
          title: "Create customer",
          description: "Execute create_customer tool",
          tool: "create_customer",
          toolInput: { source: "agent_planner" },
          dependencies: [],
          verificationRule: "customer_exists",
          estimatedDurationMs: 2000,
        }),
        createTaskNode({
          id: id("task", 3),
          title: "Generate report",
          description: "Summarize workflow outcome for the user",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 1000,
        }),
      ]),
  },
  {
    match: /book\s+(an?\s+)?appointment|schedule/i,
    build: ({ workflowId, goal }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("task", 1),
          title: "Lookup customer",
          description: "Find customer profile for booking",
          tool: "crm_lookup",
          dependencies: [],
          verificationRule: "lookup_has_results",
          estimatedDurationMs: 1500,
        }),
        createTaskNode({
          id: id("task", 2),
          title: "Create booking",
          description: "Execute create_booking tool",
          tool: "create_booking",
          dependencies: [],
          verificationRule: "booking_created",
          estimatedDurationMs: 2500,
        }),
        createTaskNode({
          id: id("task", 3),
          title: "Search availability",
          description: "Find open appointment slots",
          tool: "search_availability",
          dependencies: [],
          estimatedDurationMs: 2000,
        }),
      ]),
  },
  {
    match: /knowledge|document|search/i,
    build: ({ workflowId, goal }) => ({
      ...buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("task", 1),
          title: "Search knowledge base",
          description: "Run knowledge_search with user goal",
          tool: "knowledge_search",
          toolInput: { query: goal },
          dependencies: [],
          verificationRule: "knowledge_has_results",
          estimatedDurationMs: 3000,
        }),
        createTaskNode({
          id: id("task", 2),
          title: "Summarize findings",
          description: "Compile knowledge results into a report",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 1500,
        }),
      ]),
      retrievalPolicy: "required" as const,
    }),
  },
  {
    match: /invoice|unpaid|revenue/i,
    build: ({ workflowId, goal }) =>
      buildSequentialGraph(workflowId, goal, [
        createTaskNode({
          id: id("task", 1),
          title: "Analyze billing context",
          description: "Gather invoice context from CRM",
          tool: "crm_lookup",
          dependencies: [],
          estimatedDurationMs: 1500,
        }),
        createTaskNode({
          id: id("task", 2),
          title: "Generate summary",
          description: "Produce invoice/revenue summary via runtime",
          tool: null,
          dependencies: [],
          estimatedDurationMs: 2000,
        }),
      ]),
  },
];

/** Parallel example: lookup runs A then parallel B+C then D */
export function buildParallelExampleGraph(workflowId: string, goal: string): AgentTaskGraph {
  const nodes = [
    createTaskNode({
      id: "A",
      title: "Initialize",
      description: "Prepare agent context",
      tool: null,
      dependencies: [],
    }),
    createTaskNode({
      id: "B",
      title: "CRM lookup",
      description: "Parallel branch B",
      tool: "crm_lookup",
      dependencies: ["A"],
      parallelGroup: "parallel_1",
      verificationRule: "lookup_has_results",
    }),
    createTaskNode({
      id: "C",
      title: "Knowledge search",
      description: "Parallel branch C",
      tool: "knowledge_search",
      toolInput: { query: goal },
      dependencies: ["A"],
      parallelGroup: "parallel_1",
      verificationRule: "knowledge_has_results",
    }),
    createTaskNode({
      id: "D",
      title: "Merge and report",
      description: "Combine parallel outputs",
      tool: null,
      dependencies: ["B", "C"],
    }),
  ];

  return {
    workflowId,
    goal,
    nodes,
    edges: [
      { from: "A", to: "B", condition: "on_success" },
      { from: "A", to: "C", condition: "on_success" },
      { from: "B", to: "D", condition: "on_success" },
      { from: "C", to: "D", condition: "on_success" },
    ],
  };
}

export class AgentPlanner {
  private readonly crmPlanner = new CrmAgentPlanner();

  plan(input: PlanContext): AgentTaskGraph {
    const crmGraph = this.crmPlanner.tryPlan(input);
    if (crmGraph) return crmGraph;

    const normalized = input.goal.trim();
    for (const template of PLAN_TEMPLATES) {
      if (template.match.test(normalized)) {
        return template.build(input);
      }
    }

    if (/parallel/i.test(normalized)) {
      return buildParallelExampleGraph(input.workflowId, normalized);
    }

    return buildSequentialGraph(input.workflowId, normalized, [
      createTaskNode({
        id: id("task", 1),
        title: "Analyze goal",
        description: "Understand user intent and required actions",
        tool: null,
        dependencies: [],
        estimatedDurationMs: 1000,
      }),
      createTaskNode({
        id: id("task", 2),
        title: "Execute via runtime",
        description: "Process goal through enterprise AI runtime",
        tool: null,
        dependencies: [],
        estimatedDurationMs: 5000,
      }),
      createTaskNode({
        id: id("task", 3),
        title: "Final report",
        description: "Deliver outcome summary to user",
        tool: null,
        dependencies: [],
        estimatedDurationMs: 1000,
      }),
    ]);
  }
}
