import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CustomerProfileDrawer } from "@/components/customer-profile/customer-profile-drawer";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import type {
  CustomerProfileContext,
  CustomerProfileOpenParams,
  CustomerProfileQuickAction,
  CustomerProfileTab,
} from "@/components/customer-profile/types";
import { useCustomerProfileQuickActions } from "@/hooks/use-customer-profile-quick-actions";
import { useCustomer } from "@/hooks/use-customer";
import { useCustomers } from "@/hooks/use-customers";

type CustomerProfileState = {
  open: boolean;
  customerId: string | null;
  tab: CustomerProfileTab;
  context?: CustomerProfileContext;
};

type CustomerProfileContextValue = {
  openCustomerProfile: (params: CustomerProfileOpenParams) => void;
  closeCustomerProfile: () => void;
  isOpen: boolean;
  customerId: string | null;
};

const CustomerProfileContextInstance = createContext<CustomerProfileContextValue | null>(null);

const CLOSED_STATE: CustomerProfileState = {
  open: false,
  customerId: null,
  tab: "overview",
};

function CustomerProfileQuickActionHost({
  state,
  onClose,
  onTabChange,
}: {
  state: CustomerProfileState;
  onClose: () => void;
  onTabChange: (tab: CustomerProfileTab) => void;
}) {
  const { data: customer } = useCustomer(state.open ? state.customerId : null);
  const { data: customers = [] } = useCustomers();

  const {
    executeQuickAction,
    isActionPending,
    bookingPrefill,
    closeBookingModal,
    invoicePrefill,
    closeInvoiceModal,
    handleBookingCreated,
    handleInvoiceCreated,
  } = useCustomerProfileQuickActions({
    customer,
    context: state.context,
    onCloseProfile: onClose,
    onOpenNotesTab: () => onTabChange("notes"),
  });

  return (
    <>
      <CustomerProfileDrawer
        open={state.open}
        onClose={onClose}
        customerId={state.customerId}
        defaultTab={state.tab}
        context={state.context}
        onQuickAction={(action) => void executeQuickAction(action)}
        isQuickActionPending={isActionPending}
      />

      <BookingModal
        open={!!bookingPrefill}
        onClose={closeBookingModal}
        customers={customers}
        companyId={bookingPrefill?.companyId ?? state.context?.companyId ?? null}
        defaultCustomerId={bookingPrefill?.customerId ?? null}
        lockCustomer={!!bookingPrefill}
        onCreated={handleBookingCreated}
      />

      <InvoiceModal
        open={!!invoicePrefill}
        onClose={closeInvoiceModal}
        customers={customers}
        defaultCustomerId={invoicePrefill?.customerId ?? null}
        lockCustomer={!!invoicePrefill}
        onCreated={handleInvoiceCreated}
      />
    </>
  );
}

export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CustomerProfileState>(CLOSED_STATE);

  const openCustomerProfile = useCallback((params: CustomerProfileOpenParams) => {
    setState({
      open: true,
      customerId: params.customerId,
      tab: params.tab ?? "overview",
      context: params.context,
    });
  }, []);

  const closeCustomerProfile = useCallback(() => {
    setState(CLOSED_STATE);
  }, []);

  const handleTabChange = useCallback((tab: CustomerProfileTab) => {
    setState((prev) => ({ ...prev, tab, open: true }));
  }, []);

  const value = useMemo(
    () => ({
      openCustomerProfile,
      closeCustomerProfile,
      isOpen: state.open,
      customerId: state.customerId,
    }),
    [closeCustomerProfile, openCustomerProfile, state.customerId, state.open],
  );

  return (
    <CustomerProfileContextInstance.Provider value={value}>
      {children}
      <CustomerProfileQuickActionHost
        state={state}
        onClose={closeCustomerProfile}
        onTabChange={handleTabChange}
      />
    </CustomerProfileContextInstance.Provider>
  );
}

export function useCustomerProfile() {
  const ctx = useContext(CustomerProfileContextInstance);
  if (!ctx) {
    throw new Error("useCustomerProfile must be used within CustomerProfileProvider");
  }
  return ctx;
}

export type { CustomerProfileQuickAction };
