import { useMemo } from "react";

import {

  intelligenceOrchestrator,

  resolveIntelligenceBlocks,

  OperationsRuntimeConfigurationError,

} from "@workspace/universal-operations-engine";

import type { Customer360WorkspaceRole } from "@workspace/universal-operations-engine";

import type { OperationsCustomer360WorkspaceData } from "@workspace/universal-operations-engine";

import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";



export function useCustomer360Intelligence(

  data: OperationsCustomer360WorkspaceData | undefined,

  role: Customer360WorkspaceRole,

  config?: OperationsWorkspaceConfig | null,

) {

  const intelligence = config?.intelligence;

  const businessContext = config?.businessContext;

  const ai = config?.ai;

  const blocksConfig = intelligence?.blocks ?? [];



  return useMemo(() => {

    if (!data || ("isEmpty" in data && data.isEmpty)) return { snapshot: null, blocks: [], configError: null };

    if (!intelligence?.journeySteps?.length || !intelligence.workflowStages?.length) {

      return {

        snapshot: null,

        blocks: [],

        configError: new OperationsRuntimeConfigurationError(

          "configuration.intelligence is incomplete — journeySteps and workflowStages are required",

        ),

      };

    }

    if (!businessContext?.fields?.length) {

      return {

        snapshot: null,

        blocks: [],

        configError: new OperationsRuntimeConfigurationError(

          "configuration.businessContext.fields is required — no runtime business context fallback available",

        ),

      };

    }



    return {

      snapshot: intelligenceOrchestrator.buildSnapshot(data, intelligence, businessContext, ai),

      blocks: resolveIntelligenceBlocks(blocksConfig, role),

      configError: null,

    };

  }, [data, role, intelligence, businessContext, ai, blocksConfig]);

}

