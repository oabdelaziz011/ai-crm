import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDemoScenarioStatus,
  fetchDemoScenarios,
  resetDemoEnvironment,
  switchDemoScenario,
} from "@/lib/demo/demo-scenario-api";

const STATUS_KEY = ["demo", "scenario-status"] as const;
const LIST_KEY = ["demo", "scenarios"] as const;

export function useDemoScenarios(enabled = true) {
  return useQuery({
    queryKey: LIST_KEY,
    enabled,
    queryFn: fetchDemoScenarios,
  });
}

export function useDemoScenarioStatus(enabled = true) {
  return useQuery({
    queryKey: STATUS_KEY,
    enabled,
    queryFn: fetchDemoScenarioStatus,
  });
}

export function useSwitchDemoScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: switchDemoScenario,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      await queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useResetDemoEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetDemoEnvironment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      await queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}
