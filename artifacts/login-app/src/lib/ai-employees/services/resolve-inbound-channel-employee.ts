import type { SupabaseClient } from "@supabase/supabase-js";
import { writeLifecycleOverlay } from "@/lib/conversation-lifecycle/adapters/backend-state-adapter";
import { createAiEmployeeServices } from "@/lib/ai-employees";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import { resolveEmployeeChannelRuntime } from "./resolve-employee-channel-runtime";

const INBOUND_EMPLOYEE_TTL_MS = 30_000;

type InboundEmployeeCacheEntry = {
  expiresAt: number;
  employee: AiEmployeeRecord | null;
};

const inboundEmployeeCache = new Map<string, InboundEmployeeCacheEntry>();

function scoreEmployeeForChannel(
  employee: AiEmployeeRecord,
  channelKey: string,
  companyChannelId: string,
): number {
  const tags = employee.tags ?? [];
  const channelTag = `channel:${channelKey}`;
  const channelIdTag = `channel:${companyChannelId}`;
  let score = 0;
  if (tags.includes(channelIdTag)) score += 100;
  if (tags.includes(channelTag)) score += 50;
  if (tags.includes("capability:omnichannel")) score += 10;
  return score;
}

export function buildInboundEmployeeConversationMetadata(
  employee: AiEmployeeRecord,
  existingMetadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return writeLifecycleOverlay(
    {
      ...existingMetadata,
      aiEmployeeId: employee.id,
      aiEmployeeVersionId: employee.publishedVersionId,
      aiEmployeeDisplayName: employee.displayName,
      transferableFlowId: employee.runtimeConfiguration.transferableFlowId ?? null,
    },
    {
      state: "AI_HANDLING",
      owner: {
        kind: "ai_employee",
        id: employee.id,
        label: employee.displayName,
      },
    },
  );
}

export async function resolveInboundChannelEmployee(
  client: SupabaseClient,
  companyId: string,
  channelKey: string,
  companyChannelId: string,
): Promise<AiEmployeeRecord | null> {
  const cacheKey = `${companyId}:${channelKey}:${companyChannelId}`;
  const now = Date.now();
  const cached = inboundEmployeeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.employee;
  }

  const services = createAiEmployeeServices(client);
  const published = await services.registry.list(companyId, { status: "published" });
  if (published.length === 0) {
    inboundEmployeeCache.set(cacheKey, { expiresAt: now + INBOUND_EMPLOYEE_TTL_MS, employee: null });
    return null;
  }

  const ranked = [...published].sort(
    (left, right) =>
      scoreEmployeeForChannel(right, channelKey, companyChannelId) -
      scoreEmployeeForChannel(left, channelKey, companyChannelId),
  );

  const tagged = ranked.filter(
    (employee) => scoreEmployeeForChannel(employee, channelKey, companyChannelId) > 0,
  );
  const candidates = tagged.length > 0 ? tagged : ranked;

  for (const employee of candidates) {
    const binding = await resolveEmployeeChannelRuntime(companyId, employee.id, client);
    if (binding) {
      inboundEmployeeCache.set(cacheKey, {
        expiresAt: now + INBOUND_EMPLOYEE_TTL_MS,
        employee,
      });
      return employee;
    }
    console.warn("[ai-employee] inbound resolve skipped employee without channel runtime binding", {
      companyId,
      companyChannelId,
      channelKey,
      aiEmployeeId: employee.id,
      displayName: employee.displayName,
      score: scoreEmployeeForChannel(employee, channelKey, companyChannelId),
      transferableFlowId: employee.runtimeConfiguration.transferableFlowId ?? null,
    });
  }

  inboundEmployeeCache.set(cacheKey, { expiresAt: now + INBOUND_EMPLOYEE_TTL_MS, employee: null });
  return null;
}

/** Test helper — clears the inbound employee pick cache. */
export function clearInboundChannelEmployeeCache(): void {
  inboundEmployeeCache.clear();
}
