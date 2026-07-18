import { supabase } from "@/lib/supabase";

export type DemoScenario = {
  code: string;
  label: string;
  description: string;
  suggested_login_email: string;
};

export type DemoScenarioStatus = {
  demo_env: string;
  seeded_at: string | null;
  last_seed_at: string | null;
  active_scenario: string | null;
  active_scenario_label: string | null;
  focus_company_id: string | null;
  suggested_login_email: string | null;
  switched_at: string | null;
};

export async function fetchDemoScenarios(): Promise<DemoScenario[]> {
  const { data, error } = await supabase.rpc("list_enterprise_demo_scenarios_v1");
  if (error) throw error;
  return (data ?? []) as DemoScenario[];
}

export async function fetchDemoScenarioStatus(): Promise<DemoScenarioStatus> {
  const { data, error } = await supabase.rpc("get_enterprise_demo_status_v1");
  if (error) throw error;
  return data as DemoScenarioStatus;
}

export async function switchDemoScenario(scenarioCode: string) {
  const { data, error } = await supabase.rpc("switch_enterprise_demo_scenario_v1", {
    p_scenario_code: scenarioCode,
  });
  if (error) throw error;
  return data;
}

export async function resetDemoEnvironment() {
  const { data, error } = await supabase.rpc("reset_enterprise_demo_v1");
  if (error) throw error;
  return data;
}
