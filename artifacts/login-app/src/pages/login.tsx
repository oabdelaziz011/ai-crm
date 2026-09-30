import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginExperienceLayout } from "@/components/auth/login-experience-layout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { hasPendingPasswordSetupIntent, RESET_PASSWORD_PATH } from "@/lib/auth-redirect";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Login-panel controls — scaled for premium desktop proportions. */
const LOGIN_CONTROL_CLASS =
  "h-14 rounded-[11px] border-slate-200 bg-white px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0D9488]/35 focus-visible:border-[#0D9488]/50";


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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <Loader2 className="w-8 h-8 animate-spin text-[#0D9488]" />
      </div>
    );
  }

  return (
    <LoginExperienceLayout subtitle={t("auth.login.subtitle")}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {form.formState.errors.root && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
              {form.formState.errors.root.message}
            </div>
          )}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[15px] font-medium text-slate-600">
                  {t("auth.login.identity")}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      className={cn(LOGIN_CONTROL_CLASS, "ps-11")}
                      autoComplete="email"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[15px] font-medium text-slate-600">
                  {t("auth.login.passkey")}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder={t("auth.placeholders.password")}
                      className={cn(LOGIN_CONTROL_CLASS, "ps-11 pe-11")}
                      autoComplete="current-password"
                      {...field}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-700"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")
                      }
                    >
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-between gap-3 pt-0.5 text-[15px]">
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-slate-600 select-none">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488]/40"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <span>{t("auth.login.rememberMe")}</span>
            </label>
            <Link
              href="/forgot-password"
              className="font-medium text-[#0D9488] transition-colors hover:text-[#0f766e]"
            >
              {t("auth.login.forgotPassword")}
            </Link>
          </div>

          <Button
            type="submit"
            className="h-14 w-full rounded-[11px] bg-[#0D9488] text-[16px] font-semibold text-white shadow-sm transition-all hover:bg-[#0f766e] group"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                {t("auth.login.submit")}
                <ArrowRight className="ms-2 size-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-5 text-center text-[15px] text-slate-500">
        {t("auth.login.noAccess")}{" "}
        <Link
          href="/register"
          className="font-semibold text-[#0D9488] transition-colors hover:text-[#0f766e]"
        >
          {t("auth.login.requestEntry")}
        </Link>
      </div>
    </LoginExperienceLayout>
  );
}
