import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { useToast } from "@/hooks/use-toast";
import { useResetEmployeePassword } from "@/hooks/users/use-reset-employee-password";

export type ResetEmployeePasswordTarget = {
  id: string;
  email: string;
  full_name?: string | null;
  company_id: string | null;
};

type Props = {
  user: ResetEmployeePasswordTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function validateLocal(password: string, confirm: string): string | null {
  if (!password || !confirm) return "required";
  if (password !== confirm) return "password_mismatch";
  if (password.length < 8) return "password_policy";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "password_policy";
  }
  return null;
}

export function ResetEmployeePasswordDialog({ user, open, onOpenChange }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const resetMutation = useResetEmployeePassword();
  const submittingRef = useRef(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirm("");
      setFieldError(null);
      setShowPassword(false);
      setShowConfirm(false);
      submittingRef.current = false;
    }
  }, [open, user?.id]);

  const canSubmit = useMemo(() => {
    return Boolean(user?.id && user.company_id && password && confirm && !resetMutation.isPending);
  }, [user?.id, user?.company_id, password, confirm, resetMutation.isPending]);

  const handleSubmit = async () => {
    if (submittingRef.current || resetMutation.isPending || !user?.id || !user.company_id) return;
    const localError = validateLocal(password, confirm);
    if (localError) {
      setFieldError(localError);
      return;
    }

    submittingRef.current = true;
    setFieldError(null);
    const pwd = password;
    const conf = confirm;
    setPassword("");
    setConfirm("");

    try {
      await resetMutation.mutateAsync({
        companyId: user.company_id,
        targetUserId: user.id,
        newPassword: pwd,
        confirmPassword: conf,
      });
      toast({
        title: t("companyWorkspace.employees.toasts.resetPasswordTitle"),
        description: t("companyWorkspace.employees.toasts.resetPasswordDescription"),
      });
      onOpenChange(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : "generic";
      setFieldError(code);
      toast({
        title: t("companyWorkspace.employees.toasts.errorTitle"),
        description: t(`companyWorkspace.employees.resetPassword.errors.${code}`, {
          defaultValue: t("companyWorkspace.employees.resetPassword.errors.generic"),
        }),
        variant: "destructive",
      });
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("companyWorkspace.employees.resetPassword.title")}</DialogTitle>
          <DialogDescription>
            {t("companyWorkspace.employees.resetPassword.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("companyWorkspace.employees.resetPassword.employee")}
              </p>
              <p className="font-medium">{user?.full_name || user?.email || "—"}</p>
            </div>
            <div className="min-w-0 text-start">
              <p className="text-xs text-muted-foreground">
                {t("companyWorkspace.employees.resetPassword.loginEmail")}
              </p>
              <p className="break-all font-medium text-start">
                <bdi dir="ltr">{user?.email || "—"}</bdi>
              </p>
            </div>
          </div>

          {user && !user.company_id ? (
            <p className="text-sm text-destructive">
              {t("companyWorkspace.employees.resetPassword.errors.target_not_found")}
            </p>
          ) : null}

          <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {t("companyWorkspace.employees.resetPassword.sessionWarning")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="reset-employee-password">
              {t("companyWorkspace.employees.resetPassword.newPassword")}
            </Label>
            <div className="relative">
              <Input
                id="reset-employee-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pe-10"
                disabled={!user}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword
                    ? t("companyWorkspace.employees.resetPassword.hidePassword")
                    : t("companyWorkspace.employees.resetPassword.showPassword")
                }
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
            <p className="text-[11px] text-muted-foreground">
              {t("companyWorkspace.employees.resetPassword.policyHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-employee-password-confirm">
              {t("companyWorkspace.employees.resetPassword.confirmPassword")}
            </Label>
            <div className="relative">
              <Input
                id="reset-employee-password-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="pe-10"
                disabled={!user}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-muted-foreground"
                onClick={() => setShowConfirm((value) => !value)}
                aria-label={
                  showConfirm
                    ? t("companyWorkspace.employees.resetPassword.hidePassword")
                    : t("companyWorkspace.employees.resetPassword.showPassword")
                }
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {fieldError ? (
            <p className="text-sm text-destructive">
              {t(`companyWorkspace.employees.resetPassword.errors.${fieldError}`, {
                defaultValue: t("companyWorkspace.employees.resetPassword.errors.generic"),
              })}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resetMutation.isPending}
          >
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            data-testid="reset-employee-password-submit"
          >
            {resetMutation.isPending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
            {t("companyWorkspace.employees.resetPassword.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
