import { supabase } from "@/lib/supabase";
import { branchDraftsToRpcPayload, type BranchDraft } from "./branch-draft";

export async function saveOnboardingBranches(input: {
  companyId: string;
  drafts: BranchDraft[];
  timezone: string;
  city: string;
  country: string;
}): Promise<void> {
  const { error } = await supabase.rpc("save_onboarding_branches", {
    p_company_id: input.companyId,
    p_branches: branchDraftsToRpcPayload(input.drafts, {
      timezone: input.timezone,
      city: input.city,
      country: input.country,
    }),
  });
  if (error) {
    throw new Error(error.message || "branch_save_failed");
  }
}
