import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { clearPasswordSetupIntent } from "@/lib/auth-redirect";
import { waitForRecoverySession } from "@/lib/auth-session";
import { supabase } from "@/lib/supabase";

type ResetPasswordFormValues = {
  password: string;
  confirmPassword: string;
};

export default function ResetPassword() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const authErrorMessage = useAuthErrorMessage();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    password: z.string().min(6, t("auth.validation.passwordMin")),
    confirmPassword: z.string().min(6, t("auth.validation.passwordMin")),
  }).refine((values) => values.password === values.confirmPassword, {
    message: t("auth.resetPassword.passwordMismatch"),
    path: ["confirmPassword"],
  });

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const { session, error: sessionError } = await waitForRecoverySession();

      if (cancelled) {
        return;
      }

      if (sessionError) {
        setError(authErrorMessage(sessionError));
        return;
      }

      if (!session) {
        setError(authErrorMessage({ message: "invalid recovery link expired" }));
        return;
      }

      setReady(true);
    }

    void establishRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [authErrorMessage]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      form.setError("root", { message: authErrorMessage(updateError) });
      return;
    }

    await supabase.auth.signOut();
    clearPasswordSetupIntent();

    toast({
      title: t("auth.resetPassword.successTitle"),
      description: t("auth.resetPassword.successDescription"),
    });
    setLocation("/login");
  };

  if (error) {
    return (
      <AuthLayout title={t("auth.resetPassword.errorTitle")} subtitle={t("auth.resetPassword.errorSubtitle")}>
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button asChild className="w-full mt-6">
          <Link href="/forgot-password">{t("auth.resetPassword.requestNewLink")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthLayout title={t("auth.resetPassword.title")} subtitle={t("auth.resetPassword.subtitle")}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center font-medium">
              {form.formState.errors.root.message}
            </div>
          )}
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">{t("auth.resetPassword.newPassword")}</FormLabel>
              <FormControl>
                <Input type="password" className="bg-background/50 border-white/10 h-12" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="confirmPassword" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">{t("auth.resetPassword.confirmPassword")}</FormLabel>
              <FormControl>
                <Input type="password" className="bg-background/50 border-white/10 h-12" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" className="w-full h-12" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("auth.resetPassword.submit")}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
