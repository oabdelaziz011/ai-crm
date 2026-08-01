import type { WorkflowOptimizationInput } from "../types/optimization-types";
import type { OptimizationRecommendation } from "../types/optimization-types";

const AI_NODE_TYPES = new Set(["ai_decision", "ai_extract", "ai_knowledge_search", "ai_summarizer"]);

function readNodeLabel(document: WorkflowOptimizationInput["document"], nodeId: string): string {
  return document.nodes.find((node) => node.id === nodeId)?.config?.label?.toString() ?? nodeId;
}

export function analyzePerformanceRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const { analytics } = input;

  for (const entry of analytics.heatmap.filter((item) => item.isBottleneck)) {
    recommendations.push({
      id: `perf-bottleneck-${entry.nodeId}`,
      category: "performance",
      severity: "warning",
      title: "Potential bottleneck detected",
      description: `"${entry.label}" appears frequently in execution paths and may slow workflow completion.`,
      impact: Math.min(90, 40 + entry.executionCount * 5),
      confidence: 75,
      estimatedBenefit: "Reduce average execution time by simplifying or deferring this step.",
      affectedNodeIds: [entry.nodeId],
    });
  }

  if (analytics.report.bottlenecks.length > 0) {
    for (const label of analytics.report.bottlenecks) {
      const node = input.document.nodes.find((item) => readNodeLabel(input.document, item.id) === label);
      if (!node || recommendations.some((item) => item.affectedNodeIds.includes(node.id))) continue;
      recommendations.push({
        id: `perf-report-bottleneck-${node.id}`,
        category: "performance",
        severity: "warning",
        title: "Reported bottleneck",
        description: `"${label}" was flagged as a bottleneck in the latest test report.`,
        impact: 65,
        confidence: 80,
        estimatedBenefit: "Review step logic or reduce redundant executions.",
        affectedNodeIds: [node.id],
      });
    }
  }

  const waitNodes = input.document.nodes.filter((node) => node.type === "wait_for_reply" || node.type === "delay");
  if (waitNodes.length > 2 && analytics.performance.averageRuntimeMs != null && analytics.performance.averageRuntimeMs > 500) {
    recommendations.push({
      id: "perf-unnecessary-waits",
      category: "performance",
      severity: "info",
      title: "Multiple wait steps detected",
      description: "Several wait or delay steps may extend total runtime unnecessarily.",
      impact: 45,
      confidence: 60,
      estimatedBenefit: "Consolidate waits to reduce idle time in customer journeys.",
      affectedNodeIds: waitNodes.map((node) => node.id),
    });
  }

  if (analytics.performance.slowestExecutionMs != null && analytics.performance.averageRuntimeMs != null) {
    const ratio = analytics.performance.slowestExecutionMs / Math.max(analytics.performance.averageRuntimeMs, 1);
    if (ratio > 2.5) {
      recommendations.push({
        id: "perf-slow-execution-spread",
        category: "performance",
        severity: "warning",
        title: "High execution time variance",
        description: "Slowest runs are significantly slower than average, indicating inconsistent performance.",
        impact: 55,
        confidence: 70,
        estimatedBenefit: "Investigate outlier paths to stabilize runtime.",
        affectedNodeIds: [],
      });
    }
  }

  return recommendations;
}

export function analyzeStructureRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  for (const issue of input.validationIssues) {
    if (issue.kind === "unreachable" || issue.kind === "dead-end" || issue.kind === "branch-dead-end") {
      recommendations.push({
        id: `structure-${issue.id}`,
        category: "structure",
        severity: issue.severity === "error" ? "critical" : "warning",
        title: issue.kind === "unreachable" ? "Unreachable node" : "Dead-end branch",
        description: issue.message,
        impact: issue.severity === "error" ? 85 : 60,
        confidence: 95,
        estimatedBenefit: "Remove or reconnect unused paths to simplify maintenance.",
        affectedNodeIds: issue.affectedNodeIds ?? (issue.nodeId ? [issue.nodeId] : []),
      });
    }
  }

  const conditionNodes = input.document.nodes.filter((node) => node.type === "if_else" || node.type === "switch");
  for (const node of conditionNodes) {
    const outgoing = input.document.edges.filter((edge) => edge.source === node.id);
    if (outgoing.length === 1) {
      recommendations.push({
        id: `structure-unnecessary-condition-${node.id}`,
        category: "structure",
        severity: "info",
        title: "Condition with single branch",
        description: `"${readNodeLabel(input.document, node.id)}" has only one outgoing path; the condition may be unnecessary.`,
        impact: 35,
        confidence: 70,
        estimatedBenefit: "Simplify branching logic for better readability.",
        affectedNodeIds: [node.id],
      });
    }
  }

  const branchLabels = new Map<string, string[]>();
  for (const edge of input.document.edges) {
    if (!edge.branchLabel) continue;
    const key = edge.branchLabel.toLowerCase();
    const nodes = branchLabels.get(key) ?? [];
    nodes.push(edge.source);
    branchLabels.set(key, nodes);
  }
  for (const [label, sources] of branchLabels) {
    if (sources.length > 1) {
      recommendations.push({
        id: `structure-duplicate-branch-${label}`,
        category: "structure",
        severity: "info",
        title: "Duplicate branch labels",
        description: `Branch label "${label}" is used on multiple decision points, which may cause confusion.`,
        impact: 30,
        confidence: 65,
        estimatedBenefit: "Use distinct branch labels for clearer workflow structure.",
        affectedNodeIds: [...new Set(sources)],
      });
    }
  }

  return recommendations;
}

export function analyzeAiCostRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const aiNodes = input.document.nodes.filter((node) => AI_NODE_TYPES.has(node.type));

  if (aiNodes.length === 0) return recommendations;

  if (aiNodes.length >= 3) {
    recommendations.push({
      id: "ai-multiple-nodes",
      category: "ai",
      severity: "warning",
      title: "Multiple AI steps in workflow",
      description: `${aiNodes.length} AI steps may increase token usage and latency.`,
      impact: Math.min(80, 30 + aiNodes.length * 10),
      confidence: 75,
      estimatedBenefit: "Consolidate AI operations to reduce cost per execution.",
      affectedNodeIds: aiNodes.map((node) => node.id),
    });
  }

  const promptCounts = new Map<string, string[]>();
  for (const node of aiNodes) {
    const prompt = String(node.config.prompt ?? node.config.instruction ?? node.config.query ?? "").trim();
    if (!prompt) continue;
    const key = prompt.slice(0, 120);
    const ids = promptCounts.get(key) ?? [];
    ids.push(node.id);
    promptCounts.set(key, ids);
  }
  for (const [prompt, nodeIds] of promptCounts) {
    if (nodeIds.length < 2) continue;
    recommendations.push({
      id: `ai-repeated-prompt-${nodeIds[0]}`,
      category: "ai",
      severity: "warning",
      title: "Repeated AI prompts",
      description: `Similar prompts appear on ${nodeIds.length} AI steps: "${prompt.slice(0, 60)}…"`,
      impact: 70,
      confidence: 85,
      estimatedBenefit: "Merge duplicate AI calls to reduce token spend.",
      affectedNodeIds: nodeIds,
    });
  }

  const hotAiNodes = input.analytics.heatmap
    .filter((entry) => aiNodes.some((node) => node.id === entry.nodeId) && entry.intensity === "hot")
    .map((entry) => entry.nodeId);
  if (hotAiNodes.length > 0) {
    recommendations.push({
      id: "ai-expensive-path",
      category: "ai",
      severity: "critical",
      title: "High-traffic AI path",
      description: "AI steps on frequently executed paths may drive excessive token usage.",
      impact: 90,
      confidence: 80,
      estimatedBenefit: "Cache results or move AI logic off the hot path.",
      affectedNodeIds: hotAiNodes,
    });
  }

  return recommendations;
}

export function analyzeBranchRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const { branches } = input.analytics;

  for (const branchLabel of branches.neverExecutedBranches) {
    recommendations.push({
      id: `branch-never-executed-${branchLabel}`,
      category: "branch",
      severity: "warning",
      title: "Never-executed branch",
      description: `Branch "${branchLabel}" has not been covered in test runs.`,
      impact: 55,
      confidence: 85,
      estimatedBenefit: "Add test coverage or remove unused branches.",
      affectedNodeIds: input.document.edges
        .filter((edge) => edge.branchLabel === branchLabel)
        .map((edge) => edge.source),
    });
  }

  if (branches.mostExecutedBranch && branches.leastExecutedBranch && branches.mostExecutedBranch !== branches.leastExecutedBranch) {
    recommendations.push({
      id: "branch-imbalance",
      category: "branch",
      severity: "info",
      title: "Branch execution imbalance",
      description: `"${branches.mostExecutedBranch}" is executed far more than "${branches.leastExecutedBranch}".`,
      impact: 40,
      confidence: 70,
      estimatedBenefit: "Review branch logic to ensure balanced customer journeys.",
      affectedNodeIds: [],
    });
  }

  return recommendations;
}

export function analyzeTriggerRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const { triggers } = input.analytics;

  if (triggers.executions === 0 && input.document.triggerType) {
    recommendations.push({
      id: "trigger-rarely-used",
      category: "trigger",
      severity: "info",
      title: "Trigger rarely exercised",
      description: `Trigger type "${input.document.triggerType}" has no recorded executions in analytics.`,
      impact: 35,
      confidence: 60,
      estimatedBenefit: "Add trigger test cases to validate entry conditions.",
      affectedNodeIds: input.document.nodes.filter((node) => node.type === "start").map((node) => node.id),
    });
  }

  if (triggers.failures > 0 && triggers.successRate != null && triggers.successRate < 90) {
    recommendations.push({
      id: "trigger-low-success",
      category: "trigger",
      severity: "warning",
      title: "Trigger reliability concern",
      description: `Trigger success rate is ${triggers.successRate}% with ${triggers.failures} failures.`,
      impact: 70,
      confidence: 80,
      estimatedBenefit: "Review trigger configuration and error handling.",
      affectedNodeIds: input.document.nodes.filter((node) => node.type === "start").map((node) => node.id),
    });
  }

  const startNodes = input.document.nodes.filter((node) => node.type === "start");
  if (startNodes.length > 1) {
    recommendations.push({
      id: "trigger-conflicting-starts",
      category: "trigger",
      severity: "critical",
      title: "Conflicting start nodes",
      description: "Multiple start nodes may cause ambiguous trigger behavior.",
      impact: 90,
      confidence: 95,
      estimatedBenefit: "Consolidate to a single start entry point.",
      affectedNodeIds: startNodes.map((node) => node.id),
    });
  }

  return recommendations;
}

export function analyzeReliabilityRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const { failures, dashboard } = input.analytics;

  for (const node of failures.unstableNodes) {
    recommendations.push({
      id: `reliability-unstable-${node.nodeId}`,
      category: "reliability",
      severity: node.failureCount >= 3 ? "critical" : "warning",
      title: "Unstable execution path",
      description: `"${node.label}" failed ${node.failureCount} time(s) across test runs.`,
      impact: Math.min(95, 50 + node.failureCount * 10),
      confidence: 90,
      estimatedBenefit: "Stabilize this path with better error handling or test coverage.",
      affectedNodeIds: [node.nodeId],
    });
  }

  if (dashboard.failedTests > 0) {
    recommendations.push({
      id: "reliability-failed-tests",
      category: "reliability",
      severity: dashboard.failedTests >= 3 ? "critical" : "warning",
      title: "Repeated test failures",
      description: `${dashboard.failedTests} failed test(s) indicate flaky or broken workflow paths.`,
      impact: Math.min(90, 40 + dashboard.failedTests * 15),
      confidence: 85,
      estimatedBenefit: "Resolve failing tests before publishing to improve reliability.",
      affectedNodeIds: [],
    });
  }

  if (input.analytics.kpis.stability < 70) {
    recommendations.push({
      id: "reliability-low-stability",
      category: "reliability",
      severity: "warning",
      title: "Low stability score",
      description: `Workflow stability KPI is ${input.analytics.kpis.stability}, below recommended threshold.`,
      impact: 60,
      confidence: 75,
      estimatedBenefit: "Address recurring failures to improve production readiness.",
      affectedNodeIds: failures.unstableNodes.map((node) => node.nodeId),
    });
  }

  return recommendations;
}

export function analyzeComplexity(input: WorkflowOptimizationInput) {
  const { document, analytics } = input;
  const nodeCount = document.nodes.length;
  const edgeCount = document.edges.length;
  const branchCount = document.edges.filter((edge) => Boolean(edge.branchKey || edge.branchLabel)).length;
  const conditionCount = document.nodes.filter((node) => node.type === "if_else" || node.type === "switch").length;

  const graphComplexity = Math.min(100, Math.round(nodeCount * 3 + edgeCount * 2));
  const branchingComplexity = Math.min(100, Math.round(branchCount * 8 + conditionCount * 10));
  const maintainability = analytics.kpis.maintainability || Math.max(0, 100 - Math.round(graphComplexity * 0.4 + branchingComplexity * 0.3));
  const readability = Math.max(0, 100 - Math.round(conditionCount * 12 + nodeCount * 2));

  return {
    graphComplexity,
    branchingComplexity,
    maintainability,
    readability,
    nodeCount,
    edgeCount,
    branchCount,
  };
}

export function analyzeComplexityRecommendations(input: WorkflowOptimizationInput): OptimizationRecommendation[] {
  const complexity = analyzeComplexity(input);
  const recommendations: OptimizationRecommendation[] = [];

  if (complexity.graphComplexity >= 70) {
    recommendations.push({
      id: "complexity-high-graph",
      category: "complexity",
      severity: "warning",
      title: "High graph complexity",
      description: `Workflow has ${complexity.nodeCount} nodes and ${complexity.edgeCount} edges, increasing maintenance cost.`,
      impact: 55,
      confidence: 80,
      estimatedBenefit: "Split into sub-workflows or remove redundant steps.",
      affectedNodeIds: [],
    });
  }

  if (complexity.branchingComplexity >= 60) {
    recommendations.push({
      id: "complexity-high-branching",
      category: "complexity",
      severity: "warning",
      title: "High branching complexity",
      description: `${complexity.branchCount} branches across ${complexity.nodeCount} nodes may reduce readability.`,
      impact: 50,
      confidence: 75,
      estimatedBenefit: "Simplify decision trees or extract shared logic.",
      affectedNodeIds: input.document.nodes
        .filter((node) => node.type === "if_else" || node.type === "switch")
        .map((node) => node.id),
    });
  }

  if (complexity.readability < 50) {
    recommendations.push({
      id: "complexity-low-readability",
      category: "complexity",
      severity: "info",
      title: "Low readability score",
      description: "Complex branching and node count may make this workflow hard to maintain.",
      impact: 40,
      confidence: 70,
      estimatedBenefit: "Apply auto-layout and consolidate similar paths.",
      affectedNodeIds: [],
    });
  }

  return recommendations;
}
