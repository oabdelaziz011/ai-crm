import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Loader2, UserPlus } from "lucide-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { useAuthErrorMessage } from "@/hooks/use-auth-error-message";
import { useOnboardOwnCompany } from "@/hooks/companies/use-company-onboarding";
import { usePlans } from "@/hooks/use-plans";
import { useToast } from "@/hooks/use-toast";
import { AUTH_CONTROL_CLASS } from "@/lib/auth/auth-field-styles";
import { resolveAuthErrorKey } from "@/lib/auth-errors";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { persistPreferredLanguage } from "@/lib/i18n/persist-preferred-language";
import { isAppLanguage } from "@/lib/i18n/resolve-app-language";
import {
  clearAwaitingCompanyMembership,
  clearPendingCompanyOnboarding,
  COMPANY_BUSINESS_TYPES,
  COMPANY_INDUSTRIES,
  COMPANY_ONBOARDING_CURRENCIES,
  OWNER_JOB_TITLE_OPTIONS,
  buildCompanyOnboardingPayload,
  buildOwnerDisplayName,
  emptyCompanyOnboardingValues,
  markAwaitingCompanyMembership,
  markCompanyOnboardingCompleted,
  savePendingCompanyOnboarding,
  validateCompanyOnboardingStep,
  type CompanyOnboardingFieldErrors,
  type CompanyOnboardingValues,
} from "@/lib/companies/onboarding";
import { supabase } from "@/lib/supabase";
import {
  COMPANY_GEO_COUNTRIES,
  geoLabel,
  getCitiesForCountry,
  withLegacyOption,
} from "@/lib/companies/geo";
import { PROFILE_TIMEZONE_OPTIONS } from "@/lib/profile-timezones";
import { cn } from "@/lib/utils";

type RegisterStepId = "account" | "company" | "business" | "plan" | "review";

const REGISTER_STEPS: readonly RegisterStepId[] = [
  "account",
  "company",
  "business",
  "plan",
  "review",
] as const;

type AccountDraft = {
  fullName: string;
  jobTitle: string;
  email: string;
  password: string;
  phone: string;
};

type AccountFieldErrors = Partial<Record<keyof AccountDraft, string>>;

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function ownerJobTitleLabel(
  value: string,
  translate: (key: string) => string,
): string {
  const option = OWNER_JOB_TITLE_OPTIONS.find((item) => item.value === value);
  return option
    ? translate(`companyOnboarding.ownerJobTitles.${option.i18nKey}`)
    : value;
}

const REGISTER_FIELD_IDS: Record<string, string> = {
  fullName: "reg-full-name",
  jobTitle: "reg-job-title",
  email: "reg-email",
  password: "reg-password",
  phone: "reg-phone",
  name: "reg-name",
  legalName: "reg-legal",
  businessType: "reg-business-type",
  industry: "reg-industry",
  contactEmail: "reg-contact-email",
  contactPhone: "reg-contact-phone",
  website: "reg-website",
  country: "reg-country",
  city: "reg-city",
  address: "reg-address",
  timezone: "reg-timezone",
  currency: "reg-currency",
};

function scrollToFirstError(fieldKey: string | undefined) {
  if (!fieldKey) return;
  const id = REGISTER_FIELD_IDS[fieldKey];
  if (!id) return;
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(id)?.focus?.();
  });
}

const MIN_PASSWORD_LENGTH = 6;

function validateAccountStep(account: AccountDraft): AccountFieldErrors {
  const errors: AccountFieldErrors = {};
  if (!account.fullName.trim()) errors.fullName = "required";
  if (!account.jobTitle.trim()) errors.jobTitle = "required";
  if (!account.phone.trim()) errors.phone = "required";
  else if (account.phone.trim().length > 40) errors.phone = "max";
  if (!account.email.trim()) errors.email = "required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())) {
    errors.email = "emailInvalid";
  }
  if (!account.password) errors.password = "required";
  else if (account.password.length < MIN_PASSWORD_LENGTH) errors.password = "passwordMin";
  return errors;
}

function isAccountStepValid(account: AccountDraft): boolean {
  return Object.keys(validateAccountStep(account)).length === 0;
}

function accountErrorMessage(
  field: keyof AccountDraft,
  code: string | undefined,
  translate: (key: string, options?: Record<string, string>) => string,
): string | undefined {
  if (!code) return undefined;
  if (field === "password") {
    if (code === "weakPassword") return translate("auth.errors.weakPassword");
    if (code === "required") {
      return translate("companyOnboarding.validation.required", {
        defaultValue: translate("auth.validation.passwordMin"),
      });
    }
    return translate("auth.validation.passwordMin");
  }
  if (field === "email") {
    if (code === "emailAlreadyExists") return translate("auth.errors.emailAlreadyExists");
    if (code === "emailInvalid" || code === "invalidEmail") {
      return translate("auth.validation.email");
    }
    return translate(`companyOnboarding.validation.${code}`, { defaultValue: code });
  }
  if (field === "phone") {
    return translate(`companyOnboarding.validation.${code}`, {
      defaultValue: translate("companyOnboarding.validation.required"),
    });
  }
  return translate(`companyOnboarding.validation.${code}`, { defaultValue: code });
}

function syncOwnerFromAccount(
  values: CompanyOnboardingValues,
  account: AccountDraft,
): CompanyOnboardingValues {
  const { first, last } = splitFullName(account.fullName);
  const displayName =
    values.ownerDisplayName.trim() ||
    account.fullName.trim() ||
    buildOwnerDisplayName(first, last, account.email);
  return {
    ...values,
    ownerFirstName: first,
    ownerLastName: last,
    ownerDisplayName: displayName,
    ownerEmail: account.email.trim(),
    ownerPhone:
      account.phone.trim() || values.ownerPhone.trim() || values.contactPhone.trim(),
    ownerJobTitle: account.jobTitle.trim() || "Owner",
    contactEmail: values.contactEmail.trim() || account.email.trim(),
    contactPhone: values.contactPhone.trim() || account.phone.trim(),
  };
}

export default function Register() {
  const { t, i18n } = useTranslation("common");
  const isRtl = i18n.dir() === "rtl";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, profile, isLoading, signUp, refreshAuthContext, applyCompanyMembership } =
    useAuth();
  const authErrorMessage = useAuthErrorMessage();
  const onboard = useOnboardOwnCompany();
  const { data: plans = [] } = usePlans();
  const submittingRef = useRef(false);
  const accountRef = useRef<AccountDraft>({
    fullName: "",
    jobTitle: "Owner",
    email: "",
    password: "",
    phone: "",
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [account, setAccount] = useState<AccountDraft>({
    fullName: "",
    jobTitle: "Owner",
    email: "",
    password: "",
    phone: "",
  });
  const [accountAttempted, setAccountAttempted] = useState(false);
  const [accountErrors, setAccountErrors] = useState<AccountFieldErrors>({});
  const [values, setValues] = useState<CompanyOnboardingValues>(() =>
    emptyCompanyOnboardingValues({ timezone: "Asia/Riyadh", currency: "SAR" }),
  );
  const [fieldErrors, setFieldErrors] = useState<CompanyOnboardingFieldErrors>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  accountRef.current = account;
  const accountValid = isAccountStepValid(account);

  const step = REGISTER_STEPS[stepIndex] ?? "account";
  const basicPlan = useMemo(
    () => plans.find((plan) => /basic/i.test(plan.name ?? "")) ?? plans[0] ?? null,
    [plans],
  );

  useEffect(() => {
    // Only leave register once the user already has a company — never interrupt
    // an in-progress signup/onboard attempt just because a session appeared.
    if (!user || isSubmitting) return;
    if (profile?.company_id) {
      setLocation("/dashboard");
    }
  }, [user, isSubmitting, profile?.company_id, setLocation]);

  const patchAccount = (partial: Partial<AccountDraft>) => {
    setAccount((prev) => {
      const next = { ...prev, ...partial };
      accountRef.current = next;
      return next;
    });
    setAccountErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(partial) as Array<keyof AccountDraft>) {
        delete next[key];
      }
      return next;
    });
    setRootError(null);
  };

  const validateAccountField = (field: keyof AccountDraft, draft?: AccountDraft) => {
    const source = draft ?? accountRef.current;
    const errors = validateAccountStep(source);
    setAccountErrors((prev) => {
      const next = { ...prev };
      if (errors[field]) next[field] = errors[field];
      else delete next[field];
      return next;
    });
  };

  const runAccountValidation = (draft = accountRef.current): AccountFieldErrors => {
    const errors = validateAccountStep(draft);
    setAccountErrors(errors);
    setAccountAttempted(true);
    return errors;
  };

  const patch = (partial: Partial<CompanyOnboardingValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
    setFieldErrors({});
    setRootError(null);
  };

  const goToStep = (next: RegisterStepId) => {
    const index = REGISTER_STEPS.indexOf(next);
    if (index >= 0) setStepIndex(index);
  };

  const handleBack = () => {
    if (stepIndex === 0 || isSubmitting) return;
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const handleNext = () => {
    if (step === "account") {
      const errors = runAccountValidation(accountRef.current);
      if (Object.keys(errors).length > 0) {
        scrollToFirstError(Object.keys(errors)[0]);
        return;
      }
      setValues((prev) => syncOwnerFromAccount(prev, accountRef.current));
      setStepIndex(1);
      return;
    }

    if (step === "company" || step === "business") {
      const errors = validateCompanyOnboardingStep(step, values);
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        scrollToFirstError(Object.keys(errors)[0]);
        return;
      }
    }

    setStepIndex((index) => Math.min(REGISTER_STEPS.length - 1, index + 1));
  };

  const handleCreate = async () => {
    if (submittingRef.current || isSubmitting) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setRootError(null);

    try {
      const accountCheck = runAccountValidation(accountRef.current);
      if (Object.keys(accountCheck).length > 0) {
        setStepIndex(0);
        scrollToFirstError(Object.keys(accountCheck)[0]);
        return;
      }

      for (const checkStep of ["company", "business", "owner"] as const) {
        const synced = syncOwnerFromAccount(values, accountRef.current);
        const errors = validateCompanyOnboardingStep(checkStep, synced);
        if (Object.keys(errors).length > 0) {
          setValues(synced);
          setFieldErrors(errors);
          setStepIndex(
            checkStep === "owner" ? 0 : REGISTER_STEPS.indexOf(checkStep as RegisterStepId),
          );
          scrollToFirstError(Object.keys(errors)[0]);
          return;
        }
      }

      const synced = syncOwnerFromAccount(values, accountRef.current);
      const payload = buildCompanyOnboardingPayload(synced, { mode: "first_time" });

      const { error, needsEmailConfirmation, session: signedInSession } = await signUp(
        accountRef.current.email.trim(),
        accountRef.current.password,
        {
          fullName: accountRef.current.fullName.trim(),
          jobTitle: accountRef.current.jobTitle.trim() || "Owner",
          phone: accountRef.current.phone.trim() || synced.ownerPhone.trim() || undefined,
          preferredLanguage: i18n.language,
        },
      );

      if (error) {
        const authKey = resolveAuthErrorKey(error);
        setStepIndex(0);
        if (authKey === "weakPassword") {
          setAccountErrors({ password: "weakPassword" });
          setRootError(null);
          scrollToFirstError("password");
        } else if (authKey === "emailAlreadyExists" || authKey === "invalidEmail") {
          setAccountErrors({
            email: authKey === "invalidEmail" ? "emailInvalid" : "emailAlreadyExists",
          });
          setRootError(null);
          scrollToFirstError("email");
        } else {
          setRootError(authErrorMessage(error));
        }
        return;
      }

      // Stash draft for email-confirm / retry paths only — not for opening a second wizard.
      savePendingCompanyOnboarding(payload);
      markAwaitingCompanyMembership();

      if (needsEmailConfirmation || !signedInSession) {
        toast({
          title: t("auth.register.confirmEmailTitle"),
          description: t("auth.register.confirmEmailOnboardingDescription", {
            defaultValue:
              "Confirm your email, then sign in — we will finish creating your company automatically.",
          }),
        });
        setLocation("/login");
        return;
      }

      // Make sure the session is usable for the onboard RPC.
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      if (!activeSession) {
        setRootError(t("auth.errors.unknownServerError"));
        return;
      }

      try {
        const lang = isAppLanguage(i18n.language)
          ? i18n.language
          : i18n.language?.toLowerCase().startsWith("ar")
            ? "ar"
            : "ar";
        await persistPreferredLanguage(lang);
        await i18n.changeLanguage(lang);
      } catch {
        /* language sync is best-effort */
      }

      try {
        const onboardResult = await onboard.mutateAsync(payload);
        applyCompanyMembership({
          companyId: onboardResult.companyId,
          companyName: onboardResult.company?.name ?? payload.name,
        });
        clearPendingCompanyOnboarding();
        clearAwaitingCompanyMembership();
        markCompanyOnboardingCompleted();
        toast({
          title: t("auth.register.successTitle"),
          description: t("auth.register.successOnboardingDescription", {
            defaultValue: "Your account and company are ready.",
          }),
        });
        setLocation("/dashboard");
        void refreshAuthContext();
      } catch (onboardError) {
        const message =
          onboardError instanceof Error
            ? onboardError.message
            : t("companyOnboarding.errors.generic");
        if (message === "company_already_assigned") {
          clearPendingCompanyOnboarding();
          clearAwaitingCompanyMembership();
          markCompanyOnboardingCompleted();
          await refreshAuthContext();
          setLocation("/dashboard");
          return;
        }
        // Stay on register — never dump the user into an empty second onboarding wizard.
        clearAwaitingCompanyMembership();
        setRootError(
          t(`companyOnboarding.errors.${message}`, {
            defaultValue: message,
          }),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("companyOnboarding.errors.generic");
      setRootError(
        t(`companyOnboarding.errors.${message}`, {
          defaultValue: message,
        }),
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
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
      wide
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
    >
      <nav
        className="mb-6 flex flex-wrap gap-2"
        aria-label={t("auth.register.progressLabel", { defaultValue: "Registration steps" })}
      >
        {REGISTER_STEPS.map((stepId, index) => {
          const active = index === stepIndex;
          const done = index < stepIndex;
          return (
            <button
              key={stepId}
              type="button"
              disabled={index > stepIndex || isSubmitting}
              onClick={() => {
                if (index <= stepIndex) setStepIndex(index);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active && "border-foreground/30 bg-foreground/5 text-foreground",
                done &&
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                !active && !done && "border-border/60 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                  active || done
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {t(`auth.register.steps.${stepId}.label`, {
                defaultValue: t(`companyOnboarding.steps.${stepId}.label`, {
                  defaultValue: stepId,
                }),
              })}
            </button>
          );
        })}
      </nav>

      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">
          {t(`auth.register.steps.${step}.title`, {
            defaultValue: t(`companyOnboarding.steps.${step}.title`, { defaultValue: step }),
          })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`auth.register.steps.${step}.description`, {
            defaultValue: t(`companyOnboarding.steps.${step}.description`, { defaultValue: "" }),
          })}
        </p>
      </div>

      {rootError ? (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
          {rootError}
        </div>
      ) : null}

      {step === "account" && (accountAttempted || Boolean(accountErrors.password)) && !accountValid ? (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
          {t("auth.register.formIncomplete")}
        </div>
      ) : null}

      <div className="min-h-[280px]">
        {step === "account" ? (
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleNext();
            }}
            noValidate
          >
            <div className="md:col-span-2">
              <Label htmlFor="reg-full-name">
                {t("auth.register.fullName")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-full-name"
                className={cn(
                  "mt-1.5",
                  AUTH_CONTROL_CLASS,
                  accountErrors.fullName && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={account.fullName}
                onChange={(event) => patchAccount({ fullName: event.target.value })}
                onBlur={() => validateAccountField("fullName")}
                placeholder={t("auth.placeholders.fullName", { defaultValue: "Ahmed Hassan" })}
                aria-invalid={Boolean(accountErrors.fullName)}
              />
              <FieldError
                message={
                  accountErrors.fullName
                    ? accountErrorMessage("fullName", accountErrors.fullName, t)
                    : undefined
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-job-title">
                {t("auth.register.ownerJobTitle")}
                <RequiredMark />
              </Label>
              <select
                id="reg-job-title"
                className={cn(
                  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm",
                  AUTH_CONTROL_CLASS,
                  accountErrors.jobTitle && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={account.jobTitle}
                onChange={(event) => patchAccount({ jobTitle: event.target.value })}
                onBlur={() => validateAccountField("jobTitle")}
              >
                <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                {OWNER_JOB_TITLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(`companyOnboarding.ownerJobTitles.${option.i18nKey}`)}
                  </option>
                ))}
                {!OWNER_JOB_TITLE_OPTIONS.some((option) => option.value === account.jobTitle) &&
                account.jobTitle.trim() ? (
                  <option value={account.jobTitle}>{account.jobTitle}</option>
                ) : null}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("auth.register.jobTitleHint")}
              </p>
              <FieldError
                message={
                  accountErrors.jobTitle
                    ? accountErrorMessage("jobTitle", accountErrors.jobTitle, t)
                    : undefined
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-phone">
                {t("companyOnboarding.fields.ownerPhone")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-phone"
                className={cn(
                  "mt-1.5",
                  AUTH_CONTROL_CLASS,
                  accountErrors.phone && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={account.phone}
                onChange={(event) => patchAccount({ phone: event.target.value })}
                onBlur={() => validateAccountField("phone")}
                placeholder={t("users.form.phonePlaceholder", { defaultValue: "+966…" })}
                aria-invalid={Boolean(accountErrors.phone)}
                dir="ltr"
              />
              <FieldError
                message={
                  accountErrors.phone
                    ? accountErrorMessage("phone", accountErrors.phone, t)
                    : undefined
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-email">
                {t("auth.register.identity")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-email"
                type="email"
                className={cn(
                  "mt-1.5",
                  AUTH_CONTROL_CLASS,
                  accountErrors.email && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={account.email}
                onChange={(event) => patchAccount({ email: event.target.value })}
                onBlur={() => validateAccountField("email")}
                placeholder={t("auth.placeholders.email")}
                aria-invalid={Boolean(accountErrors.email)}
              />
              <FieldError
                message={
                  accountErrors.email
                    ? accountErrorMessage("email", accountErrors.email, t)
                    : undefined
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-password">
                {t("auth.register.passkey")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-password"
                type="password"
                className={cn(
                  "mt-1.5",
                  AUTH_CONTROL_CLASS,
                  accountErrors.password && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={account.password}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                onChange={(event) => {
                  const password = event.target.value;
                  setAccount((prev) => {
                    const next = { ...prev, password };
                    accountRef.current = next;
                    return next;
                  });
                  setRootError(null);
                  if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
                    setAccountAttempted(true);
                  }
                  setAccountErrors((prev) => {
                    const updated = { ...prev };
                    if (!password) {
                      if (accountAttempted) updated.password = "required";
                      else delete updated.password;
                    } else if (password.length < MIN_PASSWORD_LENGTH) {
                      updated.password = "passwordMin";
                    } else {
                      delete updated.password;
                    }
                    return updated;
                  });
                }}
                onBlur={() => validateAccountField("password")}
                placeholder={t("auth.placeholders.password")}
                aria-invalid={Boolean(accountErrors.password)}
              />
              <PasswordStrengthMeter password={account.password} />
              {!accountErrors.password && !account.password ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("auth.validation.passwordMin")}
                </p>
              ) : null}
              <FieldError
                message={
                  accountErrors.password
                    ? accountErrorMessage("password", accountErrors.password, t)
                    : undefined
                }
              />
            </div>
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>
        ) : null}

        {step === "company" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="reg-name">
                {t("companyOnboarding.fields.name")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-name"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
              <FieldError
                message={
                  fieldErrors.name &&
                  t(`companyOnboarding.validation.${fieldErrors.name}`, {
                    defaultValue: fieldErrors.name,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-legal">
                {t("companyOnboarding.fields.legalName")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-legal"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.legalName}
                onChange={(event) => patch({ legalName: event.target.value })}
              />
              <FieldError
                message={
                  fieldErrors.legalName &&
                  t(`companyOnboarding.validation.${fieldErrors.legalName}`, {
                    defaultValue: fieldErrors.legalName,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-business-type">
                {t("companyOnboarding.fields.businessType")}
                <RequiredMark />
              </Label>
              <select
                id="reg-business-type"
                className={cn(
                  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
                )}
                value={values.businessType}
                onChange={(event) => patch({ businessType: event.target.value })}
              >
                <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                {COMPANY_BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`companyOnboarding.businessTypes.${type}`)}
                  </option>
                ))}
              </select>
              <FieldError
                message={
                  fieldErrors.businessType &&
                  t(`companyOnboarding.validation.${fieldErrors.businessType}`, {
                    defaultValue: fieldErrors.businessType,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-industry">
                {t("companyOnboarding.fields.industry")}
                <RequiredMark />
              </Label>
              <select
                id="reg-industry"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={values.industry}
                onChange={(event) => patch({ industry: event.target.value })}
              >
                <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                {COMPANY_INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {t(`companyOnboarding.industries.${industry}`)}
                  </option>
                ))}
              </select>
              <FieldError
                message={
                  fieldErrors.industry &&
                  t(`companyOnboarding.validation.${fieldErrors.industry}`, {
                    defaultValue: fieldErrors.industry,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-contact-email">
                {t("companyOnboarding.fields.contactEmail")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-contact-email"
                type="email"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.contactEmail}
                onChange={(event) => patch({ contactEmail: event.target.value })}
              />
              <FieldError
                message={
                  fieldErrors.contactEmail &&
                  t(`companyOnboarding.validation.${fieldErrors.contactEmail}`, {
                    defaultValue: fieldErrors.contactEmail,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-contact-phone">
                {t("companyOnboarding.fields.contactPhone")}
                <RequiredMark />
              </Label>
              <Input
                id="reg-contact-phone"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.contactPhone}
                onChange={(event) => patch({ contactPhone: event.target.value })}
                dir="ltr"
              />
              <FieldError
                message={
                  fieldErrors.contactPhone &&
                  t(`companyOnboarding.validation.${fieldErrors.contactPhone}`, {
                    defaultValue: fieldErrors.contactPhone,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-tax">{t("companyOnboarding.fields.taxId")}</Label>
              <Input
                id="reg-tax"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.taxId}
                onChange={(event) => patch({ taxId: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="reg-cr">
                {t("companyOnboarding.fields.commercialRegistration")}
              </Label>
              <Input
                id="reg-cr"
                className={cn("mt-1.5", AUTH_CONTROL_CLASS)}
                value={values.commercialRegistration}
                onChange={(event) => patch({ commercialRegistration: event.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="reg-website">{t("companyOnboarding.fields.website")}</Label>
              <Input
                id="reg-website"
                className={cn(
                  "mt-1.5",
                  AUTH_CONTROL_CLASS,
                  fieldErrors.website && "border-destructive focus-visible:ring-destructive/40",
                )}
                value={values.website}
                onChange={(event) => patch({ website: event.target.value })}
                placeholder="https://example.com"
                dir="ltr"
                aria-invalid={Boolean(fieldErrors.website)}
              />
              <FieldError
                message={
                  fieldErrors.website &&
                  t(`companyOnboarding.validation.${fieldErrors.website}`, {
                    defaultValue: fieldErrors.website,
                  })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="reg-description">
                {t("companyOnboarding.fields.description")}
              </Label>
              <Textarea
                id="reg-description"
                className="mt-1.5 min-h-[80px] border-border bg-background text-foreground"
                value={values.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        {step === "business" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="reg-country">
                {t("companyOnboarding.fields.country")}
                <RequiredMark />
              </Label>
              <select
                id="reg-country"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={values.country}
                onChange={(event) => {
                  const nextCountry = event.target.value;
                  const cities = getCitiesForCountry(nextCountry);
                  const stillValid = cities.some(
                    (c) =>
                      c.value === values.city ||
                      c.labelEn === values.city ||
                      c.labelAr === values.city,
                  );
                  patch({
                    country: nextCountry,
                    city: stillValid ? values.city : "",
                  });
                }}
              >
                <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                {withLegacyOption(COMPANY_GEO_COUNTRIES, values.country).map((option) => (
                  <option key={option.value} value={option.value}>
                    {geoLabel(option, i18n.language)}
                  </option>
                ))}
              </select>
              <FieldError
                message={
                  fieldErrors.country &&
                  t(`companyOnboarding.validation.${fieldErrors.country}`, {
                    defaultValue: fieldErrors.country,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reg-city">
                {t("companyOnboarding.fields.city")}
                <RequiredMark />
              </Label>
              <select
                id="reg-city"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={values.city}
                disabled={!values.country}
                onChange={(event) => patch({ city: event.target.value })}
              >
                <option value="">
                  {values.country
                    ? t("companyOnboarding.fields.selectPlaceholder")
                    : t("companyOnboarding.fields.selectCountryFirst")}
                </option>
                {withLegacyOption(getCitiesForCountry(values.country), values.city).map(
                  (option) => (
                    <option key={option.value} value={option.value}>
                      {geoLabel(option, i18n.language)}
                    </option>
                  ),
                )}
              </select>
              <FieldError
                message={
                  fieldErrors.city &&
                  t(`companyOnboarding.validation.${fieldErrors.city}`, {
                    defaultValue: fieldErrors.city,
                  })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="reg-address">{t("companyOnboarding.fields.address")}</Label>
              <Textarea
                id="reg-address"
                className="mt-1.5 min-h-[80px] border-border bg-background text-foreground"
                value={values.address}
                onChange={(event) => patch({ address: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="reg-timezone">
                {t("companyOnboarding.fields.timezone")}
                <RequiredMark />
              </Label>
              <select
                id="reg-timezone"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={values.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              >
                {PROFILE_TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="reg-currency">
                {t("companyOnboarding.fields.currency")}
                <RequiredMark />
              </Label>
              <select
                id="reg-currency"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={values.currency}
                onChange={(event) => patch({ currency: event.target.value })}
              >
                {COMPANY_ONBOARDING_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {step === "plan" ? (
          <div className="rounded-2xl border border-border/70 bg-muted/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("companyOnboarding.plan.readOnlyBadge")}
                </p>
                <h4 className="mt-1 text-xl font-semibold text-foreground">
                  {basicPlan?.name ?? t("companyOnboarding.plan.defaultName")}
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("companyOnboarding.plan.defaultDescription")}
                </p>
              </div>
              <div className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium">
                {t("companyOnboarding.plan.trialLabel")}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
                <dt className="text-xs text-muted-foreground">
                  {t("companyOnboarding.plan.interval")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {t("companyOnboarding.plan.monthly")}
                </dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
                <dt className="text-xs text-muted-foreground">
                  {t("companyOnboarding.plan.price")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {basicPlan
                    ? `${basicPlan.price_monthly ?? 0} / ${t("companyOnboarding.plan.month")}`
                    : t("companyOnboarding.plan.included")}
                </dd>
              </div>
              <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
                <dt className="text-xs text-muted-foreground">
                  {t("companyOnboarding.plan.status")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {t("status.trial")}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("companyOnboarding.plan.noPaymentHint")}
            </p>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            {(
              [
                {
                  id: "account" as const,
                  rows: [
                    ["fullName", account.fullName],
                    ["ownerJobTitle", ownerJobTitleLabel(account.jobTitle, t)],
                    ["identity", account.email],
                    ["ownerPhone", account.phone],
                  ],
                },
                {
                  id: "company" as const,
                  rows: [
                    ["name", values.name],
                    ["legalName", values.legalName],
                    [
                      "businessType",
                      values.businessType
                        ? t(`companyOnboarding.businessTypes.${values.businessType}`)
                        : "",
                    ],
                    [
                      "industry",
                      values.industry
                        ? t(`companyOnboarding.industries.${values.industry}`)
                        : "",
                    ],
                    ["contactEmail", values.contactEmail],
                    ["contactPhone", values.contactPhone],
                  ],
                },
                {
                  id: "business" as const,
                  rows: [
                    ["country", values.country],
                    ["city", values.city],
                    ["address", values.address],
                    ["timezone", values.timezone],
                    ["currency", values.currency],
                  ],
                },
                {
                  id: "plan" as const,
                  rows: [
                    ["plan", basicPlan?.name ?? t("companyOnboarding.plan.defaultName")],
                    ["status", t("status.trial")],
                  ],
                },
              ] as const
            ).map((section) => (
              <section
                key={section.id}
                className="rounded-2xl border border-border/70 bg-background"
              >
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    {t(`auth.register.review.${section.id}`, {
                      defaultValue: t(`companyOnboarding.review.${section.id}`, {
                        defaultValue: section.id,
                      }),
                    })}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => goToStep(section.id)}
                    disabled={isSubmitting}
                  >
                    {t("companyOnboarding.review.edit")}
                  </Button>
                </div>
                <dl className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
                  {section.rows
                    .filter(([, value]) => Boolean(String(value ?? "").trim()))
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">
                          {t(`auth.register.${key}`, {
                            defaultValue: t(`companyOnboarding.fields.${key}`, {
                              defaultValue: t(`companyOnboarding.plan.${key}`, {
                                defaultValue: key,
                              }),
                            }),
                          })}
                        </dt>
                        <dd className="mt-1 break-words text-sm font-medium text-foreground">
                          {value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          disabled={stepIndex === 0 || isSubmitting}
          className="gap-2"
        >
          {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          {t("companyOnboarding.actions.back")}
        </Button>

        {step !== "review" ? (
          <Button
            type="button"
            onClick={() => {
              if (step === "account" && !isAccountStepValid(accountRef.current)) {
                const errors = runAccountValidation(accountRef.current);
                scrollToFirstError(Object.keys(errors)[0]);
                return;
              }
              handleNext();
            }}
            disabled={isSubmitting}
            aria-disabled={step === "account" && !accountValid}
            className={cn("gap-2", step === "account" && !accountValid && "opacity-60")}
          >
            {t("companyOnboarding.actions.next")}
            {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSubmitting}
            className="min-w-[160px] gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t("auth.register.submit")}
                <UserPlus className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.register.already")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:text-primary/80"
        >
          {t("auth.register.authenticateHere")}
        </Link>
      </div>
    </AuthLayout>
  );
}
