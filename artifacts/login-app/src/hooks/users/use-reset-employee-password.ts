import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ResetEmployeePasswordInput = {
  companyId: string;
  targetUserId: string;
  newPassword: string;
  confirmPassword: string;
};

export type ResetEmployeePasswordResult = {
  ok: true;
  companyId: string;
  targetUserId: string;
  targetEmail: string;
};

function mapErrorCode(code: string | undefined): string {
  switch (code) {
    case "password_mismatch":
      return "password_mismatch";
    case "password_policy":
    case "password_invalid":
      return "password_policy";
    case "unauthorized":
    case "request_denied":
    case "missing_permission":
      return "unauthorized";
    case "company_mismatch":
    case "caller_missing_company":
      return "unauthorized";
    case "target_not_found":
    case "target_no_company":
    case "invalid_target":
      return "target_not_found";
    case "target_is_super_admin":
      return "target_is_super_admin";
    case "auth_provider_failure":
      return "auth_provider_failure";
    default:
      return "generic";
  }
}

function extractInvokeErrorCode(data: unknown): string {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error != null) {
    return mapErrorCode(String((data as { error: unknown }).error));
  }
  return mapErrorCode("generic");
}

export function useResetEmployeePassword() {
  return useMutation({
    mutationFn: async (input: ResetEmployeePasswordInput): Promise<ResetEmployeePasswordResult> => {
      const { data, error } = await supabase.functions.invoke("reset-employee-password", {
        body: {
          companyId: input.companyId,
          targetUserId: input.targetUserId,
          newPassword: input.newPassword,
          confirmPassword: input.confirmPassword,
        },
      });

      if (error) {
        throw new Error(extractInvokeErrorCode(data));
      }
      if (data?.error) {
        throw new Error(mapErrorCode(String(data.error)));
      }
      if (!data?.ok) {
        throw new Error(mapErrorCode("generic"));
      }
      // Never accept a password field even if a buggy server added one.
      if (data && typeof data === "object" && ("password" in data || "newPassword" in data)) {
        throw new Error(mapErrorCode("generic"));
      }

      return {
        ok: true,
        companyId: String(data.companyId),
        targetUserId: String(data.targetUserId),
        targetEmail: String(data.targetEmail),
      };
    },
  });
}
