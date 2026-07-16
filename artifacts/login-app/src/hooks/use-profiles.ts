import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile, ProfileInsert, ProfileUpdate } from "@/lib/types";

export const PROFILES_KEY = ["profiles"] as const;

export function useProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Profile[];
    },
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ProfileInsert) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .insert({ ...values, user_id: user.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProfileUpdate }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(values)
        .eq("user_id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("user_id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}
