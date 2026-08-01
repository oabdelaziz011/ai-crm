import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowDocument } from "../../core/types";
import { workflowTestingKey } from "../cache/testing-query-keys";
import { InMemoryTestingRepository } from "../repositories/in-memory-testing-repository";
import type { WorkflowTestingRepository } from "../repositories/workflow-testing-repository";
import {
  buildTestingPanelViewModel,
  findFirstFailedCase,
} from "../selectors/testing-ui-selectors";
import { WorkflowTestingService } from "../services/test-runner-service";
import type {
  TestAssertion,
  TestCase,
  TestCaseRunResult,
  TestSuite,
  TestSuiteRunRecord,
} from "../types/testing-types";

type TestingCacheState = {
  suites: TestSuite[];
  archivedSuites: TestSuite[];
  cases: TestCase[];
  runHistory: TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
};

function createEmptyTestingState(): TestingCacheState {
  return {
    suites: [],
    archivedSuites: [],
    cases: [],
    runHistory: [],
    latestRun: null,
  };
}

type UseWorkflowTestingOptions = {
  enabled?: boolean;
};

export function invalidateTestingQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null,
  flowId: string | null,
) {
  queryClient.invalidateQueries({ queryKey: workflowTestingKey(companyId, flowId) });
}

export function useWorkflowTesting(document: WorkflowDocument, options: UseWorkflowTestingOptions = {}) {
  const queryClient = useQueryClient();
  const companyId = document.companyId;
  const flowId = document.flowId;
  const canRun = options.enabled !== false && Boolean(companyId && flowId);
  const queryKey = useMemo(() => workflowTestingKey(companyId, flowId), [companyId, flowId]);
  const repository = useMemo<WorkflowTestingRepository>(() => new InMemoryTestingRepository(), []);
  const service = useMemo(() => new WorkflowTestingService(repository), [repository]);
  const scope = useMemo(() => ({ companyId: companyId ?? "", flowId: flowId ?? "" }), [companyId, flowId]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<TestCaseRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!canRun) return;
    return () => {
      service.disposeScope(scope);
    };
  }, [canRun, scope, service]);

  const stateQuery = useQuery({
    queryKey,
    queryFn: () => createEmptyTestingState(),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: canRun,
    initialData: createEmptyTestingState(),
  });

  const state = stateQuery.data ?? createEmptyTestingState();

  const commitState = useCallback(
    (updater: (current: TestingCacheState) => TestingCacheState) => {
      if (!canRun) return;
      queryClient.setQueryData<TestingCacheState>(queryKey, (current) => updater(current ?? createEmptyTestingState()));
    },
    [canRun, queryClient, queryKey],
  );

  const refreshFromRepository = useCallback(() => {
    if (!canRun) return;
    const suites = service.listSuites(scope);
    const archivedSuites = service.listArchivedSuites(scope);
    const cases = suites.flatMap((suite) => service.listCases(scope, suite.id));
    const archivedCases = archivedSuites.flatMap((suite) => service.listAllCases(scope, suite.id));
    commitState((current) => ({
      ...current,
      suites,
      archivedSuites,
      cases: [...cases, ...archivedCases],
    }));
  }, [canRun, commitState, scope, service]);

  useEffect(() => {
    if (!canRun) return;
    refreshFromRepository();
  }, [canRun, refreshFromRepository]);

  useEffect(() => {
    if (!selectedSuiteId && state.suites.length > 0) {
      setSelectedSuiteId(state.suites[0]?.id ?? null);
    }
  }, [selectedSuiteId, state.suites]);

  const viewModel = useMemo(
    () =>
      buildTestingPanelViewModel({
        suites: state.suites,
        archivedSuites: state.archivedSuites,
        cases: state.cases,
        selectedSuiteId,
        runHistory: state.runHistory,
        latestRun: state.latestRun,
        selectedFailure,
        isRunning,
      }),
    [isRunning, selectedFailure, selectedSuiteId, state],
  );

  const createSuite = useCallback(
    (name: string, description = "") => {
      if (!canRun) return null;
      const suite = service.createSuite(scope, { name, description });
      refreshFromRepository();
      setSelectedSuiteId(suite.id);
      return suite;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const updateSuite = useCallback(
    (suiteId: string, input: { name?: string; description?: string }) => {
      if (!canRun) return null;
      const suite = service.updateSuite(scope, suiteId, input);
      refreshFromRepository();
      return suite;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const duplicateSuite = useCallback(
    (suiteId: string) => {
      if (!canRun) return null;
      const suite = service.duplicateSuite(scope, suiteId);
      refreshFromRepository();
      if (suite) setSelectedSuiteId(suite.id);
      return suite;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const archiveSuite = useCallback(
    (suiteId: string) => {
      if (!canRun) return null;
      const suite = service.archiveSuite(scope, suiteId);
      refreshFromRepository();
      if (selectedSuiteId === suiteId) {
        setSelectedSuiteId(state.suites.find((entry) => entry.id !== suiteId)?.id ?? null);
      }
      return suite;
    },
    [canRun, refreshFromRepository, scope, selectedSuiteId, service, state.suites],
  );

  const restoreSuite = useCallback(
    (suiteId: string) => {
      if (!canRun) return null;
      const suite = service.restoreSuite(scope, suiteId);
      refreshFromRepository();
      return suite;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const createCase = useCallback(
    (
      suiteId: string,
      input: {
        name: string;
        description?: string;
        mockVariables?: Record<string, unknown>;
        expectedPath?: string[];
        expectedOutputs?: Record<string, unknown>;
        expectedWarnings?: string[];
        assertions?: TestAssertion[];
      },
    ) => {
      if (!canRun) return null;
      const testCase = service.createCase(scope, suiteId, input);
      refreshFromRepository();
      return testCase;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const duplicateCase = useCallback(
    (caseId: string) => {
      if (!canRun) return null;
      const testCase = service.duplicateCase(scope, caseId);
      refreshFromRepository();
      return testCase;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const archiveCase = useCallback(
    (caseId: string) => {
      if (!canRun) return null;
      const testCase = service.archiveCase(scope, caseId);
      refreshFromRepository();
      return testCase;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const restoreCase = useCallback(
    (caseId: string) => {
      if (!canRun) return null;
      const testCase = service.restoreCase(scope, caseId);
      refreshFromRepository();
      return testCase;
    },
    [canRun, refreshFromRepository, scope, service],
  );

  const runSelectedSuite = useCallback(async () => {
    if (!canRun || !selectedSuiteId || isRunning) return null;
    setIsRunning(true);
    try {
      const run = service.runSuite(document, scope, selectedSuiteId);
      if (run) {
        commitState((current) => ({
          ...current,
          latestRun: run,
          runHistory: [run, ...current.runHistory].slice(0, 50),
        }));
        setSelectedFailure(findFirstFailedCase(run));
      }
      return run;
    } finally {
      setIsRunning(false);
    }
  }, [canRun, commitState, document, isRunning, scope, selectedSuiteId, service]);

  const runCase = useCallback(
    async (caseId: string) => {
      if (!canRun || isRunning) return null;
      const testCase = service.getCase(scope, caseId);
      if (!testCase) return null;
      setIsRunning(true);
      try {
        const result = service.runCase(document, testCase);
        if (result.status === "failed") {
          setSelectedFailure(result);
        }
        return result;
      } finally {
        setIsRunning(false);
      }
    },
    [canRun, document, isRunning, scope, service],
  );

  const selectFailure = useCallback((result: TestCaseRunResult | null) => {
    setSelectedFailure(result);
  }, []);

  return {
    enabled: canRun,
    panelOpen,
    setPanelOpen,
    viewModel,
    selectedSuiteId,
    setSelectedSuiteId,
    selectedFailure,
    selectFailure,
    isRunning,
    createSuite,
    updateSuite,
    duplicateSuite,
    archiveSuite,
    restoreSuite,
    createCase,
    duplicateCase,
    archiveCase,
    restoreCase,
    runSelectedSuite,
    runCase,
  };
}

export type WorkflowTestingController = ReturnType<typeof useWorkflowTesting>;
