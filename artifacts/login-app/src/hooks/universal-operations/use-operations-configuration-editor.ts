import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OperationsConfigDiffEntry,
  OperationsConfigValidationReport,
  OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";
import {
  cloneOperationsConfiguration,
  compareOperationsConfigurations,
  createOperationsConfigCommandContext,
  discardOperationsConfigurationDraft,
  ensureOperationsWorkspaceSeed,
  exportOperationsConfiguration,
  importOperationsConfigurationJson,
  listOperationsConfigurationVersions,
  loadOperationsConfigurationRecord,
  mergeOperationsConfigurationImport,
  publishOperationsConfiguration,
  resetOperationsConfigurationSection,
  resolveOperationsConfigFromRecord,
  rollbackOperationsConfiguration,
  saveOperationsConfigurationDraft,
  validateOperationsConfiguration,
} from "@/lib/application-layer/operations-workspace-config-service";
import { invalidateOperationsPlatformQueries } from "@/lib/application-layer/operations-platform-sync";

const HISTORY_LIMIT = 50;

function configsEqual(a: OperationsWorkspaceConfig | null, b: OperationsWorkspaceConfig | null): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useOperationsConfigurationEditor(templateKeyOverride?: string) {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const platform = useWorkspacePlatformOptional();
  const templateKey = templateKeyOverride ?? platform?.templateKey ?? "clinic";
  const qc = useQueryClient();

  const cmdContext = useMemo(() => {
    if (!company?.id || !user?.id) return null;
    return createOperationsConfigCommandContext({
      companyId: company.id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    });
  }, [company?.id, user?.id, isSuperAdmin, hasPermission]);

  const canWrite =
    isSuperAdmin
    || hasPermission("configuration.write")
    || hasPermission("configuration.operations.write")
    || hasPermission("operations.universal.configure")
    || hasPermission("operations.configuration.manage");
  const canPublish =
    isSuperAdmin
    || hasPermission("configuration.publish")
    || hasPermission("operations.universal.configure")
    || hasPermission("operations.configuration.manage");
  const canRead =
    isSuperAdmin
    || hasPermission("configuration.read")
    || hasPermission("configuration.operations.read")
    || hasPermission("operations.universal.configure")
    || hasPermission("operations.configuration.manage")
    || hasPermission("operations.read");

  const recordQuery = useQuery({
    queryKey: ["operations-config-record", company?.id, templateKey],
    enabled: Boolean(cmdContext),
    queryFn: async () => {
      await ensureOperationsWorkspaceSeed(cmdContext!, templateKey);
      return loadOperationsConfigurationRecord(cmdContext!, templateKey, true);
    },
    staleTime: 10_000,
  });

  const [draft, setDraft] = useState<OperationsWorkspaceConfig | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<OperationsWorkspaceConfig | null>(null);
  const [validationReport, setValidationReport] = useState<OperationsConfigValidationReport | null>(null);
  const [history, setHistory] = useState<OperationsWorkspaceConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [compareDiff, setCompareDiff] = useState<OperationsConfigDiffEntry[] | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    const resolved = resolveOperationsConfigFromRecord(recordQuery.data ?? null, true);
    if (!resolved) return;
    if (isDirtyRef.current) return;
    const clone = structuredClone(resolved);
    setDraft(clone);
    setSavedSnapshot(structuredClone(resolved));
    setHistory([clone]);
    setHistoryIndex(0);
  }, [recordQuery.data]);

  const isDirty = useMemo(() => !configsEqual(draft, savedSnapshot), [draft, savedSnapshot]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const pushHistory = useCallback((next: OperationsWorkspaceConfig) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const updated = [...trimmed, structuredClone(next)].slice(-HISTORY_LIMIT);
      setHistoryIndex(updated.length - 1);
      return updated;
    });
  }, [historyIndex]);

  const invalidate = useCallback(() => {
    if (!company?.id) return;
    void qc.invalidateQueries({ queryKey: ["operations-config-record", company.id, templateKey] });
    void qc.invalidateQueries({ queryKey: ["universal-operations", "config", company.id, templateKey] });
    invalidateOperationsPlatformQueries(qc, { companyId: company.id });
  }, [company?.id, qc, templateKey]);

  const saveDraftMutation = useMutation({
    mutationFn: async (config: OperationsWorkspaceConfig) => {
      if (!cmdContext) throw new Error("Not authenticated");
      return saveOperationsConfigurationDraft(cmdContext, templateKey, config);
    },
    onSuccess: (_data, config) => {
      setSavedSnapshot(structuredClone(config));
      isDirtyRef.current = false;
      invalidate();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (changeSummary?: string) => {
      if (!cmdContext || !draft) throw new Error("Not authenticated");
      await saveOperationsConfigurationDraft(cmdContext, templateKey, draft);
      return publishOperationsConfiguration(cmdContext, templateKey, changeSummary);
    },
    onSuccess: () => {
      setValidationReport(null);
      isDirtyRef.current = false;
      if (draft) setSavedSnapshot(structuredClone(draft));
      invalidate();
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("No draft");
      return validateOperationsConfiguration(draft);
    },
    onSuccess: (report) => setValidationReport(report),
  });

  const rollbackMutation = useMutation({
    mutationFn: async (targetVersion: number) => {
      if (!cmdContext || !recordQuery.data?.id) throw new Error("No configuration");
      return rollbackOperationsConfiguration(cmdContext, recordQuery.data.id, targetVersion);
    },
    onSuccess: () => {
      isDirtyRef.current = false;
      invalidate();
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      if (!cmdContext) throw new Error("Not authenticated");
      return discardOperationsConfigurationDraft(cmdContext, templateKey);
    },
    onSuccess: () => {
      isDirtyRef.current = false;
      invalidate();
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (targetTemplateKey: string) => {
      if (!cmdContext || !draft) throw new Error("Not authenticated");
      return cloneOperationsConfiguration(cmdContext, templateKey, targetTemplateKey, draft);
    },
    onSuccess: () => invalidate(),
  });

  const versionsQuery = useQuery({
    queryKey: ["operations-config-versions", recordQuery.data?.id],
    enabled: Boolean(cmdContext && recordQuery.data?.id),
    queryFn: () => listOperationsConfigurationVersions(cmdContext!, recordQuery.data!.id, 20),
  });

  const publishedConfig = useMemo(() => {
    const record = recordQuery.data;
    if (!record?.publishedConfig) return null;
    return resolveOperationsConfigFromRecord({ ...record, draftConfig: null }, false);
  }, [recordQuery.data]);

  const updateDraft = useCallback(
    (patch: Partial<OperationsWorkspaceConfig> | ((prev: OperationsWorkspaceConfig) => OperationsWorkspaceConfig)) => {
      if (!canWrite) return;
      setDraft((prev) => {
        if (!prev) return prev;
        const next =
          typeof patch === "function"
            ? patch(prev)
            : { ...prev, ...patch, updatedAt: new Date().toISOString() };
        pushHistory(next);
        return next;
      });
    },
    [pushHistory, canWrite],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setDraft(structuredClone(history[nextIndex]!));
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setDraft(structuredClone(history[nextIndex]!));
  }, [history, historyIndex]);

  const saveDraft = useCallback(async () => {
    if (!canWrite) throw new Error("Permission denied");
    if (!draft) return;
    await saveDraftMutation.mutateAsync(draft);
  }, [canWrite, draft, saveDraftMutation]);

  const publish = useCallback(
    async (changeSummary?: string) => {
      if (!canPublish) throw new Error("Permission denied");
      const report = draft ? validateOperationsConfiguration(draft) : null;
      setValidationReport(report);
      if (report && !report.valid) throw new Error("Configuration validation failed");
      await publishMutation.mutateAsync(changeSummary);
    },
    [canPublish, draft, publishMutation],
  );

  const resetToPublished = useCallback(() => {
    if (!publishedConfig) return;
    const clone = structuredClone(publishedConfig);
    setDraft(clone);
    pushHistory(clone);
  }, [publishedConfig, pushHistory]);

  const resetSection = useCallback(
    (section: keyof OperationsWorkspaceConfig) => {
      if (!draft) return;
      const next = resetOperationsConfigurationSection(draft, section);
      updateDraft(next);
    },
    [draft, updateDraft],
  );

  const exportConfig = useCallback(() => {
    if (!draft) return "";
    return exportOperationsConfiguration(draft);
  }, [draft]);

  const importConfig = useCallback(
    (json: string, mode: "replace" | "merge" = "replace") => {
      if (!company?.id || !draft) throw new Error("No draft");
      const imported = importOperationsConfigurationJson(json, templateKey, company.id);
      const next = mode === "merge" ? mergeOperationsConfigurationImport(draft, imported) : imported;
      updateDraft(next);
      return next;
    },
    [company?.id, draft, templateKey, updateDraft],
  );

  const compareWithVersion = useCallback(
    (version: number) => {
      if (!draft) return [];
      const snapshot = versionsQuery.data?.find((v) => v.version === version);
      if (!snapshot?.config) return [];
      const before = parseImportedConfig(snapshot.config as Record<string, unknown>, templateKey, company?.id ?? "");
      const diff = compareOperationsConfigurations(before, draft);
      setCompareDiff(diff);
      return diff;
    },
    [draft, versionsQuery.data, templateKey, company?.id],
  );

  const compareWithPublished = useCallback(() => {
    if (!draft || !publishedConfig) return [];
    const diff = compareOperationsConfigurations(publishedConfig, draft);
    setCompareDiff(diff);
    return diff;
  }, [draft, publishedConfig]);

  const hasUnpublishedDraft = Boolean(recordQuery.data?.draftConfig && Object.keys(recordQuery.data.draftConfig).length > 0);
  const publishedVersion = recordQuery.data?.version ?? 1;

  return {
    templateKey,
    setTemplateKey: platform?.setTemplateKey,
    draft,
    publishedConfig,
    updateDraft,
    record: recordQuery.data ?? null,
    status: hasUnpublishedDraft || isDirty ? "draft" : "published",
    hasUnpublishedDraft: hasUnpublishedDraft || isDirty,
    publishedVersion,
    validationReport,
    compareDiff,
    isDirty,
    isLoading: recordQuery.isLoading,
    isError: recordQuery.isError,
    error: recordQuery.error,
    canRead,
    canWrite,
    canPublish,
    isReady: Boolean(cmdContext && draft),
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    saveDraft,
    publish,
    validate: () => validateMutation.mutateAsync(),
    rollback: rollbackMutation.mutateAsync,
    discardDraft: () => discardMutation.mutateAsync(),
    cloneToTemplate: cloneMutation.mutateAsync,
    resetToPublished,
    resetSection,
    exportConfig,
    importConfig,
    compareWithVersion,
    compareWithPublished,
    undo,
    redo,
    versions: versionsQuery.data ?? [],
    isSaving: saveDraftMutation.isPending,
    isPublishing: publishMutation.isPending,
    isValidating: validateMutation.isPending,
    isDiscarding: discardMutation.isPending,
    isCloning: cloneMutation.isPending,
  };
}

function parseImportedConfig(raw: Record<string, unknown>, templateKey: string, companyId: string): OperationsWorkspaceConfig {
  return importOperationsConfigurationJson(JSON.stringify(raw), templateKey, companyId);
}
