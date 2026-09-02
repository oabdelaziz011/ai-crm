import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { refreshCustomerProfileCache } from "@/lib/customer-profile/refresh-customer-profile";
import {
  BookingProfileService,
  CallService,
  ConversationService,
  InvoiceProfileService,
  type BookingModalPrefill,
  type InvoiceModalPrefill,
} from "@/lib/customer-profile/services";
import type {
  CustomerProfileContext,
  CustomerProfileQuickAction,
} from "@/components/customer-profile/types";
import type { Booking, Customer, Invoice } from "@/lib/types";

type UseCustomerProfileQuickActionsOptions = {
  customer: Customer | null | undefined;
  context?: CustomerProfileContext;
  onCloseProfile?: () => void;
  onOpenNotesTab?: () => void;
  canExecuteAction?: (action: CustomerProfileQuickAction) => boolean;
};

function resolveQuickActionErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof Error) {
    if (error.message === "CUSTOMER_PHONE_MISSING") {
      return t("dashboard.customerProfile.quickActions.errors.phoneMissing");
    }
    if (error.message === "WHATSAPP_CONVERSATION_NOT_FOUND") {
      return t("dashboard.customerProfile.quickActions.errors.whatsappNotFound");
    }
    return error.message;
  }
  return t("dashboard.customerProfile.quickActions.errors.generic");
}

export function useCustomerProfileQuickActions({
  customer,
  context,
  onCloseProfile,
  onOpenNotesTab,
  canExecuteAction,
}: UseCustomerProfileQuickActionsOptions) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { hasCompanyPermission } = useCompanyPermissionAuth();

  const [pendingAction, setPendingAction] = useState<CustomerProfileQuickAction | null>(
    null,
  );
  const [bookingPrefill, setBookingPrefill] = useState<BookingModalPrefill | null>(null);
  const [invoicePrefill, setInvoicePrefill] = useState<InvoiceModalPrefill | null>(null);

  const refreshProfile = useCallback(
    (customerId: string) => {
      refreshCustomerProfileCache(
        queryClient,
        customerId,
        context?.companyId ?? null,
      );
    },
    [context?.companyId, queryClient],
  );

  const handleBookingCreated = useCallback(
    (created: Booking) => {
      const customerId = created.customer_id ?? bookingPrefill?.customerId;
      if (customerId) {
        refreshProfile(customerId);
      }
      setBookingPrefill(null);
      toast({
        title: t("dashboard.customerProfile.quickActions.success.bookingCreated"),
      });
    },
    [bookingPrefill?.customerId, refreshProfile, t, toast],
  );

  const handleInvoiceCreated = useCallback(
    (created: Invoice) => {
      const customerId = created.customer_id ?? invoicePrefill?.customerId;
      if (customerId) {
        refreshProfile(customerId);
      }
      setInvoicePrefill(null);
      toast({
        title: t("dashboard.customerProfile.quickActions.success.invoiceCreated"),
      });
    },
    [invoicePrefill?.customerId, refreshProfile, t, toast],
  );

  const executeQuickAction = useCallback(
    async (action: CustomerProfileQuickAction) => {
      if (!customer) return;

      if (canExecuteAction && !canExecuteAction(action)) return;

      if (action === "add-note") {
        onOpenNotesTab?.();
        return;
      }

      if (action === "new-booking") {
        setBookingPrefill(
          BookingProfileService.buildModalPrefill(customer, context?.companyId),
        );
        return;
      }

      if (action === "new-invoice") {
        setInvoicePrefill(
          InvoiceProfileService.buildModalPrefill(customer, context?.companyId),
        );
        return;
      }

      setPendingAction(action);
      try {
        if (action === "call") {
          CallService.initiateCall(customer.phone);
          return;
        }

        if (action === "whatsapp") {
          await ConversationService.openWhatsappConversation({
            customerId: customer.id,
            companyId: context?.companyId,
            phone: customer.phone,
            profileContext: context,
            navigate: setLocation,
            onCloseProfile,
            hasPermission: hasCompanyPermission,
          });
          return;
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: t("dashboard.customerProfile.quickActions.errors.title"),
          description: resolveQuickActionErrorMessage(error, t),
        });
      } finally {
        setPendingAction(null);
      }
    },
    [canExecuteAction, context, customer, hasCompanyPermission, onCloseProfile, onOpenNotesTab, setLocation, t, toast],
  );

  const isActionPending = useCallback(
    (action: CustomerProfileQuickAction) => pendingAction === action,
    [pendingAction],
  );

  return {
    executeQuickAction,
    isActionPending,
    pendingAction,
    bookingPrefill,
    closeBookingModal: () => setBookingPrefill(null),
    invoicePrefill,
    closeInvoiceModal: () => setInvoicePrefill(null),
    handleBookingCreated,
    handleInvoiceCreated,
  };
}
