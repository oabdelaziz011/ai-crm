import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { useTranslation } from "react-i18next";

type RegisterFormValues = {
  fullName: string;
  jobTitle: string;
  email: string;
  password: string;
};

export default function Register() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading, signUp } = useAuth();
  const authErrorMessage = useAuthErrorMessage();

  const registerSchema = z.object({
    fullName: z.string().trim().min(1, t("auth.validation.fullName", { defaultValue: "Full name is required" })),
    jobTitle: z.string().trim().min(1, t("auth.validation.jobTitle", { defaultValue: "Job title is required" })),
    email: z.string().email(t("auth.validation.email")),
    password: z.string().min(6, t("auth.validation.passwordMin")),
  });

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      jobTitle: "Owner",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    const { error, needsEmailConfirmation } = await signUp(values.email, values.password, {
      fullName: values.fullName,
      jobTitle: values.jobTitle.trim() || "Owner",
    });
    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
    } else if (needsEmailConfirmation) {
      toast({
        title: t("auth.register.confirmEmailTitle"),
        description: t("auth.register.confirmEmailDescription"),
      });
      setLocation("/login");
    } else {
      toast({
        title: t("auth.register.successTitle"),
        description: t("auth.register.successDescription"),
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
    <AuthLayout
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center font-medium">
              {form.formState.errors.root.message}
            </div>
          )}
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">
                  {t("auth.register.fullName", { defaultValue: "Full name" })}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("auth.placeholders.fullName", { defaultValue: "Ahmed Hassan" })}
                    className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="jobTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">
                  {t("auth.register.ownerJobTitle", { defaultValue: "Owner job title" })}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("auth.placeholders.jobTitle", { defaultValue: "Owner" })}
                    className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12"
                    {...field}
                  />
                </FormControl>
                <p className="text-[11px] text-muted-foreground">
                  {t("auth.register.jobTitleHint", {
                    defaultValue: "Descriptive only — permissions come from roles.",
                  })}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">{t("auth.register.identity")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={t("auth.placeholders.email")}
                    className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12"
                    {...field}
                  />
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
                <FormLabel className="text-muted-foreground">{t("auth.register.passkey")}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={t("auth.placeholders.password")}
                    className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium group transition-all"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {t("auth.register.submit")}
                <UserPlus className="w-4 h-4 ms-2" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        {t("auth.register.already")}{" "}
        <Link href="/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
          {t("auth.register.authenticateHere")}
        </Link>
      </div>
    </AuthLayout>
  );
}
