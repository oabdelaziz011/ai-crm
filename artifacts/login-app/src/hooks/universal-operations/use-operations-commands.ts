import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { invalidateOperationsPlatformQueries } from "@/lib/application-layer/operations-platform-sync";

function useOperationsCommandContext() {
  const {
    companyId,
    isSuperAdmin,
    hasCompanyPermission,
    buildPortContext,
  } = useCompanyPermissionAuth();

  if (!companyId) return null;

  let portContext;
  try {
    portContext = buildPortContext();
  } catch {
    return null;
  }

  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
  });

  return { registry, context, companyId };
}

export function useOperationsCommands(customerId?: string | null) {
  const qc = useQueryClient();
  const cmdContext = useOperationsCommandContext();

  const invalidate = (bookingId?: string, overrideCustomerId?: string | null) => {
    if (!cmdContext) return;
    invalidateOperationsPlatformQueries(qc, {
      companyId: cmdContext.companyId,
      customerId: overrideCustomerId ?? customerId,
      bookingId,
    });
  };

  const checkIn = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().operations.checkInCustomer({ bookingId }, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, bookingId) => invalidate(bookingId),
  });

  const checkOut = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().operations.checkOutCustomer({ bookingId }, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, bookingId) => invalidate(bookingId),
  });

  const cancelBooking = useMutation({
    mutationFn: async (input: { bookingId: string; reason?: string }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().booking.cancelBooking(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const rescheduleBooking = useMutation({
    mutationFn: async (input: { bookingId: string; newScheduledAt: string; reason?: string }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().booking.rescheduleBooking(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const assignEmployee = useMutation({
    mutationFn: async (input: { bookingId: string; employeeId: string }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().operations.assignEmployee(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const markNoShow = useMutation({
    mutationFn: async (input: { bookingId: string; gracePeriodMinutes?: number }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().operations.markNoShowBooking(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const collectPayment = useMutation({
    mutationFn: async (input: {
      customerId: string;
      amountCents: number;
      currency: string;
      method: string;
      invoiceId?: string;
      bookingId?: string;
      discountCents?: number;
      taxCents?: number;
      serviceDescription?: string;
      servicePriceCents?: number;
    }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().payment.collectPayment(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId, input.customerId),
  });

  const transitionClinicStatus = useMutation({
    mutationFn: async (input: {
      bookingId: string;
      status: "with_nurse" | "in_progress" | "archived";
    }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry
        .getServices()
        .operations.transitionClinicStatus(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const completeTriage = useMutation({
    mutationFn: async (input: { bookingId: string }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry
        .getServices()
        .operations.completeTriage(input, cmdContext.context);
      return result.data;
    },
    onSuccess: (_data, input) => invalidate(input.bookingId),
  });

  const generateInvoice = useMutation({
    mutationFn: async (input: {
      customerId: string;
      amountCents: number;
      currency: string;
    }) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().invoice.generateInvoice(input, cmdContext.context);
      return result.data;
    },
    onSuccess: () => invalidate(),
  });

  return {
    checkIn,
    checkOut,
    cancelBooking,
    rescheduleBooking,
    assignEmployee,
    markNoShow,
    collectPayment,
    transitionClinicStatus,
    completeTriage,
    generateInvoice,
    isReady: Boolean(cmdContext),
  };
}
