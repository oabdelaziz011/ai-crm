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
import type { Booking, BookingStatus, Customer } from "@/lib/types";
import { useCreateBooking, useUpdateBooking } from "@/hooks/use-bookings";

const STATUSES: BookingStatus[] = ["Pending", "Confirmed", "Cancelled"];

const schema = z.object({
  customer_id:  z.string().optional(),
  service:      z.string().min(1, "Service is required"),
  booking_date: z.string().min(1, "Date is required"),
  status:       z.enum(["Pending", "Confirmed", "Cancelled"]),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  booking?: Booking | null;
  customers: Customer[];
}

export function BookingModal({ open, onClose, booking, customers }: Props) {
  const isEdit = !!booking;
  const create = useCreateBooking();
  const update = useUpdateBooking();
  const isPending = create.isPending || update.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customer_id: "", service: "", booking_date: "", status: "Pending" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        customer_id:  booking?.customer_id  ?? "",
        service:      booking?.service      ?? "",
        booking_date: booking?.booking_date
          ? booking.booking_date.slice(0, 16)
          : "",
        status: booking?.status ?? "Pending",
      });
    }
  }, [open, booking, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      customer_id:  values.customer_id || null,
      service:      values.service,
      booking_date: new Date(values.booking_date).toISOString(),
      status:       values.status,
    };

    if (isEdit && booking) {
      update.mutate({ id: booking.id, values: payload }, {
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
          <DialogTitle>{isEdit ? "Edit Booking" : "New Booking"}</DialogTitle>
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
                <FormLabel>Customer</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                    {...field}
                  >
                    <option value="">— No customer —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="service" render={({ field }) => (
              <FormItem>
                <FormLabel>Service *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Consultation" className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="booking_date" render={({ field }) => (
              <FormItem>
                <FormLabel>Date & Time *</FormLabel>
                <FormControl>
                  <Input type="datetime-local" className="bg-background/50 border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                    {...field}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? "Save Changes" : "Add Booking"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
