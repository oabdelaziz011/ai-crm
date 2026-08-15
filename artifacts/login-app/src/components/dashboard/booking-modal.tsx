import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ExternalLink, Loader2 } from "lucide-react";
import type { Booking, BookingStatus, Customer } from "@/lib/types";
import {
  useAvailableBookingSlots,
  useCreateBooking,
  useRescheduleBooking,
  useUpdateBooking,
  formatBookingDomainError,
} from "@/hooks/use-bookings";
import { useCreateCustomer } from "@/hooks/use-customers";
import { useSchedulingServices } from "@/hooks/scheduling/use-scheduling-services";
import { useServiceResources } from "@/hooks/scheduling/use-resource-capabilities";
import {
  filterEligibleBookingResources,
  resolveBookingSlotMessageKey,
} from "@/lib/booking/booking-form-presenters";
import { schedulingBookingToAppBooking } from "@/lib/booking/booking-view-adapter";
import { useAuth } from "@/context/auth-context";
import { useTranslation } from "react-i18next";
import { toDashboardAbsolutePath } from "@/lib/routing";
import { BranchSelector } from "@/lib/company/branches/components";
import { useCurrentUserBranches } from "@/lib/company/branches/hooks";
import { cn } from "@/lib/utils";

const LEGACY_STATUSES: BookingStatus[] = ["Pending", "Confirmed", "Cancelled"];

type CustomerEntryMode = "existing" | "new";

type SchedulingFormValues = {
  customer_id: string;
  new_customer_name: string;
  new_customer_email: string;
  new_customer_phone: string;
  new_customer_age: string;
  new_customer_gender: string;
  new_customer_notes: string;
  service_id: string;
  resource_id: string;
  date: string;
  slot_start: string;
  notes?: string;
};

type LegacyFormValues = {
  customer_id?: string;
  service: string;
  booking_date: string;
  status: BookingStatus;
};

interface Props {
  open: boolean;
  onClose: () => void;
  booking?: Booking | null;
  customers: Customer[];
  companyId?: string | null;
  defaultCustomerId?: string | null;
  lockCustomer?: boolean;
  onCreated?: (booking: Booking) => void;
  /** Future-ready: filter eligible resources to a branch when provided. */
  branchId?: string | null;
}

function BookingFieldHint({
  variant,
  children,
}: {
  variant: "muted" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={
        variant === "error"
          ? "text-xs text-destructive mt-1.5 leading-relaxed rounded-lg px-3 py-2 bg-destructive/10 border border-destructive/20"
          : "text-xs text-muted-foreground mt-1.5 leading-relaxed rounded-lg px-3 py-2 bg-background/25 border border-white/5"
      }
    >
      {children}
    </p>
  );
}

const EMPTY_SCHEDULING_VALUES: SchedulingFormValues = {
  customer_id: "",
  new_customer_name: "",
  new_customer_email: "",
  new_customer_phone: "",
  new_customer_age: "",
  new_customer_gender: "",
  new_customer_notes: "",
  service_id: "",
  resource_id: "",
  date: "",
  slot_start: "",
  notes: "",
};

export function BookingModal({
  open,
  onClose,
  booking,
  customers,
  companyId: companyIdProp,
  defaultCustomerId,
  lockCustomer = false,
  onCreated,
  branchId = null,
}: Props) {
  const { t } = useTranslation("common");
  const { profile, user } = useAuth();
  const companyId = companyIdProp ?? profile?.company_id ?? null;
  const isEdit = !!booking;
  const isSchedulingEdit = Boolean(booking?.isSchedulingBooking);
  const isSchedulingCreate = !isEdit && Boolean(companyId);
  const allowNewCustomer = isSchedulingCreate && !lockCustomer;

  const createBooking = useCreateBooking(companyId);
  const createCustomer = useCreateCustomer();
  const rescheduleBooking = useRescheduleBooking(companyId);
  const updateLegacy = useUpdateBooking();
  const isPending =
    createBooking.isPending ||
    createCustomer.isPending ||
    rescheduleBooking.isPending ||
    updateLegacy.isPending;

  const { data: userBranches = [] } = useCurrentUserBranches(companyId);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [customerMode, setCustomerMode] = useState<CustomerEntryMode>("existing");
  const customerModeRef = useRef<CustomerEntryMode>(customerMode);
  customerModeRef.current = customerMode;

  const effectiveBranchId = useMemo(() => {
    if (branchId) return branchId;
    if (selectedBranchId) return selectedBranchId;
    if (userBranches.length === 1) return userBranches[0]?.id ?? null;
    return null;
  }, [branchId, selectedBranchId, userBranches]);

  const showBranchSelector =
    isSchedulingCreate &&
    !branchId &&
    userBranches.length > 1;

  const schedulingSchema = useMemo(
    () =>
      z
        .object({
          customer_id: z.string(),
          new_customer_name: z.string(),
          new_customer_email: z
            .string()
            .email(t("forms.customer.invalidEmail"))
            .or(z.literal(""))
            .optional(),
          new_customer_phone: z.string().optional(),
          new_customer_age: z
            .string()
            .optional()
            .refine(
              (value) =>
                !value?.trim() ||
                (/^\d+$/.test(value.trim()) &&
                  Number.parseInt(value, 10) >= 0 &&
                  Number.parseInt(value, 10) <= 150),
              t("forms.customer.invalidAge"),
            ),
          new_customer_gender: z.string().optional(),
          new_customer_notes: z.string().optional(),
          service_id: z.string().min(1, t("forms.booking.serviceRequired")),
          resource_id: z.string().min(1, t("forms.booking.resourceRequired")),
          date: z.string().min(1, t("forms.booking.dateRequired")),
          slot_start: z.string().min(1, t("forms.booking.slotRequired")),
          notes: z.string().optional(),
        })
        .superRefine((values, ctx) => {
          if (isSchedulingEdit || customerModeRef.current === "existing") {
            if (!values.customer_id.trim()) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["customer_id"],
                message: t("forms.booking.customerRequired"),
              });
            }
            return;
          }

          if (!values.new_customer_name.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["new_customer_name"],
              message: t("forms.booking.newCustomerNameRequired"),
            });
          }
        }),
    [isSchedulingEdit, t],
  );

  const legacySchema = z.object({
    customer_id: z.string().optional(),
    service: z.string().min(1, t("forms.booking.serviceRequired")),
    booking_date: z.string().min(1, t("forms.booking.dateRequired")),
    status: z.enum(["Pending", "Confirmed", "Cancelled"]),
  });

  const schedulingForm = useForm<SchedulingFormValues>({
    resolver: zodResolver(schedulingSchema),
    defaultValues: EMPTY_SCHEDULING_VALUES,
  });

  const legacyForm = useForm<LegacyFormValues>({
    resolver: zodResolver(legacySchema),
    defaultValues: { customer_id: "", service: "", booking_date: "", status: "Pending" },
  });

  const watchedServiceId = schedulingForm.watch("service_id");
  const watchedResourceId = schedulingForm.watch("resource_id");
  const watchedDate = schedulingForm.watch("date");

  const { data: services = [], isLoading: servicesLoading } = useSchedulingServices(companyId);
  const {
    data: resources = [],
    isLoading: resourcesLoading,
    isError: resourcesError,
    error: resourcesQueryError,
  } = useServiceResources(companyId, watchedServiceId || null, effectiveBranchId);
  const {
    data: slotsResult,
    isLoading: slotsLoading,
    isError: slotsError,
    error: slotsQueryError,
  } = useAvailableBookingSlots(
    companyId,
    watchedResourceId || null,
    watchedServiceId || null,
    watchedDate || null,
  );

  const eligibleResources = useMemo(
    () => filterEligibleBookingResources(resources, effectiveBranchId),
    [resources, effectiveBranchId],
  );

  const slotMessageKey = useMemo(
    () => resolveBookingSlotMessageKey(slotsResult),
    [slotsResult],
  );

  const isQueryLoading = resourcesLoading || slotsLoading;
  const showResourceEmptyState =
    Boolean(watchedServiceId) &&
    !resourcesLoading &&
    !resourcesError &&
    eligibleResources.length === 0;
  const showSlotEmptyState =
    Boolean(watchedResourceId && watchedDate) &&
    !slotsLoading &&
    !slotsError &&
    slotMessageKey != null;

  const schedulingSubmitDisabled =
    isPending ||
    isQueryLoading ||
    resourcesError ||
    slotsError ||
    (!isSchedulingEdit &&
      showBranchSelector &&
      !selectedBranchId) ||
    (!isSchedulingEdit &&
      Boolean(watchedServiceId) &&
      !resourcesLoading &&
      !resourcesError &&
      eligibleResources.length === 0) ||
    (!isSchedulingEdit &&
      Boolean(watchedResourceId && watchedDate) &&
      !slotsLoading &&
      !slotsError &&
      slotsResult != null &&
      !slotsResult.available);

  const activeServices = useMemo(
    () => services.filter((item) => item.status === "active"),
    [services],
  );

  useEffect(() => {
    if (!open) return;
    if (branchId) {
      setSelectedBranchId(branchId);
    } else if (userBranches.length === 1) {
      setSelectedBranchId(userBranches[0]?.id ?? null);
    } else if (!isSchedulingCreate) {
      setSelectedBranchId(null);
    }
  }, [open, branchId, userBranches, isSchedulingCreate]);

  useEffect(() => {
    if (!open) return;

    setCustomerMode("existing");

    if (isSchedulingCreate || isSchedulingEdit) {
      schedulingForm.reset({
        ...EMPTY_SCHEDULING_VALUES,
        customer_id: booking?.customer_id ?? defaultCustomerId ?? "",
        service_id: booking?.service_id ?? "",
        resource_id: booking?.resource_id ?? "",
        date: booking?.booking_date ? booking.booking_date.slice(0, 10) : "",
        notes: booking?.notes ?? "",
      });
      return;
    }

    legacyForm.reset({
      customer_id: booking?.customer_id ?? defaultCustomerId ?? "",
      service: booking?.service ?? "",
      booking_date: booking?.booking_date ? booking.booking_date.slice(0, 16) : "",
      status: booking?.status ?? "Pending",
    });
  }, [
    open,
    booking,
    defaultCustomerId,
    isSchedulingCreate,
    isSchedulingEdit,
    schedulingForm,
    legacyForm,
  ]);

  useEffect(() => {
    if (!open || !isSchedulingCreate) return;
    schedulingForm.setValue("resource_id", "");
    schedulingForm.setValue("slot_start", "");
  }, [watchedServiceId, open, isSchedulingCreate, schedulingForm]);

  useEffect(() => {
    if (!open || !isSchedulingCreate) return;
    schedulingForm.setValue("slot_start", "");
  }, [watchedResourceId, watchedDate, open, isSchedulingCreate, schedulingForm]);

  useEffect(() => {
    if (!open) return;
    schedulingForm.clearErrors(["customer_id", "new_customer_name", "new_customer_email", "new_customer_age"]);
  }, [customerMode, open, schedulingForm]);

  const onSubmitScheduling = async (values: SchedulingFormValues) => {
    if (!companyId) {
      schedulingForm.setError("root", { message: t("forms.booking.companyRequired") });
      return;
    }

    if (isSchedulingEdit && booking) {
      rescheduleBooking.mutate(
        {
          bookingId: booking.id,
          date: values.date,
          slotStart: values.slot_start,
          customerId: booking.customer_id,
        },
        {
          onSuccess: ({ booking: rescheduled }) => {
            const serviceName = activeServices.find((s) => s.id === rescheduled.service_id)?.name;
            onCreated?.(
              schedulingBookingToAppBooking(
                {
                  ...rescheduled,
                  customers: booking.customers ?? null,
                  scheduling_services: serviceName
                    ? { id: rescheduled.service_id, name: serviceName, duration_minutes: 0 }
                    : null,
                  scheduling_resources: null,
                },
                user?.id ?? "",
              ),
            );
            onClose();
            schedulingForm.reset(EMPTY_SCHEDULING_VALUES);
          },
          onError: (error) =>
            schedulingForm.setError("root", { message: formatBookingDomainError(error) }),
        },
      );
      return;
    }

    let customerId = values.customer_id.trim();
    let linkedCustomer = customers.find((c) => c.id === customerId) ?? null;

    if (customerMode === "new" && allowNewCustomer) {
      try {
        linkedCustomer = await createCustomer.mutateAsync({
          name: values.new_customer_name.trim(),
          email: values.new_customer_email?.trim() || null,
          phone: values.new_customer_phone?.trim() || null,
          age: values.new_customer_age?.trim()
            ? Number.parseInt(values.new_customer_age.trim(), 10)
            : null,
          gender: values.new_customer_gender?.trim() || null,
          notes: values.new_customer_notes?.trim() || null,
        });
        customerId = linkedCustomer.id;
      } catch (error) {
        schedulingForm.setError("root", {
          message: error instanceof Error ? error.message : t("forms.booking.customerRequired"),
        });
        return;
      }
    }

    createBooking.mutate(
      {
        customerId,
        resourceId: values.resource_id,
        serviceId: values.service_id,
        date: values.date,
        slotStart: values.slot_start,
        notes: values.notes || null,
        source: "crm",
        branchId: effectiveBranchId,
      },
      {
        onSuccess: (created) => {
          const serviceName = activeServices.find((s) => s.id === created.service_id)?.name;
          onCreated?.(
            schedulingBookingToAppBooking(
              {
                ...created,
                customers: linkedCustomer ?? customers.find((c) => c.id === created.customer_id) ?? null,
                scheduling_services: serviceName
                  ? { id: created.service_id, name: serviceName, duration_minutes: 0 }
                  : null,
                scheduling_resources: null,
              },
              user?.id ?? "",
            ),
          );
          onClose();
          setCustomerMode("existing");
          schedulingForm.reset(EMPTY_SCHEDULING_VALUES);
        },
        onError: (error) =>
          schedulingForm.setError("root", { message: formatBookingDomainError(error) }),
      },
    );
  };

  const onSubmitLegacy = (values: LegacyFormValues) => {
    if (!booking) return;
    updateLegacy.mutate(
      {
        id: booking.id,
        values: {
          customer_id: values.customer_id || null,
          service: values.service,
          booking_date: new Date(values.booking_date).toISOString(),
          status: values.status,
        },
      },
      {
        onSuccess: () => {
          onClose();
          legacyForm.reset();
        },
        onError: (error) => legacyForm.setError("root", { message: error.message }),
      },
    );
  };

  const renderNewCustomerFields = () => (
    <div className="space-y-3 rounded-xl border border-white/10 bg-background/20 p-3.5">
      <BookingFieldHint variant="muted">{t("forms.booking.newCustomerHint")}</BookingFieldHint>
      <FormField
        control={schedulingForm.control}
        name="new_customer_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.customer.name")} *</FormLabel>
            <FormControl>
              <Input
                placeholder={t("forms.customer.fullName")}
                className="bg-background/50 border-white/10"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={schedulingForm.control}
          name="new_customer_phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.customer.phone")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("forms.customer.phonePlaceholder")}
                  className="bg-background/50 border-white/10"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={schedulingForm.control}
          name="new_customer_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.customer.email")}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("forms.customer.emailPlaceholder")}
                  className="bg-background/50 border-white/10"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={schedulingForm.control}
          name="new_customer_age"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.customer.age")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={150}
                  placeholder={t("forms.customer.agePlaceholder")}
                  className="bg-background/50 border-white/10"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={schedulingForm.control}
          name="new_customer_gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.customer.gender")}</FormLabel>
              <Select
                value={field.value || "__empty__"}
                onValueChange={(value) => field.onChange(value === "__empty__" ? "" : value)}
              >
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
                  <SelectItem value="Prefer not to say">
                    {t("forms.customer.genderOptions.preferNotToSay")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={schedulingForm.control}
        name="new_customer_notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.customer.notes")}</FormLabel>
            <FormControl>
              <textarea
                placeholder={t("forms.customer.optionalNotes")}
                rows={2}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none transition-colors placeholder:text-muted-foreground"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const renderCustomerField = () => (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm font-medium leading-none">{t("forms.booking.customer")}</label>
        {allowNewCustomer && (
          <ToggleGroup
            type="single"
            value={customerMode}
            onValueChange={(value) => {
              if (value === "existing" || value === "new") setCustomerMode(value);
            }}
            size="sm"
            variant="outline"
            className="justify-start"
          >
            <ToggleGroupItem value="existing" className="px-3 text-xs">
              {t("forms.booking.customerModeExisting")}
            </ToggleGroupItem>
            <ToggleGroupItem value="new" className="px-3 text-xs">
              {t("forms.booking.customerModeNew")}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {customerMode === "new" && allowNewCustomer ? (
        renderNewCustomerFields()
      ) : (
        <FormField
          control={schedulingForm.control}
          name="customer_id"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <select
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors disabled:opacity-60"
                  disabled={lockCustomer || isSchedulingEdit}
                  {...field}
                >
                  <option value="">{t("forms.booking.selectCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );

  const renderSchedulingForm = () => (
    <Form {...schedulingForm}>
      <form onSubmit={schedulingForm.handleSubmit(onSubmitScheduling)} className="space-y-4">
        {schedulingForm.formState.errors.root && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {schedulingForm.formState.errors.root.message}
          </p>
        )}

        {renderCustomerField()}

        {showBranchSelector && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("branches.selector.bookingLabel")}</label>
            <BranchSelector
              branches={userBranches}
              value={selectedBranchId}
              onChange={setSelectedBranchId}
            />
            {!selectedBranchId && (
              <BookingFieldHint variant="muted">{t("branches.selector.bookingRequired")}</BookingFieldHint>
            )}
          </div>
        )}

        <div className={cn("grid gap-4", customerMode === "new" && allowNewCustomer && "sm:grid-cols-2")}>
          <FormField control={schedulingForm.control} name="service_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.booking.service")}</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors disabled:opacity-60"
                  disabled={isSchedulingEdit || servicesLoading}
                  {...field}
                >
                  <option value="">{t("forms.booking.selectService")}</option>
                  {activeServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes}m)
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={schedulingForm.control} name="resource_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                {t("forms.booking.resource")}
                {resourcesLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors disabled:opacity-60"
                  disabled={!watchedServiceId || isSchedulingEdit || resourcesLoading}
                  {...field}
                >
                  <option value="">
                    {resourcesLoading
                      ? t("forms.booking.loadingResources")
                      : t("forms.booking.selectResource")}
                  </option>
                  {eligibleResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>{resource.name}</option>
                  ))}
                </select>
              </FormControl>
              {resourcesError && (
                <BookingFieldHint variant="error">
                  {t("forms.booking.resourcesLoadError")}
                  {resourcesQueryError?.message ? ` (${resourcesQueryError.message})` : ""}
                </BookingFieldHint>
              )}
              {showResourceEmptyState && (
                <div className="rounded-xl border border-white/10 bg-background/25 px-3 py-3 space-y-3">
                  <BookingFieldHint variant="muted">
                    {t("forms.booking.noEligibleResourcesEmptyState")}
                  </BookingFieldHint>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="border-white/10 gap-1.5" asChild>
                      <Link href={toDashboardAbsolutePath("/settings/scheduling/resources")}>
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t("forms.booking.openResourcesSettings")}
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="border-white/10 gap-1.5" asChild>
                      <Link href={toDashboardAbsolutePath("/settings/scheduling/services")}>
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t("forms.booking.openServicesSettings")}
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className={cn("grid gap-4", customerMode === "new" && allowNewCustomer && "sm:grid-cols-2")}>
          <FormField control={schedulingForm.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("forms.booking.date")}</FormLabel>
              <FormControl>
                <Input type="date" className="bg-background/50 border-white/10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={schedulingForm.control} name="slot_start" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                {t("forms.booking.slot")}
                {slotsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors disabled:opacity-60"
                  disabled={!watchedResourceId || !watchedDate || slotsLoading}
                  {...field}
                >
                  <option value="">
                    {slotsLoading
                      ? t("forms.booking.loadingSlots")
                      : t("forms.booking.selectSlot")}
                  </option>
                  {(slotsResult?.slots ?? []).map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </FormControl>
              {slotsError && (
                <BookingFieldHint variant="error">
                  {t("forms.booking.slotsLoadError")}
                  {slotsQueryError?.message ? ` (${slotsQueryError.message})` : ""}
                </BookingFieldHint>
              )}
              {showSlotEmptyState && slotMessageKey && (
                <BookingFieldHint variant="muted">{t(slotMessageKey)}</BookingFieldHint>
              )}
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={schedulingForm.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.booking.notes")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("forms.booking.notesPlaceholder")}
                className="bg-background/50 border-white/10"
                {...field}
              />
            </FormControl>
          </FormItem>
        )} />

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
            {t("buttons.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={schedulingSubmitDisabled}
            className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30"
          >
            {isPending || isQueryLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSchedulingEdit ? (
              t("forms.booking.reschedule")
            ) : (
              t("buttons.addBooking")
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  const renderLegacyForm = () => (
    <Form {...legacyForm}>
      <form onSubmit={legacyForm.handleSubmit(onSubmitLegacy)} className="space-y-4">
        {legacyForm.formState.errors.root && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {legacyForm.formState.errors.root.message}
          </p>
        )}
        <FormField control={legacyForm.control} name="customer_id" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.booking.customer")}</FormLabel>
            <FormControl>
              <select
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                {...field}
              >
                <option value="">{t("forms.booking.noCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={legacyForm.control} name="service" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.booking.service")}</FormLabel>
            <FormControl>
              <Input placeholder={t("forms.booking.servicePlaceholder")} className="bg-background/50 border-white/10" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={legacyForm.control} name="booking_date" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.booking.dateTime")}</FormLabel>
            <FormControl>
              <Input type="datetime-local" className="bg-background/50 border-white/10" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={legacyForm.control} name="status" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("forms.booking.status")}</FormLabel>
            <FormControl>
              <select
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
                {...field}
              >
                {LEGACY_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s.toLowerCase()}`)}</option>
                ))}
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
            {t("buttons.cancel")}
          </Button>
          <Button type="submit" disabled={isPending} className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("buttons.saveChanges")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  const useSchedulingForm = isSchedulingCreate || isSchedulingEdit;
  const expandForNewCustomer = allowNewCustomer && customerMode === "new";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "bg-card border-white/10 text-foreground transition-[max-width] duration-200",
          expandForNewCustomer ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? isSchedulingEdit
                ? t("forms.booking.rescheduleTitle")
                : t("forms.booking.editTitle")
              : t("forms.booking.newTitle")}
          </DialogTitle>
        </DialogHeader>
        {!companyId && !isEdit && (
          <p className="text-sm text-destructive">{t("forms.booking.companyRequired")}</p>
        )}
        {useSchedulingForm ? renderSchedulingForm() : isEdit ? renderLegacyForm() : renderSchedulingForm()}
      </DialogContent>
    </Dialog>
  );
}
