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

const EXPLICIT_ASSIGNMENT_CHANNELS = new Set(["messenger", "instagram"]);

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

async function resolveExplicitChannelAssignment(
  client: SupabaseClient,
  companyId: string,
  companyChannelId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("company_channels")
    .select("assigned_ai_employee_id")
    .eq("id", companyChannelId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.warn("[ai-employee] explicit assignment lookup failed", {
      companyId,
      companyChannelId,
      message: error.message,
    });
    return null;
  }
  const assigned = String(data?.assigned_ai_employee_id ?? "").trim();
  return assigned || null;
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

  // Messenger / Instagram: explicit assignment only — never tag/auto fallback.
  if (EXPLICIT_ASSIGNMENT_CHANNELS.has(channelKey)) {
    const assignedId = await resolveExplicitChannelAssignment(client, companyId, companyChannelId);
    if (!assignedId) {
      inboundEmployeeCache.set(cacheKey, { expiresAt: now + INBOUND_EMPLOYEE_TTL_MS, employee: null });
      return null;
    }
    const employee = await services.registry.getById(assignedId, companyId);
    if (!employee || employee.status !== "published") {
      inboundEmployeeCache.set(cacheKey, { expiresAt: now + INBOUND_EMPLOYEE_TTL_MS, employee: null });
      return null;
    }
    const binding = await resolveEmployeeChannelRuntime(companyId, employee.id, client);
    if (!binding) {
      console.warn("[ai-employee] explicit assignee missing channel runtime binding", {
        companyId,
        companyChannelId,
        channelKey,
        aiEmployeeId: employee.id,
      });
      inboundEmployeeCache.set(cacheKey, { expiresAt: now + INBOUND_EMPLOYEE_TTL_MS, employee: null });
      return null;
    }
    inboundEmployeeCache.set(cacheKey, {
      expiresAt: now + INBOUND_EMPLOYEE_TTL_MS,
      employee,
    });
    return employee;
  }

  // WhatsApp (+ other channels): keep tag scoring + fallback to any published employee.
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
