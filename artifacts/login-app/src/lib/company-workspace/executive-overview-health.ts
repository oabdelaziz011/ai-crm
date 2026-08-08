export type ExecutiveHealthLevel = "excellent" | "good" | "needsAttention";
export type HealthCheckState = "healthy" | "warning" | "missing";

export type ExecutiveHealthCheckId =
  | "identity"
  | "brand"
  | "billing"
  | "employees"
  | "branches"
  | "departments"
  | "ai"
  | "channels"
  | "knowledge";

export type ExecutiveHealthCheck = {
  id: ExecutiveHealthCheckId;
  state: HealthCheckState;
};

export type ExecutiveHealthReport = {
  level: ExecutiveHealthLevel;
  score: number;
  healthy: number;
  warning: number;
  missing: number;
  total: number;
  checks: ExecutiveHealthCheck[];
};

export function isSubscriptionActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  return normalized === "active" || normalized === "trial" || normalized === "grace";
}

function scoreOf(state: HealthCheckState): number {
  if (state === "healthy") return 1;
  if (state === "warning") return 0.5;
  return 0;
}

/**
 * Health from real signals. Score = weighted ready ratio * 100.
 * warning counts as half credit; missing = 0.
 */
export function computeExecutiveCompanyHealth(input: {
  /** Pass null to omit identity when the user cannot open branding. */
  includeIdentity: boolean;
  hasName: boolean;
  hasLegalName: boolean;
  hasSupportEmail: boolean;
  hasLogo: boolean;
  brandComplete: boolean | null;
  brandScore: number | null;
  /** Pass null to omit billing when the user cannot open subscription/billing. */
  includeBilling: boolean;
  subscriptionActive: boolean;
  subscriptionExpiringSoon: boolean;
  employeesCount: number;
  seatsLimit: number | null;
  branchesCount: number;
  departmentsCount: number;
  hasAiUsage: boolean | null;
  aiNearQuota: boolean | null;
  connectedChannels: number | null;
  knowledgeDocs: number | null;
}): ExecutiveHealthReport {
  let identityState: HealthCheckState | null = null;
  if (input.includeIdentity) {
    identityState =
      input.hasName && input.hasLegalName && input.hasSupportEmail
        ? "healthy"
        : input.hasName
          ? "warning"
          : "missing";
  }

  let brandState: HealthCheckState | null = null;
  if (input.brandComplete != null || input.brandScore != null || input.hasLogo) {
    if (input.brandComplete) brandState = "healthy";
    else if (input.hasLogo || (input.brandScore != null && input.brandScore >= 50))
      brandState = "warning";
    else brandState = "missing";
  }

  let billingState: HealthCheckState | null = null;
  if (input.includeBilling) {
    billingState = input.subscriptionActive
      ? input.subscriptionExpiringSoon
        ? "warning"
        : "healthy"
      : "missing";
  }

  const employeesState: HealthCheckState =
    input.employeesCount <= 0
      ? "missing"
      : input.seatsLimit != null && input.employeesCount >= input.seatsLimit
        ? "warning"
        : "healthy";

  const branchesState: HealthCheckState =
    input.branchesCount > 0 ? "healthy" : "missing";
  const departmentsState: HealthCheckState =
    input.departmentsCount > 0 ? "healthy" : "missing";

  let aiState: HealthCheckState | null = null;
  if (input.hasAiUsage != null) {
    if (!input.hasAiUsage) aiState = "missing";
    else if (input.aiNearQuota) aiState = "warning";
    else aiState = "healthy";
  }

  let channelsState: HealthCheckState | null = null;
  if (input.connectedChannels != null) {
    channelsState =
      input.connectedChannels > 0
        ? "healthy"
        : "missing";
  }

  let knowledgeState: HealthCheckState | null = null;
  if (input.knowledgeDocs != null) {
    knowledgeState = input.knowledgeDocs > 0 ? "healthy" : "missing";
  }

  const checks: ExecutiveHealthCheck[] = [];
  if (identityState) checks.push({ id: "identity", state: identityState });
  if (billingState) checks.push({ id: "billing", state: billingState });
  checks.push(
    { id: "employees", state: employeesState },
    { id: "branches", state: branchesState },
    { id: "departments", state: departmentsState },
  );
  if (brandState) checks.push({ id: "brand", state: brandState });
  if (aiState) checks.push({ id: "ai", state: aiState });
  if (channelsState) checks.push({ id: "channels", state: channelsState });
  if (knowledgeState) checks.push({ id: "knowledge", state: knowledgeState });

  const total = checks.length;
  const points = checks.reduce((sum, c) => sum + scoreOf(c.state), 0);
  const score = total > 0 ? Math.round((points / total) * 100) : 0;
  const healthy = checks.filter((c) => c.state === "healthy").length;
  const warning = checks.filter((c) => c.state === "warning").length;
  const missing = checks.filter((c) => c.state === "missing").length;

  let level: ExecutiveHealthLevel = "needsAttention";
  if (score >= 85) level = "excellent";
  else if (score >= 60) level = "good";

  return { level, score, healthy, warning, missing, total, checks };
}
