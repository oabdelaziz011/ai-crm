import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { BOOKING_RULES_TIMEZONES } from "@/lib/scheduling/booking-rules-timezones";
import {
  branchFormSchema,
  branchToFormValues,
  type BranchFormSchema,
} from "@/lib/company/branches/validators";
import type { BranchRecord } from "@/lib/company/branches/types";

type Props = {
  open: boolean;
  onClose: () => void;
  branch?: BranchRecord | null;
  onSubmit: (values: BranchFormSchema) => Promise<void>;
  isSaving?: boolean;
};

export function BranchFormDialog({ open, onClose, branch, onSubmit, isSaving }: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(branch);

  const form = useForm<BranchFormSchema>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: branchToFormValues({
      name: "",
      code: null,
      address_line1: null,
      city: null,
      state: null,
      country: null,
      postal_code: null,
      phone: null,
      email: null,
      timezone: "UTC",
      is_primary: false,
      status: "active",
    }),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      branch
        ? branchToFormValues(branch)
        : branchToFormValues({
            name: "",
            code: null,
            address_line1: null,
            city: null,
            state: null,
            country: null,
            postal_code: null,
            phone: null,
            email: null,
            timezone: "UTC",
            is_primary: false,
            status: "active",
          }),
    );
  }, [open, branch, form]);

  const selectedTimezone = form.watch("timezone");
  const timezoneOptions = BOOKING_RULES_TIMEZONES.includes(
    selectedTimezone as (typeof BOOKING_RULES_TIMEZONES)[number],
  )
    ? BOOKING_RULES_TIMEZONES
    : ([selectedTimezone, ...BOOKING_RULES_TIMEZONES] as readonly string[]);

  const handleSubmit = async (values: BranchFormSchema) => {
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("branches.form.editTitle") : t("branches.form.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>{t("branches.form.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.code")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10 font-mono uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.status")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(["active", "inactive", "archived"] as const).map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`branches.statuses.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>{t("branches.form.address")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
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
                    <FormLabel>{t("branches.form.city")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.state")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.country")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.postalCode")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.phone")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("branches.form.email")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" className="bg-background/50 border-white/10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>{t("branches.form.timezone")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timezoneOptions.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_primary"
                render={({ field }) => (
                  <FormItem className="col-span-2 flex items-center justify-between rounded-xl border border-white/10 p-4">
                    <div>
                      <FormLabel>{t("branches.form.primary")}</FormLabel>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("branches.form.primaryHint")}
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
                {t("buttons.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEdit ? t("buttons.save") : t("buttons.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
