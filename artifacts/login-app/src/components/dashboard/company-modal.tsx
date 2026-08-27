import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Company, CompanyStatus } from "@/lib/types";
import { useUpdateCompany } from "@/hooks/use-companies";
import {
  COMPANY_BUSINESS_TYPES,
  COMPANY_INDUSTRIES,
} from "@/lib/companies/onboarding";
import {
  COMPANY_GEO_COUNTRIES,
  geoLabel,
  getCitiesForCountry,
  normalizeStoredCity,
  normalizeStoredCountry,
  withLegacyOption,
} from "@/lib/companies/geo";
import { useTranslation } from "react-i18next";
import { companyPackageDisplaySource } from "@/lib/companies/company-table-query";
import { translatePlanName } from "@/lib/billing/billing-display-i18n";

type FormValues = {
  name: string;
  legalName: string;
  businessType: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
  contactPerson: string;
  country: string;
  city: string;
  address: string;
  taxId: string;
  commercialRegistration: string;
  status: CompanyStatus;
  subscription_plan: string;
  subscription_expires_at?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  company: Company;
}

const STATUS_VALUES: CompanyStatus[] = ["Active", "Suspended", "Trial"];

function resolveBillingProfile(company: Company) {
  const profile = company.billing_profile;
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] ?? null : profile;
}

function resolvePrimaryBranch(company: Company) {
  const branch = company.primary_branch;
  if (!branch) return null;
  return Array.isArray(branch) ? branch[0] ?? null : branch;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Edit-only company dialog aligned with onboarding fields. Create uses CompanyOnboardingWizard. */
export function CompanyModal({ open, onClose, company }: Props) {
  const { t, i18n } = useTranslation("common");
  const update = useUpdateCompany();
  const isPending = update.isPending;

  const schema = z.object({
    name: z.string().trim().min(1, t("forms.company.nameRequired")),
    legalName: z.string().trim().min(1, t("companyOnboarding.validation.required")),
    businessType: z.string().trim().min(1, t("companyOnboarding.validation.required")),
    industry: z.string().trim().min(1, t("companyOnboarding.validation.required")),
    contactEmail: z
      .string()
      .trim()
      .min(1, t("companyOnboarding.validation.required"))
      .email(t("companyOnboarding.validation.emailInvalid")),
    contactPhone: z.string().trim().min(1, t("companyOnboarding.validation.required")),
    contactPerson: z.string().trim().optional().or(z.literal("")),
    country: z.string().trim().optional().or(z.literal("")),
    city: z.string().trim().optional().or(z.literal("")),
    address: z.string().trim().optional().or(z.literal("")),
    taxId: z.string().trim().optional().or(z.literal("")),
    commercialRegistration: z.string().trim().optional().or(z.literal("")),
    status: z.enum(["Active", "Suspended", "Trial"]),
    subscription_plan: z.string().trim().min(1, t("forms.company.planRequired")),
    subscription_expires_at: z.string().optional(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      legalName: "",
      businessType: "",
      industry: "",
      contactEmail: "",
      contactPhone: "",
      contactPerson: "",
      country: "",
      city: "",
      address: "",
      taxId: "",
      commercialRegistration: "",
      status: "Trial",
      subscription_plan: "",
      subscription_expires_at: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    const billing = resolveBillingProfile(company);
    const branch = resolvePrimaryBranch(company);
    const country = normalizeStoredCountry(branch?.country ?? "");
    const city = normalizeStoredCity(country, branch?.city ?? "");
    form.reset({
      name: company.name ?? "",
      legalName: billing?.legal_name ?? "",
      businessType: company.business_type ?? "",
      industry: company.industry ?? "",
      contactEmail: company.contact_email ?? "",
      contactPhone: company.contact_phone ?? "",
      contactPerson: company.contact_person ?? "",
      country,
      city,
      address: billing?.address ?? branch?.address_line1 ?? "",
      taxId: billing?.tax_id ?? "",
      commercialRegistration: billing?.commercial_registration ?? "",
      status: company.status ?? "Trial",
      subscription_plan: company.subscription_plan ?? "",
      subscription_expires_at: company.subscription_expires_at
        ? company.subscription_expires_at.slice(0, 10)
        : "",
    });
  }, [open, company, form]);

  const selectedCountry = form.watch("country");
  const selectedCity = form.watch("city");
  const countryOptions = withLegacyOption(COMPANY_GEO_COUNTRIES, selectedCountry);
  const cityOptions = withLegacyOption(getCitiesForCountry(selectedCountry), selectedCity);
  const packageSource = companyPackageDisplaySource(company);
  const planDisplayLabel = packageSource.key
    ? t(`companies.commercial.packageNames.${packageSource.key}`, {
        defaultValue: t(`companies.packages.${packageSource.key}`, {
          defaultValue: packageSource.rawLabel || company.subscription_plan || "",
        }),
      })
    : translatePlanName(t, {
        code: company.subscription_plan,
        name: company.subscription_plan,
        display_name: company.subscription_plan,
      });

  const onSubmit = (values: FormValues) => {
    update.mutate(
      {
        id: company.id,
        values: {
          name: values.name.trim(),
          status: values.status,
          business_type: emptyToNull(values.businessType),
          industry: emptyToNull(values.industry),
          contact_email: emptyToNull(values.contactEmail),
          contact_phone: emptyToNull(values.contactPhone),
          contact_person: emptyToNull(values.contactPerson),
        },
        identity: {
          legal_name: emptyToNull(values.legalName),
          address: emptyToNull(values.address),
          tax_id: emptyToNull(values.taxId),
          commercial_registration: emptyToNull(values.commercialRegistration),
          country: emptyToNull(values.country),
          city: emptyToNull(values.city),
        },
      },
      {
        onSuccess: () => {
          onClose();
          form.reset();
        },
        onError: (error) => form.setError("root", { message: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-2xl border border-border/70 bg-background p-0"
        dir={i18n.dir()}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-semibold">
            {t("forms.company.editTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("forms.company.editSubtitle", {
              defaultValue: t("companyOnboarding.subtitleAdmin"),
            })}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 px-5 py-5 sm:px-6">
            {form.formState.errors.root ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            ) : null}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                {t("companyOnboarding.review.company")}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.name")} *</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="legalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.legalName")} *</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="businessType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.businessType")} *</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                          {COMPANY_BUSINESS_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`companyOnboarding.businessTypes.${type}`)}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.industry")} *</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                          {COMPANY_INDUSTRIES.map((industry) => (
                            <option key={industry} value={industry}>
                              {t(`companyOnboarding.industries.${industry}`)}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.contactEmail")} *</FormLabel>
                      <FormControl>
                        <Input type="email" className="rounded-xl" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.contactPhone")} *</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.ownerDisplayName")}</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.taxId")}</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="commercialRegistration"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("companyOnboarding.fields.commercialRegistration")}</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-4">
              <h3 className="text-sm font-semibold">
                {t("companyOnboarding.review.business")}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.country")}</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                          value={field.value}
                          onChange={(event) => {
                            const nextCountry = event.target.value;
                            field.onChange(nextCountry);
                            const cities = getCitiesForCountry(nextCountry);
                            const currentCity = form.getValues("city");
                            const stillValid = cities.some(
                              (c) =>
                                c.value === currentCity ||
                                c.labelEn === currentCity ||
                                c.labelAr === currentCity,
                            );
                            if (!stillValid) {
                              form.setValue("city", "");
                            }
                          }}
                        >
                          <option value="">{t("companyOnboarding.fields.selectPlaceholder")}</option>
                          {countryOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {geoLabel(option, i18n.language)}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("companyOnboarding.fields.city")}</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={!selectedCountry}
                        >
                          <option value="">
                            {selectedCountry
                              ? t("companyOnboarding.fields.selectPlaceholder")
                              : t("companyOnboarding.fields.selectCountryFirst")}
                          </option>
                          {cityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {geoLabel(option, i18n.language)}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("companyOnboarding.fields.address")}</FormLabel>
                      <FormControl>
                        <Textarea className="min-h-[80px] rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-4">
              <h3 className="text-sm font-semibold">
                {t("companyOnboarding.review.plan")}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("forms.company.status")}</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(event.target.value as CompanyStatus)
                          }
                        >
                          {STATUS_VALUES.map((status) => (
                            <option key={status} value={status}>
                              {t(`status.${status.toLowerCase()}`)}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subscription_plan"
                  render={() => (
                    <FormItem>
                      <FormLabel>{t("forms.company.plan")}</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-xl"
                          value={planDisplayLabel}
                          disabled
                          readOnly
                        />
                      </FormControl>
                      <p className="text-start text-[11px] text-muted-foreground">
                        {t("forms.company.planMirrorHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subscription_expires_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("forms.company.expiresAt")}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="rounded-xl"
                          dir="ltr"
                          {...field}
                          disabled
                          readOnly
                        />
                      </FormControl>
                      <p className="text-start text-[11px] text-muted-foreground">
                        {t("forms.company.expiresMirrorHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <DialogFooter className="gap-2 border-t border-border/60 pt-4 sm:justify-between">
              <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={isPending} className="min-w-[140px] rounded-xl">
                {isPending ? <Loader2 className="size-4 animate-spin" /> : t("buttons.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
