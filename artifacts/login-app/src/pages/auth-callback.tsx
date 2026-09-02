import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { RESET_PASSWORD_PATH, shouldRouteToPasswordSetup } from "@/lib/auth-redirect";
import { completeAuthCallbackRoute } from "@/lib/auth-session";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";

function readAuthCallbackUrlError(): { code: string | null; description: string | null } {
  if (typeof window === "undefined") {
    return { code: null, description: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get("error_code") ?? params.get("error"),
    description: params.get("error_description"),
  };
}

export default function AuthCallback() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const authErrorMessage = useAuthErrorMessage();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCallback() {
      const urlError = readAuthCallbackUrlError();
      if (urlError.code || urlError.description) {
        if (!cancelled) {
          setError(
            authErrorMessage({
              code: urlError.code ?? undefined,
              message: urlError.description ?? urlError.code ?? "invalid authentication link expired",
            }),
          );
        }
        return;
      }

      const { session, event, error: sessionError, nextPath } = await completeAuthCallbackRoute();

      if (cancelled) {
        return;
      }

      if (sessionError) {
        setError(authErrorMessage(sessionError));
        return;
      }

      if (!session) {
        setError(authErrorMessage({ message: "invalid authentication link expired" }));
        return;
      }

      if (shouldRouteToPasswordSetup(event, nextPath)) {
        setLocation(RESET_PASSWORD_PATH);
        return;
      }

      setLocation(nextPath);
    }

    void runCallback();

    return () => {
      cancelled = true;
    };
  }, [authErrorMessage, setLocation]);

  if (error) {
    return (
      <AuthLayout title={t("auth.callback.errorTitle")} subtitle={t("auth.callback.errorSubtitle")}>
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button asChild className="w-full mt-6">
          <Link href="/forgot-password">{t("auth.resetPassword.requestNewLink")}</Link>
        </Button>
        <div className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
            {t("auth.callback.backToLogin")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
