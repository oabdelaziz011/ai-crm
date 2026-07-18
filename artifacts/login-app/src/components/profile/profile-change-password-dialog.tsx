import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import {
  updateAuthenticatedPassword,
  verifyCurrentPassword,
} from "@/lib/auth-password-verify";

type ProfileChangePasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
};

type ChangePasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ProfileChangePasswordDialog({
  open,
  onOpenChange,
  email,
}: ProfileChangePasswordDialogProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const authErrorMessage = useAuthErrorMessage();

  const schema = z
    .object({
      currentPassword: z.string().min(1, t("profiles.changePassword.currentRequired")),
      newPassword: z.string().min(6, t("auth.validation.passwordMin")),
      confirmPassword: z.string().min(6, t("auth.validation.passwordMin")),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t("auth.resetPassword.passwordMismatch"),
      path: ["confirmPassword"],
    })
    .refine((values) => values.currentPassword !== values.newPassword, {
      message: t("profiles.changePassword.mustDiffer"),
      path: ["newPassword"],
    });

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset();
    }
    onOpenChange(nextOpen);
  };

  const onSubmit = async (values: ChangePasswordFormValues) => {
    const resolvedEmail = email?.trim();
    if (!resolvedEmail) {
      form.setError("root", { message: t("profiles.loadFailed") });
      return;
    }

    const { error: verifyError } = await verifyCurrentPassword(
      resolvedEmail,
      values.currentPassword,
    );

    if (verifyError) {
      form.setError("currentPassword", {
        message: authErrorMessage(verifyError),
      });
      return;
    }

    const { error: updateError } = await updateAuthenticatedPassword(values.newPassword);

    if (updateError) {
      form.setError("root", { message: authErrorMessage(updateError) });
      return;
    }

    toast({
      title: t("profiles.changePassword.successTitle"),
      description: t("profiles.changePassword.successDescription"),
    });

    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 border-white/10">
        <DialogHeader>
          <DialogTitle>{t("profiles.changePassword.title")}</DialogTitle>
          <DialogDescription>{t("profiles.changePassword.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profiles.changePassword.currentPassword")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      className="bg-background/50 border-white/10"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profiles.changePassword.newPassword")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      className="bg-background/50 border-white/10"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profiles.changePassword.confirmPassword")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      className="bg-background/50 border-white/10"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="border-white/10"
                onClick={() => handleOpenChange(false)}
              >
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("profiles.changePassword.submit")
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
