import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Customer } from "@/lib/types";
import { useCreateCustomer, useUpdateCustomer } from "@/hooks/use-customers";
import { useTranslation } from "react-i18next";

type FormValues = {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

export function CustomerModal({ open, onClose, customer }: Props) {
  const { t } = useTranslation("common");
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isPending = create.isPending || update.isPending;

  const schema = z.object({
    name: z.string().min(1, t("forms.customer.nameRequired")),
    email: z.string().email(t("forms.customer.invalidEmail")).or(z.literal("")).optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", notes: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name:  customer?.name  ?? "",
        email: customer?.email ?? "",
        phone: customer?.phone ?? "",
        notes: customer?.notes ?? "",
      });
    }
  }, [open, customer, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      name:  values.name,
      email: values.email || null,
      phone: values.phone || null,
      notes: values.notes || null,
    };

    if (isEdit && customer) {
      update.mutate({ id: customer.id, values: payload }, {
        onSuccess: () => { onClose(); form.reset(); },
        onError: (e) => form.setError("root", { message: e.message }),
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { onClose(); form.reset(); },
        onError: (e) => form.setError("root", { message: e.message }),
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
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.customer.phone")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("forms.customer.phonePlaceholder")} className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
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
