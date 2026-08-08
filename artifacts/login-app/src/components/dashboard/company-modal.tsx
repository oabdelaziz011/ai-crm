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
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Company, CompanyStatus } from "@/lib/types";
import { useCreateCompany, useUpdateCompany } from "@/hooks/use-companies";
import { useCreateManagedUser } from "@/hooks/use-users-management";
import { fetchAssignableRolesForCompany } from "@/lib/users/fetch-assignable-roles";
import { useTranslation } from "react-i18next";

type FormValues = {
  name: string;
  status: CompanyStatus;
  subscription_plan: string;
  subscription_expires_at?: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerJobTitle: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  company?: Company | null;
}

const STATUS_VALUES: CompanyStatus[] = ["Active", "Suspended", "Trial"];

export function CompanyModal({ open, onClose, company }: Props) {
  const { t } = useTranslation("common");
  const isEdit = !!company;
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const inviteOwner = useCreateManagedUser();
  const isPending = create.isPending || update.isPending || inviteOwner.isPending;

  const schema = z.object({
    name: z.string().min(1, t("forms.company.nameRequired")),
    status: z.enum(["Active", "Suspended", "Trial"]),
    subscription_plan: z.string().min(1, t("forms.company.planRequired")),
    subscription_expires_at: z.string().optional(),
    ownerFullName: isEdit
      ? z.string().optional()
      : z.string().min(1, t("forms.company.ownerNameRequired", { defaultValue: "Owner name is required" })),
    ownerEmail: isEdit
      ? z.string().optional()
      : z.string().email(t("forms.company.ownerEmailRequired", { defaultValue: "Owner email is required" })),
    ownerJobTitle: z.string().optional(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      status: "Trial",
      subscription_plan: "",
      subscription_expires_at: "",
      ownerFullName: "",
      ownerEmail: "",
      ownerJobTitle: "Owner",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: company?.name ?? "",
      status: company?.status ?? "Trial",
      subscription_plan: company?.subscription_plan ?? "",
      subscription_expires_at: company?.subscription_expires_at
        ? company.subscription_expires_at.slice(0, 10)
        : "",
      ownerFullName: "",
      ownerEmail: "",
      ownerJobTitle: "Owner",
    });
  }, [open, company, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      name: values.name,
      status: values.status,
      subscription_plan: values.subscription_plan,
      subscription_expires_at: values.subscription_expires_at || null,
    };

    if (isEdit && company) {
      update.mutate(
        { id: company.id, values: payload },
        {
          onSuccess: () => {
            onClose();
            form.reset();
          },
          onError: (error) => form.setError("root", { message: error.message }),
        },
      );
      return;
    }

    create.mutate(payload, {
      onSuccess: async (created) => {
        try {
          const roles = await fetchAssignableRolesForCompany(created.id);
          const adminRole =
            roles.find((role) => /admin/i.test(role.name ?? "")) ?? roles[0];
          if (!adminRole) {
            throw new Error(
              t("forms.company.ownerInviteNoRole", {
                defaultValue: "Company created, but no role is available to invite the owner.",
              }),
            );
          }
          await inviteOwner.mutateAsync({
            email: values.ownerEmail,
            fullName: values.ownerFullName,
            companyId: created.id,
            roleId: adminRole.id,
            isActive: true,
            jobTitle: values.ownerJobTitle?.trim() || "Owner",
          });
          onClose();
          form.reset();
        } catch (error) {
          form.setError("root", {
            message:
              error instanceof Error
                ? error.message
                : t("forms.company.ownerInviteFailed", {
                    defaultValue: "Company created, but owner invitation failed.",
                  }),
          });
        }
      },
      onError: (error) => form.setError("root", { message: error.message }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("forms.company.editTitle") : t("forms.company.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {form.formState.errors.root.message}
              </p>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.company.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("forms.company.namePlaceholder")}
                      className="bg-background/50 border-white/10"
                      {...field}
                    />
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
                  <FormLabel>{t("forms.company.status")}</FormLabel>
                  <FormControl>
                    <select
                      className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.company.plan")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("forms.company.planPlaceholder")}
                      className="bg-background/50 border-white/10"
                      {...field}
                    />
                  </FormControl>
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
                      className="bg-background/50 border-white/10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit ? (
              <>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-sm font-medium">
                    {t("forms.company.ownerSection", { defaultValue: "Owner information" })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("forms.company.ownerHint", {
                      defaultValue: "Job title is display-only. Permissions come from the admin role.",
                    })}
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="ownerFullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("forms.company.ownerFullName", { defaultValue: "Owner full name" })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("users.form.fullNamePlaceholder")}
                          className="bg-background/50 border-white/10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ownerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("forms.company.ownerEmail", { defaultValue: "Owner email" })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("users.form.emailPlaceholder")}
                          className="bg-background/50 border-white/10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ownerJobTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("forms.company.ownerJobTitle", { defaultValue: "Owner job title" })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Owner"
                          className="bg-background/50 border-white/10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-white/10"
              >
                {t("buttons.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isEdit ? (
                  t("buttons.saveChanges")
                ) : (
                  t("buttons.addCompany")
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
