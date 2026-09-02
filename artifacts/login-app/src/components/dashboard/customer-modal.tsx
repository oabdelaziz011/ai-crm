import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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

type FormValues = {
  name: string;
  email?: string;
  phone?: string;
  phone_country_iso?: string;
  age?: string;
  gender?: string;
  notes?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  defaultPhone?: string | null;
  onCreated?: (customer: Customer) => void;
}

export function CustomerModal({ open, onClose, customer, defaultPhone, onCreated }: Props) {
  const { t } = useTranslation("common");
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isPending = create.isPending || update.isPending;
  const [phoneRegion, setPhoneRegion] = useState<string | null>(null);

  const schema = z.object({
    name: z.string().min(1, t("forms.customer.nameRequired")),
    email: z.string().email(t("forms.customer.invalidEmail")).or(z.literal("")).optional(),
    phone: z.string().optional(),
    phone_country_iso: z.string().optional(),
    age: z.string().optional().refine(
      (value) => !value?.trim() || (/^\d+$/.test(value.trim()) && Number.parseInt(value, 10) >= 0 && Number.parseInt(value, 10) <= 150),
      t("forms.customer.invalidAge"),
    ),
    gender: z.string().optional(),
    notes: z.string().optional(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      phone_country_iso: "",
      age: "",
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
        email: customer?.email ?? "",
        phone: customer?.phone ?? defaultPhone ?? "",
        phone_country_iso: region,
        age: customer?.age == null ? "" : String(customer.age),
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
      email: values.email || null,
      phone,
      phone_country_iso: region,
      age: values.age?.trim() ? Number.parseInt(values.age.trim(), 10) : null,
      gender: values.gender?.trim() || null,
      notes: values.notes || null,
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
      <DialogContent className="bg-card border-white/10 text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("forms.customer.editTitle") : t("forms.customer.newTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {form.formState.errors.root.message}
              </p>
            )}
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.customer.name")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("forms.customer.fullName")} className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.customer.email")}</FormLabel>
                <FormControl>
                  <Input type="email" placeholder={t("forms.customer.emailPlaceholder")} className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
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
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="age" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.customer.age")}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={150} placeholder={t("forms.customer.agePlaceholder")} className="bg-background/50 border-white/10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.customer.gender")}</FormLabel>
                  <Select value={field.value || "__empty__"} onValueChange={(value) => field.onChange(value === "__empty__" ? "" : value)}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50 border-white/10">
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
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.customer.notes")}</FormLabel>
                <FormControl>
                  <textarea
                    placeholder={t("forms.customer.optionalNotes")}
                    rows={3}
                    className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none transition-colors placeholder:text-muted-foreground"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={isPending} className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? t("buttons.saveChanges") : t("forms.customer.add")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
