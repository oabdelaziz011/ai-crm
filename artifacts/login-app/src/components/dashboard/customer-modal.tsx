import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Customer } from "@/lib/types";
import {
  customerPhoneErrorI18nKey,
  useCreateCustomer,
  useUpdateCustomer,
} from "@/hooks/use-customers";
import { useTranslation } from "react-i18next";
import { CustomerPhoneInput } from "@/components/customers/customer-phone-input";
import { validateCustomerPhoneFormInput } from "@/lib/customers/customer-phone-form";
import { isValidDateOfBirthInput } from "@/lib/customers/customer-lifecycle";
import { fmtDate } from "@/lib/customer-workspace/customer-workspace-utils";

type FormValues = {
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  phone_country_iso?: string;
  date_of_birth?: string;
  gender?: string;
  notes?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  defaultPhone?: string | null;
  onCreated?: (customer: Customer) => void;
  /** When creating from a known channel, stamps first-touch source. */
  defaultSource?: Customer["source"];
}

export function CustomerModal({ open, onClose, customer, defaultPhone, onCreated, defaultSource }: Props) {
  const { t, i18n } = useTranslation("common");
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isPending = create.isPending || update.isPending;
  const [phoneRegion, setPhoneRegion] = useState<string | null>(null);

  const schema = z.object({
    name: z.string().min(1, t("forms.customer.nameRequired")),
    company_name: z.string().optional(),
    email: z.string().email(t("forms.customer.invalidEmail")).or(z.literal("")).optional(),
    phone: z.string().optional(),
    phone_country_iso: z.string().optional(),
    date_of_birth: z.string().optional().refine(
      (value) => isValidDateOfBirthInput(value),
      t("forms.customer.invalidDateOfBirth"),
    ),
    gender: z.string().optional(),
    notes: z.string().optional(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      company_name: "",
      email: "",
      phone: "",
      phone_country_iso: "",
      date_of_birth: "",
      gender: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      const region = customer?.phone_country_iso ?? "";
      setPhoneRegion(region || null);
      form.reset({
        name: customer?.name ?? "",
        company_name: customer?.company_name ?? "",
        email: customer?.email ?? "",
        phone: customer?.phone ?? defaultPhone ?? "",
        phone_country_iso: region,
        date_of_birth: customer?.date_of_birth ?? "",
        gender: customer?.gender ?? "",
        notes: customer?.notes ?? "",
      });
    }
  }, [open, customer, defaultPhone, form]);

  const mapError = (error: unknown) => {
    const key = customerPhoneErrorI18nKey(error);
    return key ? t(key) : error instanceof Error ? error.message : String(error);
  };

  const onSubmit = (values: FormValues) => {
    const phone = values.phone?.trim() || null;
    const region = phoneRegion;
    const phoneValidation = validateCustomerPhoneFormInput({ phone, region });
    if (phoneValidation.code === "phone_region_required") {
      form.setError("phone", { message: t("forms.customer.phoneRegionRequired") });
      return;
    }
    if (phoneValidation.code === "invalid_phone") {
      form.setError("phone", { message: t("forms.customer.invalidPhone") });
      return;
    }

    const payload = {
      name: values.name,
      company_name: values.company_name?.trim() || null,
      email: values.email || null,
      phone,
      phone_country_iso: region,
      date_of_birth: values.date_of_birth?.trim() || null,
      gender: values.gender?.trim() || null,
      notes: values.notes || null,
      age: null as number | null,
      ...(isEdit ? {} : { source: defaultSource ?? ("manual" as const) }),
    };

    if (isEdit && customer) {
      update.mutate(
        {
          id: customer.id,
          values: payload,
          previous: {
            phone: customer.phone,
            phone_country_iso: customer.phone_country_iso,
            phone_e164: customer.phone_e164,
          },
        },
        {
          onSuccess: () => {
            onClose();
            form.reset();
          },
          onError: (e) => form.setError("root", { message: mapError(e) }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: (created) => {
          onCreated?.(created);
          onClose();
          form.reset();
        },
        onError: (e) => form.setError("root", { message: mapError(e) }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(96vw,44rem)] max-w-2xl flex-col gap-0 overflow-hidden bg-card p-0 text-foreground sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4 text-start">
          <DialogTitle className="text-lg">
            {isEdit ? t("forms.customer.editTitle") : t("forms.customer.newTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isEdit ? t("forms.customer.editSubtitle") : t("forms.customer.newSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {form.formState.errors.root && (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              )}

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("forms.customer.sections.identity")}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("forms.customer.name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("forms.customer.fullName")} className="bg-background/50 border-border/70" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="company_name" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("forms.customer.companyName")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("forms.customer.companyNamePlaceholder")}
                          className="bg-background/50 border-border/70"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t("forms.customer.companyNameHint")}</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("forms.customer.dateOfBirth")}</FormLabel>
                      <FormControl>
                        <Input type="date" className="bg-background/50 border-border/70" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("forms.customer.gender")}</FormLabel>
                      <Select value={field.value || "__empty__"} onValueChange={(value) => field.onChange(value === "__empty__" ? "" : value)}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-border/70">
                            <SelectValue placeholder={t("forms.customer.genderPlaceholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__empty__">{t("forms.customer.notSet")}</SelectItem>
                          <SelectItem value="Male">{t("forms.customer.genderOptions.male")}</SelectItem>
                          <SelectItem value="Female">{t("forms.customer.genderOptions.female")}</SelectItem>
                          <SelectItem value="Other">{t("forms.customer.genderOptions.other")}</SelectItem>
                          <SelectItem value="Prefer not to say">{t("forms.customer.genderOptions.preferNotToSay")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("forms.customer.sections.contact")}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("forms.customer.email")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("forms.customer.emailPlaceholder")} className="bg-background/50 border-border/70" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t("forms.customer.phone")}</FormLabel>
                        <FormControl>
                          <CustomerPhoneInput
                            phone={field.value ?? ""}
                            region={phoneRegion}
                            onPhoneChange={field.onChange}
                            onRegionChange={(next) => {
                              setPhoneRegion(next);
                              form.setValue("phone_country_iso", next ?? "");
                            }}
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("forms.customer.sections.notes")}
                </p>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("forms.customer.notes")}</FormLabel>
                    <FormControl>
                      <textarea
                        placeholder={t("forms.customer.optionalNotes")}
                        rows={5}
                        className="w-full rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 resize-y min-h-[7.5rem]"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t("forms.customer.notesHint")}</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </section>

              {isEdit && customer ? (
                <section className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <p className="font-medium text-foreground/80">{t("forms.customer.meta.created")}</p>
                    <p className="mt-0.5 tabular-nums">{fmtDate(customer.created_at, i18n.language)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground/80">{t("forms.customer.meta.updated")}</p>
                    <p className="mt-0.5 tabular-nums">{fmtDate(customer.updated_at, i18n.language)}</p>
                  </div>
                </section>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-card px-6 py-4 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="border-border/70">
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? t("buttons.saveChanges") : t("forms.customer.add")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
