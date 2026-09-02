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
import { useResetCompanyAdminPassword } from "@/hooks/companies/use-reset-company-admin-password";
import {
  resolveCompanyAdminLoginIdentity,
  type CompanyAdminLoginIdentity,
} from "@/lib/companies/resolve-company-admin-login";
import type { Company } from "@/lib/types";

type Props = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ResetCompanyAdminPasswordDialog({ company, open, onOpenChange }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const resetMutation = useResetCompanyAdminPassword();
  const submittingRef = useRef(false);

  const [admin, setAdmin] = useState<CompanyAdminLoginIdentity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company?.id) {
      setAdmin(null);
      setLoadError(null);
      setPassword("");
      setConfirm("");
      setFieldError(null);
      setShowPassword(false);
      setShowConfirm(false);
      submittingRef.current = false;
      return;
    }

    let cancelled = false;
    setLoadingAdmin(true);
    setLoadError(null);
    void resolveCompanyAdminLoginIdentity(company.id)
      .then((identity) => {
        if (cancelled) return;
        setAdmin(identity);
        if (!identity) setLoadError("admin_not_found");
      })
      .catch(() => {
        if (cancelled) return;
        setAdmin(null);
        setLoadError("admin_not_found");
      })
      .finally(() => {
        if (!cancelled) setLoadingAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, company?.id]);

  const canSubmit = useMemo(() => {
    return Boolean(company?.id && admin?.userId && password && confirm && !loadingAdmin && !resetMutation.isPending);
  }, [company?.id, admin?.userId, password, confirm, loadingAdmin, resetMutation.isPending]);

  const validateLocal = (): string | null => {
    if (!password || !confirm) return "required";
    if (password !== confirm) return "password_mismatch";
    if (password.length < 8) return "password_policy";
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return "password_policy";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current || resetMutation.isPending || !company?.id || !admin?.userId) return;
    const localError = validateLocal();
    if (localError) {
      setFieldError(localError);
      return;
    }

    submittingRef.current = true;
    setFieldError(null);
    const pwd = password;
    const conf = confirm;
    // Clear inputs immediately so refresh/reopen cannot expose the value.
    setPassword("");
    setConfirm("");

    try {
      await resetMutation.mutateAsync({
        companyId: company.id,
        adminUserId: admin.userId,
        newPassword: pwd,
        confirmPassword: conf,
      });
      toast({ title: t("companies.resetAdminPassword.success") });
      onOpenChange(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : "generic";
      setFieldError(code);
      toast({
        title: t("companies.resetAdminPassword.failed"),
        description: t(`companies.resetAdminPassword.errors.${code}`, {
          defaultValue: t("companies.resetAdminPassword.errors.generic"),
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
          <DialogTitle>{t("companies.resetAdminPassword.title")}</DialogTitle>
          <DialogDescription>{t("companies.resetAdminPassword.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("companies.table.name")}</p>
              <p className="font-medium">{company?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("companies.resetAdminPassword.administrator")}</p>
              <p className="font-medium">{admin?.fullName || admin?.email || "—"}</p>
            </div>
            <div className="min-w-0 text-start">
              <p className="text-xs text-muted-foreground">{t("companies.table.loginEmail")}</p>
              <p className="font-medium text-start break-all">
                {/* Keep LTR emails readable without pulling the value away from the RTL caption. */}
                {loadingAdmin ? (
                  t("common.loading", { defaultValue: "Loading…" })
                ) : (
                  <bdi dir="ltr">{admin?.email || "—"}</bdi>
                )}
              </p>
            </div>
            <div className="min-w-0 text-start">
              <p className="text-xs text-muted-foreground">{t("companies.table.email")}</p>
              <p className="font-medium text-start break-all">
                <bdi dir="ltr">{company?.contact_email || "—"}</bdi>
              </p>
            </div>
          </div>

          {loadError ? (
            <p className="text-sm text-destructive">
              {t(`companies.resetAdminPassword.errors.${loadError}`, {
                defaultValue: t("companies.resetAdminPassword.errors.generic"),
              })}
            </p>
          ) : null}

          <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {t("companies.resetAdminPassword.sessionWarning")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="reset-admin-password">{t("companies.resetAdminPassword.newPassword")}</Label>
            <div className="relative">
              <Input
                id="reset-admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
                disabled={!admin || Boolean(loadError)}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t("companies.resetAdminPassword.hidePassword") : t("companies.resetAdminPassword.showPassword")}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
            <p className="text-[11px] text-muted-foreground">{t("companies.resetAdminPassword.policyHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-admin-password-confirm">{t("companies.resetAdminPassword.confirmPassword")}</Label>
            <div className="relative">
              <Input
                id="reset-admin-password-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="pr-10"
                disabled={!admin || Boolean(loadError)}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-muted-foreground"
                onClick={() => setShowConfirm((value) => !value)}
                aria-label={showConfirm ? t("companies.resetAdminPassword.hidePassword") : t("companies.resetAdminPassword.showPassword")}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {fieldError ? (
            <p className="text-sm text-destructive">
              {t(`companies.resetAdminPassword.errors.${fieldError}`, {
                defaultValue: t("companies.resetAdminPassword.errors.generic"),
              })}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={resetMutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || Boolean(loadError)}>
            {resetMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("companies.resetAdminPassword.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
