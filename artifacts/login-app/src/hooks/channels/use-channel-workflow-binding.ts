import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchActiveAutomationFlows,
  fetchChannelWorkflowBinding,
  saveChannelWorkflowBinding,
} from "@/lib/channel-workflow-binding/channel-workflow-binding-repository";
import type { ChannelWorkflowBindingRecord } from "@/lib/channel-workflow-binding/types";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";

export function activeAutomationFlowsQueryKey(companyId: string | null) {
  return ["active-automation-flows", companyId] as const;
}

export function channelWorkflowBindingQueryKey(companyChannelId: string | null) {
  return ["channel-workflow-binding", companyChannelId] as const;
}

export function useActiveAutomationFlows(companyId: string | null) {
  return useQuery({
    queryKey: activeAutomationFlowsQueryKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      return fetchActiveAutomationFlows(supabase, companyId);
    },
  });
}

export function useChannelWorkflowBinding(companyChannelId: string | null, enabled = true) {
  return useQuery({
    queryKey: channelWorkflowBindingQueryKey(companyChannelId),
    enabled: Boolean(companyChannelId) && enabled,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async () => {
      if (!companyChannelId) return null;
      return fetchChannelWorkflowBinding(supabase, companyChannelId);
    },
  });
}

export type ChannelWorkflowBindingFormState = {
  workflowEnabled: boolean;
  selectedFlowId: string;
};

export function useChannelWorkflowBindingForm(
  companyId: string | null,
  companyChannelId: string | null,
  dialogOpen: boolean,
) {
  const queryClient = useQueryClient();
  const flowsQuery = useActiveAutomationFlows(companyId);
  const bindingQuery = useChannelWorkflowBinding(companyChannelId, dialogOpen);

  const [workflowEnabled, setWorkflowEnabled] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState("");

  useEffect(() => {
    if (!dialogOpen) {
      setWorkflowEnabled(false);
      setSelectedFlowId("");
      return;
    }

    if (bindingQuery.isLoading) return;

    const binding = bindingQuery.data;
    if (!binding) {
      setWorkflowEnabled(false);
      setSelectedFlowId("");
      return;
    }

    setWorkflowEnabled(binding.isEnabled);
    setSelectedFlowId(binding.automationFlowId);
  }, [dialogOpen, bindingQuery.data, bindingQuery.isLoading]);

  const saveMutation = useMutation({
    mutationFn: async (existingBinding: ChannelWorkflowBindingRecord | null) => {
      if (!companyId || !companyChannelId) {
        throw new Error("Company and channel are required.");
      }

      return saveChannelWorkflowBinding(supabase, {
        companyId,
        companyChannelId,
        workflowEnabled,
        automationFlowId: selectedFlowId || null,
        existingBinding,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelWorkflowBindingQueryKey(companyChannelId) });
    },
  });

  return {
    flows: flowsQuery.data ?? [],
    flowsLoading: flowsQuery.isLoading,
    binding: bindingQuery.data ?? null,
    bindingLoading: bindingQuery.isLoading,
    workflowEnabled,
    setWorkflowEnabled,
    selectedFlowId,
    setSelectedFlowId,
    saveBinding: saveMutation,
  };
}
