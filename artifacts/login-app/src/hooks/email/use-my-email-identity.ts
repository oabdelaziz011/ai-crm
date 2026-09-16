import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyPersonalEmailIdentity,
  normalizePersonalEmailIdentity,
  personalEmailIdentityToPersist,
  type PersonalEmailIdentity,
} from "@/lib/email-workspace/email-personal-identity";

export const MY_EMAIL_IDENTITY_QUERY_KEY = ["email-personal-identity"] as const;

export type MyEmailIdentityRecord = {
  personal: PersonalEmailIdentity;
  profileFullName: string;
  profileJobTitle: string;
};

async function loadMyEmailIdentity(): Promise<MyEmailIdentityRecord> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return {
      personal: emptyPersonalEmailIdentity(),
      profileFullName: "",
      profileJobTitle: "",
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, job_title, email_identity")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Column may not exist until migration 364 is applied — fail soft for personal fields.
    if (/email_identity/i.test(error.message)) {
      const fallback = await supabase
        .from("profiles")
        .select("full_name, job_title")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1)
        .maybeSingle();
      return {
        personal: emptyPersonalEmailIdentity(),
        profileFullName: String(fallback.data?.full_name ?? "").trim(),
        profileJobTitle: String(fallback.data?.job_title ?? "").trim(),
      };
    }
    throw new Error(error.message);
  }

  return {
    personal: normalizePersonalEmailIdentity(data?.email_identity),
    profileFullName: String(data?.full_name ?? "").trim(),
    profileJobTitle: String(data?.job_title ?? "").trim(),
  };
}

export function useMyEmailIdentity(enabled = true) {
  return useQuery({
    queryKey: MY_EMAIL_IDENTITY_QUERY_KEY,
    queryFn: loadMyEmailIdentity,
    enabled,
  });
}

export function useSaveMyEmailIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personal: PersonalEmailIdentity;
      jobTitle: string;
    }) => {
      const payload = personalEmailIdentityToPersist(input.personal);
      const { data, error } = await supabase.rpc("save_my_email_identity", {
        p_email_identity: payload,
        p_job_title: input.jobTitle.trim(),
      });
      if (error) throw new Error(error.message);

      return normalizePersonalEmailIdentity(data ?? payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_EMAIL_IDENTITY_QUERY_KEY });
    },
  });
}
