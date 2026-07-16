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
import type { Invoice, InvoiceStatus, Customer } from "@/lib/types";
import { useCreateInvoice, useUpdateInvoice } from "@/hooks/use-invoices";
import { useTranslation } from "react-i18next";

const STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue"];

type FormValues = {
  customer_id?: string;
  amount: number;
  status: InvoiceStatus;
  invoice_date: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
  customers: Customer[];
}

export function InvoiceModal({ open, onClose, invoice, customers }: Props) {
  const { t } = useTranslation("common");
  const isEdit = !!invoice;
  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const isPending = create.isPending || update.isPending;

  const schema = z.object({
    customer_id: z.string().optional(),
    amount: z.coerce.number().min(0, t("forms.invoice.amountMin")),
    status: z.enum(["Unpaid", "Paid", "Overdue"]),
    invoice_date: z.string().min(1, t("forms.invoice.dateRequired")),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "", amount: 0, status: "Unpaid",
      invoice_date: new Date().toISOString().slice(0, 10),
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        customer_id:  invoice?.customer_id  ?? "",
        amount:       invoice?.amount       ?? 0,
        status:       invoice?.status       ?? "Unpaid",
        invoice_date: invoice?.invoice_date
          ? invoice.invoice_date.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, invoice, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      customer_id:  values.customer_id || null,
      amount:       values.amount,
      status:       values.status,
      invoice_date: new Date(values.invoice_date).toISOString(),
    };

    if (isEdit && invoice) {
      update.mutate({ id: invoice.id, values: payload }, {
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
          <DialogTitle>{isEdit ? t("forms.invoice.editTitle") : t("forms.invoice.newTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {form.formState.errors.root.message}
              </p>
            )}
            <FormField control={form.control} name="customer_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.invoice.customer")}</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                    {...field}
                  >
                    <option value="">{t("forms.invoice.noCustomer")}</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.invoice.amount")}</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min="0" placeholder={t("forms.invoice.amountPlaceholder")} className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.invoice.status")}</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                    {...field}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s.toLowerCase()}`)}</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="invoice_date" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("forms.invoice.invoiceDate")}</FormLabel>
                <FormControl>
                  <Input type="date" className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={isPending} className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? t("buttons.saveChanges") : t("buttons.createInvoice")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
