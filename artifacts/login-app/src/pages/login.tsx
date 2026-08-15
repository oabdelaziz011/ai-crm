import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { hasPendingPasswordSetupIntent, RESET_PASSWORD_PATH } from "@/lib/auth-redirect";
import { AUTH_CONTROL_CLASS } from "@/lib/auth/auth-field-styles";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type LoginFormValues = {
  email: string;
  password: string;
};

export default function Login() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading, signIn } = useAuth();
  const authErrorMessage = useAuthErrorMessage();

  const loginSchema = z.object({
    email: z.string().email(t("auth.validation.email")),
    password: z.string().min(6, t("auth.validation.passwordMin")),
  });

  useEffect(() => {
    if (!user) return;
    if (hasPendingPasswordSetupIntent()) {
      setLocation(RESET_PASSWORD_PATH);
      return;
    }
    setLocation("/dashboard");
  }, [user, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    const { error } = await signIn(values.email, values.password);
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
    } else {
      toast({
        title: t("auth.login.successTitle"),
        description: t("auth.login.successDescription"),
      });
      setLocation("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthLayout subtitle={t("auth.login.subtitle")}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center font-medium">
              {form.formState.errors.root.message}
            </div>
          )}
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">{t("auth.login.identity")}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.placeholders.email")}
                  className={cn(AUTH_CONTROL_CLASS)}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">{t("auth.login.passkey")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={t("auth.placeholders.password")}
                  className={cn(AUTH_CONTROL_CLASS, "font-mono tracking-widest")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium group transition-all"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {t("auth.login.submit")}
                <ArrowRight className="w-4 h-4 ms-2 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/forgot-password" className="text-primary hover:text-primary/80 transition-colors font-medium">
          {t("auth.login.forgotPassword")}
        </Link>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        {t("auth.login.noAccess")}{" "}
        <Link href="/register" className="text-primary hover:text-primary/80 transition-colors font-medium">
          {t("auth.login.requestEntry")}
        </Link>
      </div>
    </AuthLayout>
  );
}
