import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import {
  aiEmployeeChangeEventsKey,
  aiEmployeeDeploymentsKey,
  aiEmployeeLifecycleKey,
  aiEmployeeVersionCompareKey,
  aiEmployeeVersionsKey,
  invalidateAiEmployeeQueries,
} from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { AiEmployeeLifecycleError } from "@/lib/ai-employees/services";
import { buildReadinessScore, buildValidationResult } from "@/lib/ai-employees/services/ai-employee-validation-service";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import { useAiEmployeeRuntimePreview } from "./use-ai-employee-runtime-config";

const services = getAiEmployeeServices();

export function useAiEmployeeVersions(companyId: string | null, agentId: string | null) {
  return useQuery({
    queryKey: aiEmployeeVersionsKey(companyId, agentId),
    enabled: Boolean(companyId && agentId),
    queryFn: () => services.lifecycle.listVersions(agentId!, companyId!),
  });
}

export function useAiEmployeeDeployments(companyId: string | null, agentId: string | null) {
  return useQuery({
    queryKey: aiEmployeeDeploymentsKey(companyId, agentId),
    enabled: Boolean(companyId && agentId),
    queryFn: () => services.lifecycle.listDeployments(agentId!, companyId!),
  });
}

export function useAiEmployeeChangeTimeline(companyId: string | null, agentId: string | null) {
  return useQuery({
    queryKey: aiEmployeeChangeEventsKey(companyId, agentId),
    enabled: Boolean(companyId && agentId),
    queryFn: () => services.lifecycle.listChangeEvents(agentId!, companyId!),
  });
}

export function useAiEmployeeLifecycleState(
  companyId: string | null,
  agentId: string | null,
) {
  const previewQuery = useAiEmployeeRuntimePreview(companyId, agentId);
  const versionsQuery = useAiEmployeeVersions(companyId, agentId);
  const deploymentsQuery = useAiEmployeeDeployments(companyId, agentId);
  const timelineQuery = useAiEmployeeChangeTimeline(companyId, agentId);

  const validationState = useMemo(() => {
    if (!previewQuery.data) return null;
    return {
      validation: buildValidationResult(previewQuery.data),
      readiness: buildReadinessScore(previewQuery.data),
    };
  }, [previewQuery.data]);

  return useMemo(
    () => ({
      preview: previewQuery.data ?? null,
      validation: validationState?.validation ?? null,
      readiness: validationState?.readiness ?? null,
      versions: versionsQuery.data ?? [],
      deployments: deploymentsQuery.data ?? [],
      timeline: timelineQuery.data ?? [],
      isLoading:
        previewQuery.isLoading ||
        versionsQuery.isLoading ||
        deploymentsQuery.isLoading ||
        timelineQuery.isLoading,
      error:
        previewQuery.error ??
        versionsQuery.error ??
        deploymentsQuery.error ??
        timelineQuery.error ??
        null,
    }),
    [
      deploymentsQuery.data,
      deploymentsQuery.error,
      deploymentsQuery.isLoading,
      previewQuery.data,
      previewQuery.error,
      previewQuery.isLoading,
      timelineQuery.data,
      timelineQuery.error,
      timelineQuery.isLoading,
      validationState?.readiness,
      validationState?.validation,
      versionsQuery.data,
      versionsQuery.error,
      versionsQuery.isLoading,
    ],
  );
}

export function useCompareAiEmployeeVersions(
  companyId: string | null,
  agentId: string | null,
  leftVersion: number | null,
  rightVersion: number | null,
) {
  return useQuery({
    queryKey: aiEmployeeVersionCompareKey(companyId, agentId, leftVersion, rightVersion),
    enabled: Boolean(companyId && agentId && leftVersion != null && rightVersion != null),
    queryFn: () =>
      services.lifecycle.compareVersions(agentId!, companyId!, leftVersion!, rightVersion!),
  });
}

export function usePublishAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { publishNotes?: string; preview: AgentRuntimeConfiguration }) => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.lifecycle.publish(
        { employeeId: agentId, companyId, publishNotes: input.publishNotes, actorId: user?.id ?? null },
        input.preview,
      );
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
      qc.invalidateQueries({ queryKey: aiEmployeeLifecycleKey(companyId, agentId) });
    },
  });
}

export function useRollbackAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (versionNumber: number) => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.lifecycle.rollback({
        employeeId: agentId,
        companyId,
        versionNumber,
        actorId: user?.id ?? null,
      });
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function useArchiveAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.lifecycle.archive(agentId, companyId, user?.id ?? null);
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function useRestoreAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.lifecycle.restore(agentId, companyId, user?.id ?? null);
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function useDisableAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.lifecycle.disable(agentId, companyId, user?.id ?? null);
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function formatAiEmployeeLifecycleError(error: unknown): string {
  if (error instanceof AiEmployeeLifecycleError) {
    if (error.code === "delete_blocked" || error.code === "archive_blocked") {
      const details = error.details as { blockers?: Array<{ reason?: string }> } | undefined;
      const first = details?.blockers?.[0]?.reason;
      return first || error.message;
    }
    if (error.code === "already_archived") {
      return error.message;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}
