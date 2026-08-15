import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { getPasswordSetupCallbackUrl, rememberPasswordSetupIntent } from "@/lib/auth-redirect";
import { AUTH_CONTROL_CLASS } from "@/lib/auth/auth-field-styles";
import { supabase } from "@/lib/supabase";

type ForgotPasswordFormValues = {
  email: string;
};

export default function ForgotPassword() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const authErrorMessage = useAuthErrorMessage();

  const schema = z.object({
    email: z.string().email(t("auth.validation.email")),
  });

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    rememberPasswordSetupIntent();

    const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim().toLowerCase(), {
      redirectTo: getPasswordSetupCallbackUrl(),
    });

    if (error) {
      form.setError("root", { message: authErrorMessage(error) });
      return;
    }

    toast({
      title: t("auth.forgotPassword.successTitle"),
      description: t("auth.forgotPassword.successDescription"),
    });
    form.reset();
  };

  return (
    <AuthLayout title={t("auth.forgotPassword.title")} subtitle={t("auth.forgotPassword.subtitle")}>
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
                <Input type="email" placeholder={t("auth.placeholders.email")} className={AUTH_CONTROL_CLASS} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" className="w-full h-12" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("auth.forgotPassword.submit")}
          </Button>
        </form>
      </Form>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
          {t("auth.forgotPassword.backToLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
