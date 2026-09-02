import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ResetCompanyAdminPasswordInput = {
  companyId: string;
  adminUserId: string;
  newPassword: string;
  confirmPassword: string;
};

export type ResetCompanyAdminPasswordResult = {
  ok: true;
  companyId: string;
  adminUserId: string;
  adminEmail: string;
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
      return "unauthorized";
    case "auth_provider_failure":
      return "auth_provider_failure";
    case "session_invalidation_failure":
      return "session_invalidation_failure";
    case "invalid_company":
      return "company_not_found";
    default:
      return "generic";
  }
}

function extractInvokeErrorCode(data: unknown, _error: unknown): string {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error != null) {
    return mapErrorCode(String((data as { error: unknown }).error));
  }
  // Non-2xx Function responses often put JSON on error.context; never surface raw bodies.
  return mapErrorCode("generic");
}

export function useResetCompanyAdminPassword() {
  return useMutation({
    mutationFn: async (input: ResetCompanyAdminPasswordInput): Promise<ResetCompanyAdminPasswordResult> => {
      const { data, error } = await supabase.functions.invoke("reset-company-admin-password", {
        body: {
          companyId: input.companyId,
          adminUserId: input.adminUserId,
          newPassword: input.newPassword,
          confirmPassword: input.confirmPassword,
        },
      });

      if (error) {
        throw new Error(extractInvokeErrorCode(data, error));
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
        adminUserId: String(data.adminUserId),
        adminEmail: String(data.adminEmail),
      };
    },
  });
}
