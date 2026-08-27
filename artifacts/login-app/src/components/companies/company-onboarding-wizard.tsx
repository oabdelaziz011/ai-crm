import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { useMyProfile } from "@/hooks/use-my-profile";
import { usePlans } from "@/hooks/use-plans";
import { useCreateManagedUser } from "@/hooks/use-users-management";
import {
  useCreateCompanyAdmin,
  useOnboardOwnCompany,
} from "@/hooks/companies/use-company-onboarding";
import { fetchAssignableRolesForCompany } from "@/lib/users/fetch-assignable-roles";
import { PROFILE_TIMEZONE_OPTIONS } from "@/lib/profile-timezones";
import { cn } from "@/lib/utils";
import {
  COMPANY_BUSINESS_TYPES,
  COMPANY_INDUSTRIES,
  COMPANY_ONBOARDING_CURRENCIES,
  COMPANY_ONBOARDING_STEPS,
  OWNER_JOB_TITLE_OPTIONS,
  buildCompanyOnboardingPayload,
  buildOwnerDisplayName,
  companyOnboardingValuesFromPayload,
  emptyCompanyOnboardingValues,
  loadPendingCompanyOnboarding,
  validateCompanyOnboardingStep,
  type CompanyOnboardingFieldErrors,
  type CompanyOnboardingMode,
  type CompanyOnboardingStepId,
  type CompanyOnboardingValues,
} from "@/lib/companies/onboarding";
import {
  COMPANY_GEO_COUNTRIES,
  geoLabel,
  getCitiesForCountry,
  resolveGeoDisplayLabel,
  withLegacyOption,
} from "@/lib/companies/geo";
import type { Company } from "@/lib/types";

type PrefillProfile = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  timezone?: string | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function splitFullName(fullName: string | null | undefined): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function resolveBillingProfile(company: Company | null | undefined) {
  const profile = company?.billing_profile;
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] ?? null : profile;
}

function resolvePrimaryBranch(company: Company | null | undefined) {
  const branch = company?.primary_branch;
  if (!branch) return null;
  return Array.isArray(branch) ? branch[0] ?? null : branch;
}

export function CompanyOnboardingWizard({
  open,
  mode,
  onOpenChange,
  onCompleted,
  initialValues,
}: {
  open: boolean;
  mode: CompanyOnboardingMode;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (company: Company) => void | Promise<void>;
  /** Prefill from registration pending payload when auto-onboard fails. */
  initialValues?: Partial<CompanyOnboardingValues>;
}) {
  const { t, i18n } = useTranslation("common");
  const { user, profile, refreshAuthContext } = useAuth();
  const myProfile = useMyProfile();
  const plansQuery = usePlans(open);
  const onboardOwn = useOnboardOwnCompany();
  const createAdmin = useCreateCompanyAdmin();
  const inviteOwner = useCreateManagedUser();

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<CompanyOnboardingValues>(() => emptyCompanyOnboardingValues());
  const [fieldErrors, setFieldErrors] = useState<CompanyOnboardingFieldErrors>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const step = COMPANY_ONBOARDING_STEPS[stepIndex] ?? "company";
  const isRtl = i18n.dir() === "rtl";
  const isSubmitting =
    onboardOwn.isPending || createAdmin.isPending || inviteOwner.isPending || submittingRef.current;

  const basicPlan = useMemo(() => {
    const plans = plansQuery.data ?? [];
    return (
      plans.find((plan) => plan.code === "basic" || plan.name === "Basic") ??
      plans[0] ??
      null
    );
  }, [plansQuery.data]);

  const prefill: PrefillProfile = useMemo(() => {
    const fullName = myProfile.data?.full_name ?? profile?.full_name ?? "";
    const { first, last } = splitFullName(fullName);
    return {
      firstName: first,
      lastName: last,
      displayName: fullName || user?.email?.split("@")[0] || "",
      email: myProfile.data?.email ?? user?.email ?? "",
      phone: myProfile.data?.phone ?? "",
      jobTitle: myProfile.data?.job_title ?? "Owner",
      timezone: myProfile.data?.timezone ?? profile?.timezone ?? "Asia/Riyadh",
    };
  }, [myProfile.data, profile, user?.email]);

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    setStepIndex(0);
    setFieldErrors({});
    setRootError(null);

    const pending = mode === "first_time" ? loadPendingCompanyOnboarding() : null;
    const fromPending = pending ? companyOnboardingValuesFromPayload(pending) : {};

    const next = emptyCompanyOnboardingValues({
      timezone: prefill.timezone || "Asia/Riyadh",
      currency: "SAR",
      ownerFirstName: mode === "first_time" ? prefill.firstName ?? "" : "",
      ownerLastName: mode === "first_time" ? prefill.lastName ?? "" : "",
      ownerDisplayName: mode === "first_time" ? prefill.displayName ?? "" : "",
      ownerEmail: mode === "first_time" ? prefill.email ?? "" : "",
      ownerPhone: mode === "first_time" ? prefill.phone ?? "" : "",
      ownerJobTitle: mode === "first_time" ? prefill.jobTitle || "Owner" : "Owner",
      contactEmail: mode === "first_time" ? prefill.email ?? "" : "",
      ...fromPending,
      ...initialValues,
    });
    if (next.ownerDisplayName && !next.ownerFirstName) {
      const parts = next.ownerDisplayName.trim().split(/\s+/).filter(Boolean);
      next.ownerFirstName = parts[0] ?? next.ownerFirstName;
      next.ownerLastName =
        parts.length > 1 ? parts.slice(1).join(" ") : parts[0] ?? next.ownerLastName;
    }
    if (mode === "first_time" && !next.ownerEmail && prefill.email) {
      next.ownerEmail = prefill.email;
    }
    if (mode === "first_time" && !next.contactEmail && prefill.email) {
      next.contactEmail = prefill.email;
    }
    setValues(next);
  }, [open, mode, prefill, initialValues]);

  const patch = (partial: Partial<CompanyOnboardingValues>) => {
    setValues((prev) => {
      const next = { ...prev, ...partial };
      if (
        ("ownerFirstName" in partial || "ownerLastName" in partial) &&
        !("ownerDisplayName" in partial)
      ) {
        next.ownerDisplayName = buildOwnerDisplayName(
          next.ownerFirstName,
          next.ownerLastName,
          next.ownerDisplayName,
        );
      }
      return next;
    });
  };

  const goToStep = (nextStep: CompanyOnboardingStepId) => {
    const index = COMPANY_ONBOARDING_STEPS.indexOf(nextStep);
    if (index >= 0) setStepIndex(index);
  };

  const validateCurrentStep = (): boolean => {
    if (step === "plan" || step === "review") {
      setFieldErrors({});
      return true;
    }
    const errors = validateCompanyOnboardingStep(step, values);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setRootError(null);
    setStepIndex((index) => Math.min(index + 1, COMPANY_ONBOARDING_STEPS.length - 1));
  };

  const handleBack = () => {
    setRootError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const mapSubmitError = (error: unknown): string => {
    const code = error instanceof Error ? error.message : "unknown";
    if (code === "company_already_assigned") {
      return t("companyOnboarding.errors.alreadyAssigned");
    }
    if (code === "forbidden" || code === "not_authenticated") {
      return t("companyOnboarding.errors.forbidden");
    }
    if (code === "duplicate_onboarding") {
      return t("companyOnboarding.errors.duplicate");
    }
    return error instanceof Error && error.message
      ? error.message
      : t("companyOnboarding.errors.generic");
  };

  const handleCreate = async () => {
    if (submittingRef.current || isSubmitting) return;
    for (const checkStep of ["company", "business", "owner"] as const) {
      const errors = validateCompanyOnboardingStep(checkStep, values);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        goToStep(checkStep);
        setRootError(t("companyOnboarding.errors.fixIncomplete"));
        return;
      }
    }

    submittingRef.current = true;
    setRootError(null);
    const payload = buildCompanyOnboardingPayload(values, { mode });

    try {
      if (mode === "first_time") {
        const result = await onboardOwn.mutateAsync(payload);
        await refreshAuthContext();
        await onCompleted?.(result.company);
        onOpenChange(false);
        return;
      }

      const created = await createAdmin.mutateAsync(payload);
      const roles = await fetchAssignableRolesForCompany(created.id);
      const adminRole =
        roles.find((role) => /admin/i.test(role.name ?? "")) ?? roles[0];
      if (!adminRole) {
        throw new Error(t("companyOnboarding.errors.ownerInviteNoRole"));
      }
      await inviteOwner.mutateAsync({
        email: values.ownerEmail.trim(),
        fullName:
          values.ownerDisplayName.trim() ||
          buildOwnerDisplayName(values.ownerFirstName, values.ownerLastName, values.ownerEmail),
        companyId: created.id,
        roleId: adminRole.id,
        isActive: true,
        jobTitle: values.ownerJobTitle.trim() || "Owner",
        phone: values.ownerPhone.trim() || undefined,
        timezone: values.timezone.trim() || undefined,
      });
      await onCompleted?.(created);
      onOpenChange(false);
    } catch (error) {
      setRootError(mapSubmitError(error));
    } finally {
      submittingRef.current = false;
    }
  };

  const canClose = mode === "admin_add" && !isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !canClose) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          "flex h-[min(92vh,880px)] w-[calc(100vw-1rem)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-2xl border border-border/70 bg-background p-0 sm:max-w-[920px]",
          mode === "first_time" && "[&>button]:hidden",
        )}
      >
        <div className="border-b border-border/60 px-5 py-4 sm:px-7">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {t("companyOnboarding.title")}
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "first_time"
              ? t("companyOnboarding.subtitleFirstTime")
              : t("companyOnboarding.subtitleAdmin")}
          </p>

          <nav className="mt-5 flex flex-wrap gap-2" aria-label={t("companyOnboarding.progressLabel")}>
            {COMPANY_ONBOARDING_STEPS.map((stepId, index) => {
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
                    done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    !active && !done && "border-border/60 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                      active || done ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {t(`companyOnboarding.steps.${stepId}.label`)}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-5">
            <h3 className="text-base font-semibold">
              {t(`companyOnboarding.steps.${step}.title`)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`companyOnboarding.steps.${step}.description`)}
            </p>
          </div>

          {rootError ? (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {rootError}
            </div>
          ) : null}

          {step === "company" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-1">
                <Label htmlFor="co-name">
                  {t("companyOnboarding.fields.name")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-name"
                  className="mt-1.5"
                  value={values.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
                <FieldError message={fieldErrors.name && t(`companyOnboarding.validation.${fieldErrors.name}`, { defaultValue: fieldErrors.name })} />
              </div>
              <div>
                <Label htmlFor="co-legal">
                  {t("companyOnboarding.fields.legalName")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-legal"
                  className="mt-1.5"
                  value={values.legalName}
                  onChange={(event) => patch({ legalName: event.target.value })}
                />
                <FieldError message={fieldErrors.legalName && t(`companyOnboarding.validation.${fieldErrors.legalName}`, { defaultValue: fieldErrors.legalName })} />
              </div>
              <div>
                <Label htmlFor="co-business-type">
                  {t("companyOnboarding.fields.businessType")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-business-type"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <FieldError message={fieldErrors.businessType && t(`companyOnboarding.validation.${fieldErrors.businessType}`, { defaultValue: fieldErrors.businessType })} />
              </div>
              <div>
                <Label htmlFor="co-industry">
                  {t("companyOnboarding.fields.industry")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-industry"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <FieldError message={fieldErrors.industry && t(`companyOnboarding.validation.${fieldErrors.industry}`, { defaultValue: fieldErrors.industry })} />
              </div>
              <div>
                <Label htmlFor="co-email">
                  {t("companyOnboarding.fields.contactEmail")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-email"
                  type="email"
                  className="mt-1.5"
                  value={values.contactEmail}
                  onChange={(event) => patch({ contactEmail: event.target.value })}
                />
                <FieldError message={fieldErrors.contactEmail && t(`companyOnboarding.validation.${fieldErrors.contactEmail}`, { defaultValue: fieldErrors.contactEmail })} />
              </div>
              <div>
                <Label htmlFor="co-phone">
                  {t("companyOnboarding.fields.contactPhone")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-phone"
                  className="mt-1.5"
                  value={values.contactPhone}
                  onChange={(event) => patch({ contactPhone: event.target.value })}
                  dir="ltr"
                />
                <FieldError message={fieldErrors.contactPhone && t(`companyOnboarding.validation.${fieldErrors.contactPhone}`, { defaultValue: fieldErrors.contactPhone })} />
              </div>
              <div>
                <Label htmlFor="co-website">{t("companyOnboarding.fields.website")}</Label>
                <Input
                  id="co-website"
                  className="mt-1.5"
                  value={values.website}
                  onChange={(event) => patch({ website: event.target.value })}
                  placeholder="https://"
                  dir="ltr"
                />
                <FieldError message={fieldErrors.website && t(`companyOnboarding.validation.${fieldErrors.website}`, { defaultValue: fieldErrors.website })} />
              </div>
              <div>
                <Label htmlFor="co-tax">{t("companyOnboarding.fields.taxId")}</Label>
                <Input
                  id="co-tax"
                  className="mt-1.5"
                  value={values.taxId}
                  onChange={(event) => patch({ taxId: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="co-cr">{t("companyOnboarding.fields.commercialRegistration")}</Label>
                <Input
                  id="co-cr"
                  className="mt-1.5"
                  value={values.commercialRegistration}
                  onChange={(event) => patch({ commercialRegistration: event.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="co-description">{t("companyOnboarding.fields.description")}</Label>
                <Textarea
                  id="co-description"
                  className="mt-1.5 min-h-[88px]"
                  value={values.description}
                  onChange={(event) => patch({ description: event.target.value })}
                />
              </div>
            </div>
          ) : null}

          {step === "business" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="co-country">
                  {t("companyOnboarding.fields.country")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-country"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <FieldError message={fieldErrors.country && t(`companyOnboarding.validation.${fieldErrors.country}`, { defaultValue: fieldErrors.country })} />
              </div>
              <div>
                <Label htmlFor="co-city">
                  {t("companyOnboarding.fields.city")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-city"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <FieldError message={fieldErrors.city && t(`companyOnboarding.validation.${fieldErrors.city}`, { defaultValue: fieldErrors.city })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="co-address">{t("companyOnboarding.fields.address")}</Label>
                <Textarea
                  id="co-address"
                  className="mt-1.5 min-h-[80px]"
                  value={values.address}
                  onChange={(event) => patch({ address: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="co-timezone">
                  {t("companyOnboarding.fields.timezone")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-timezone"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={values.timezone}
                  onChange={(event) => patch({ timezone: event.target.value })}
                >
                  {PROFILE_TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.timezone && t(`companyOnboarding.validation.${fieldErrors.timezone}`, { defaultValue: fieldErrors.timezone })} />
              </div>
              <div>
                <Label htmlFor="co-currency">
                  {t("companyOnboarding.fields.currency")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-currency"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={values.currency}
                  onChange={(event) => patch({ currency: event.target.value })}
                >
                  {COMPANY_ONBOARDING_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.currency && t(`companyOnboarding.validation.${fieldErrors.currency}`, { defaultValue: fieldErrors.currency })} />
              </div>
            </div>
          ) : null}

          {step === "owner" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {mode === "first_time" ? (
                <div className="md:col-span-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  {t("companyOnboarding.owner.firstTimeHint")}
                </div>
              ) : null}
              <div>
                <Label htmlFor="co-owner-first">
                  {t("companyOnboarding.fields.ownerFirstName")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-owner-first"
                  className="mt-1.5"
                  value={values.ownerFirstName}
                  onChange={(event) => patch({ ownerFirstName: event.target.value })}
                  disabled={mode === "first_time"}
                />
                <FieldError message={fieldErrors.ownerFirstName && t(`companyOnboarding.validation.${fieldErrors.ownerFirstName}`, { defaultValue: fieldErrors.ownerFirstName })} />
              </div>
              <div>
                <Label htmlFor="co-owner-last">
                  {t("companyOnboarding.fields.ownerLastName")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-owner-last"
                  className="mt-1.5"
                  value={values.ownerLastName}
                  onChange={(event) => patch({ ownerLastName: event.target.value })}
                  disabled={mode === "first_time"}
                />
                <FieldError message={fieldErrors.ownerLastName && t(`companyOnboarding.validation.${fieldErrors.ownerLastName}`, { defaultValue: fieldErrors.ownerLastName })} />
              </div>
              <div>
                <Label htmlFor="co-owner-display">
                  {t("companyOnboarding.fields.ownerDisplayName")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-owner-display"
                  className="mt-1.5"
                  value={values.ownerDisplayName}
                  onChange={(event) => patch({ ownerDisplayName: event.target.value })}
                />
                <FieldError message={fieldErrors.ownerDisplayName && t(`companyOnboarding.validation.${fieldErrors.ownerDisplayName}`, { defaultValue: fieldErrors.ownerDisplayName })} />
              </div>
              <div>
                <Label htmlFor="co-owner-email">
                  {t("companyOnboarding.fields.ownerEmail")}
                  <RequiredMark />
                </Label>
                <Input
                  id="co-owner-email"
                  type="email"
                  className="mt-1.5"
                  value={values.ownerEmail}
                  onChange={(event) => patch({ ownerEmail: event.target.value })}
                  disabled={mode === "first_time"}
                  dir="ltr"
                />
                <FieldError message={fieldErrors.ownerEmail && t(`companyOnboarding.validation.${fieldErrors.ownerEmail}`, { defaultValue: fieldErrors.ownerEmail })} />
              </div>
              <div>
                <Label htmlFor="co-owner-phone">{t("companyOnboarding.fields.ownerPhone")}</Label>
                <Input
                  id="co-owner-phone"
                  className="mt-1.5"
                  value={values.ownerPhone}
                  onChange={(event) => patch({ ownerPhone: event.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label htmlFor="co-owner-title">
                  {t("companyOnboarding.fields.ownerJobTitle")}
                  <RequiredMark />
                </Label>
                <select
                  id="co-owner-title"
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={values.ownerJobTitle}
                  onChange={(event) => patch({ ownerJobTitle: event.target.value })}
                >
                  <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                  {OWNER_JOB_TITLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(`companyOnboarding.ownerJobTitles.${option.i18nKey}`)}
                    </option>
                  ))}
                  {!OWNER_JOB_TITLE_OPTIONS.some(
                    (option) => option.value === values.ownerJobTitle,
                  ) && values.ownerJobTitle.trim() ? (
                    <option value={values.ownerJobTitle}>{values.ownerJobTitle}</option>
                  ) : null}
                </select>
                <FieldError message={fieldErrors.ownerJobTitle && t(`companyOnboarding.validation.${fieldErrors.ownerJobTitle}`, { defaultValue: fieldErrors.ownerJobTitle })} />
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
                  <h4 className="mt-1 text-xl font-semibold">
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
                  <dt className="text-xs text-muted-foreground">{t("companyOnboarding.plan.interval")}</dt>
                  <dd className="mt-1 text-sm font-medium">{t("companyOnboarding.plan.monthly")}</dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
                  <dt className="text-xs text-muted-foreground">{t("companyOnboarding.plan.price")}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {basicPlan
                      ? `${basicPlan.price_monthly ?? 0} / ${t("companyOnboarding.plan.month")}`
                      : t("companyOnboarding.plan.included")}
                  </dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
                  <dt className="text-xs text-muted-foreground">{t("companyOnboarding.plan.status")}</dt>
                  <dd className="mt-1 text-sm font-medium">{t("status.trial")}</dd>
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
                    id: "company" as const,
                    rows: [
                      ["name", values.name],
                      ["legalName", values.legalName],
                      ["businessType", values.businessType ? t(`companyOnboarding.businessTypes.${values.businessType}`) : ""],
                      ["industry", values.industry ? t(`companyOnboarding.industries.${values.industry}`) : ""],
                      ["contactEmail", values.contactEmail],
                      ["contactPhone", values.contactPhone],
                      ["website", values.website],
                      ["taxId", values.taxId],
                      ["commercialRegistration", values.commercialRegistration],
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
                    id: "owner" as const,
                    rows: [
                      ["ownerDisplayName", values.ownerDisplayName],
                      ["ownerEmail", values.ownerEmail],
                      ["ownerPhone", values.ownerPhone],
                      ["ownerJobTitle", (() => {
                        const option = OWNER_JOB_TITLE_OPTIONS.find(
                          (item) => item.value === values.ownerJobTitle,
                        );
                        return option
                          ? t(`companyOnboarding.ownerJobTitles.${option.i18nKey}`)
                          : values.ownerJobTitle;
                      })()],
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
                <section key={section.id} className="rounded-2xl border border-border/70 bg-background">
                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <h4 className="text-sm font-semibold">
                      {t(`companyOnboarding.review.${section.id}`)}
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
                            {t(`companyOnboarding.fields.${key}`, {
                              defaultValue: t(`companyOnboarding.plan.${key}`, { defaultValue: key }),
                            })}
                          </dt>
                          <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-4 sm:px-7">
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
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="gap-2">
              {t("companyOnboarding.actions.next")}
              {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          ) : (
            <Button type="button" onClick={() => void handleCreate()} disabled={isSubmitting} className="gap-2 min-w-[140px]">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("companyOnboarding.actions.create")
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function formatCompanyLocation(company: Company, language = "en"): string {
  const branch = resolvePrimaryBranch(company);
  const city = resolveGeoDisplayLabel(branch?.city, language, { countryValue: branch?.country });
  const country = resolveGeoDisplayLabel(branch?.country, language);
  const parts = [city, country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  const profile = resolveBillingProfile(company);
  return profile?.address?.trim() || "";
}
