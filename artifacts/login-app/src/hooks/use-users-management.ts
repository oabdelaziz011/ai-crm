import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string | null;
};

export const USERS_MANAGEMENT_KEY = ["users-management"] as const;

export function useManagedUsers() {
  return useQuery({
    queryKey: USERS_MANAGEMENT_KEY,
    queryFn: async (): Promise<ManagedUser[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, company_id, is_active, is_super_admin, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ManagedUser[];
    },
  });
}

type CreateUserInput = {
  email: string;
  fullName: string;
  companyId: string | null;
  isActive: boolean;
};

export function useCreateManagedUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const normalizedEmail = input.email.trim().toLowerCase();

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingProfile?.id) {
        throw new Error("User already exists");
      }

      const { error: inviteError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: input.fullName,
          },
        },
      });

      if (inviteError) {
        throw new Error(inviteError.message);
      }

      const { data: createdProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (!createdProfile?.id) {
        throw new Error("User was invited but profile was not created yet. Try again in a few seconds.");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: input.fullName,
          company_id: input.companyId,
          is_active: input.isActive,
        })
        .eq("id", createdProfile.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_MANAGEMENT_KEY }),
  });
}

type UpdateUserInput = {
  id: string;
  full_name?: string;
  company_id?: string | null;
  is_active?: boolean;
};

export function useUpdateManagedUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      const { id, ...values } = input;
      const { error } = await supabase.from("profiles").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_MANAGEMENT_KEY }),
  });
}

export function useResetManagedUserPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) throw new Error(error.message);
    },
  });
}
