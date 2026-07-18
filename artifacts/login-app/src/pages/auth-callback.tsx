import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { RESET_PASSWORD_PATH, shouldRouteToPasswordSetup } from "@/lib/auth-redirect";
import { completeAuthCallbackRoute } from "@/lib/auth-session";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";

export default function AuthCallback() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const authErrorMessage = useAuthErrorMessage();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCallback() {
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
          <Link href="/login">{t("auth.callback.backToLogin")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
