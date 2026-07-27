import { useMutation, useQuery } from "@tanstack/react-query";
import { getCustomerPortalServices } from "@/lib/customer-portal/services/customer-portal-service";
import {
  portalAppointmentsKey,
  portalProfileKey,
  portalResourcesKey,
  portalServicesKey,
  portalSlotsKey,
} from "@/lib/customer-portal/cache/query-keys";
import type { PortalAppointmentFilter, PortalBookingRequest } from "@/lib/customer-portal/types";
import { setPortalSession } from "@/lib/customer-portal/security/portal-session-store";

const portal = getCustomerPortalServices();

export function usePortalProfile(slug: string | null) {
  return useQuery({
    queryKey: portalProfileKey(slug ?? ""),
    enabled: Boolean(slug),
    queryFn: () => portal.settings.getBySlug(slug!),
  });
}

export function usePortalServices(companyId: string | null) {
  return useQuery({
    queryKey: portalServicesKey(companyId ?? ""),
    enabled: Boolean(companyId),
    queryFn: () => portal.catalog.listServices(companyId!),
  });
}

export function usePortalResources(companyId: string | null, serviceId?: string) {
  return useQuery({
    queryKey: portalResourcesKey(companyId ?? "", serviceId),
    enabled: Boolean(companyId),
    queryFn: () => portal.catalog.listResources(companyId!, serviceId),
  });
}

export function usePortalSlots(
  companyId: string | null,
  resourceId: string | null,
  serviceId: string | null,
  date: string | null,
) {
  return useQuery({
    queryKey: portalSlotsKey(companyId ?? "", resourceId ?? "", serviceId ?? "", date ?? ""),
    enabled: Boolean(companyId && resourceId && serviceId && date),
    staleTime: 15_000,
    queryFn: () => portal.booking.getAvailableSlots(companyId!, resourceId!, serviceId!, date!),
  });
}

export function usePortalAppointments(
  companyId: string | null,
  customerId: string | null,
  filter: PortalAppointmentFilter,
) {
  return useQuery({
    queryKey: portalAppointmentsKey(companyId ?? "", customerId ?? "", filter),
    enabled: Boolean(companyId && customerId),
    queryFn: () => portal.appointments.list(companyId!, customerId!, filter),
  });
}

export function usePortalAuthVerify() {
  return useMutation({
    mutationFn: async (input: { challengeId: string; code: string }) => {
      const session = await portal.auth.verifyChallenge(input);
      setPortalSession({
        token: session.token,
        customerId: session.customerId,
        companyId: session.companyId,
        expiresAt: session.expiresAt,
      });
      return session;
    },
  });
}

export function usePublicBookingCreate(ownerUserId?: string | null) {
  return useMutation({
    mutationFn: (request: PortalBookingRequest) => portal.booking.createBooking(request, ownerUserId),
  });
}

export function usePortalCheckIn() {
  return useMutation({
    mutationFn: (token: string) => portal.checkIn.checkInByToken(token),
  });
}

export function usePortalCancelAppointment(companyId: string | null) {
  return useMutation({
    mutationFn: (bookingId: string) => portal.appointments.cancel(companyId!, bookingId),
  });
}

export function usePortalRescheduleAppointment(companyId: string | null) {
  return useMutation({
    mutationFn: (input: { bookingId: string; date: string; slotStart: string }) =>
      portal.appointments.reschedule(companyId!, input.bookingId, input.date, input.slotStart),
  });
}
