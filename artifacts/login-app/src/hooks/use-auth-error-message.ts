import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { translateAuthError, type AuthErrorLike } from "@/lib/auth-errors";

export function useAuthErrorMessage() {
  const { t } = useTranslation("common");

  return useCallback(
    (error: AuthErrorLike | string | null | undefined) => translateAuthError(error, t),
    [t],
  );
}
