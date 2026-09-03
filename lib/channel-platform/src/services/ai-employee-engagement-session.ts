export const AI_EMPLOYEE_ENGAGEMENT_METADATA_KEY = "aiEmployeeEngagement";

export const DEFAULT_AI_EMPLOYEE_SESSION_TIMEOUT_MINUTES = 1440;

export type AiEmployeeEngagementState = {
  startedAt: string;
  aiEmployeeId: string;
  welcomeDeliveredAt?: string | null;
};

export function readAiEmployeeEngagement(
  metadata: Record<string, unknown> | null | undefined,
): AiEmployeeEngagementState | null {
  const raw = metadata?.[AI_EMPLOYEE_ENGAGEMENT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const startedAt = typeof record.startedAt === "string" ? record.startedAt.trim() : "";
  const aiEmployeeId = typeof record.aiEmployeeId === "string" ? record.aiEmployeeId.trim() : "";
  if (!startedAt || !aiEmployeeId) return null;
  const welcomeDeliveredAt =
    typeof record.welcomeDeliveredAt === "string" && record.welcomeDeliveredAt.trim()
      ? record.welcomeDeliveredAt.trim()
      : record.welcomeDeliveredAt === null
        ? null
        : undefined;
  return {
    startedAt,
    aiEmployeeId,
    ...(welcomeDeliveredAt !== undefined ? { welcomeDeliveredAt } : {}),
  };
}

export function mergeChannelSessionMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...patch,
  };
}

export function buildEngagementMetadataPatch(
  engagement: AiEmployeeEngagementState,
): Record<string, unknown> {
  return {
    [AI_EMPLOYEE_ENGAGEMENT_METADATA_KEY]: engagement,
  };
}

export function resolveAiEmployeeEngagement(input: {
  previousLastInboundAt: string | null;
  now: Date;
  sessionTimeoutMinutes: number;
  aiEmployeeId: string;
  previousEngagement: AiEmployeeEngagementState | null;
}): { engagement: AiEmployeeEngagementState; isNewEngagement: boolean } {
  const previousLastInboundAt = input.previousLastInboundAt;
  const isFirstEverInbound = previousLastInboundAt == null;
  const previousInboundMs =
    previousLastInboundAt == null ? Number.NaN : new Date(previousLastInboundAt).getTime();
  const elapsedMs = isFirstEverInbound ? Number.POSITIVE_INFINITY : input.now.getTime() - previousInboundMs;
  const timeoutMs = Math.max(1, input.sessionTimeoutMinutes) * 60_000;
  const inactivityExceeded = !isFirstEverInbound && elapsedMs > timeoutMs;
  const employeeChanged =
    input.previousEngagement?.aiEmployeeId != null &&
    input.previousEngagement.aiEmployeeId !== input.aiEmployeeId;
  const isNewEngagement = isFirstEverInbound || inactivityExceeded || employeeChanged;

  if (isNewEngagement) {
    // After idle/session expiry, welcome must be allowed again on the next customer message.
    // Only first-ever inbound / employee change previously cleared welcome; inactivity must too.
    return {
      isNewEngagement: true,
      engagement: {
        startedAt: input.now.toISOString(),
        aiEmployeeId: input.aiEmployeeId,
        welcomeDeliveredAt: null,
      },
    };
  }

  const engagement: AiEmployeeEngagementState = {
    startedAt: input.previousEngagement!.startedAt,
    aiEmployeeId: input.aiEmployeeId,
    welcomeDeliveredAt: input.previousEngagement?.welcomeDeliveredAt ?? null,
  };

  return {
    isNewEngagement: false,
    engagement,
  };
}

export function markEngagementWelcomeDelivered(
  engagement: AiEmployeeEngagementState,
): AiEmployeeEngagementState {
  return {
    ...engagement,
    welcomeDeliveredAt: engagement.startedAt,
  };
}

export function hasEngagementWelcomeDelivered(engagement: AiEmployeeEngagementState | null): boolean {
  if (!engagement) return false;
  return Boolean(engagement.welcomeDeliveredAt);
}
