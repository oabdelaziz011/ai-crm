import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createEntityNotesService } from "@/lib/entity-workspace";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import {
  BusinessAppointmentExceptionService,
  type BusinessApologyExceptionInput,
} from "@/lib/scheduling/business-exceptions";
import { supabase } from "@/lib/supabase";

function useExceptionContext() {
  const { company, user, profile } = useAuth();
  const { hasCompanyPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const companyId = company?.id ?? profile?.company_id ?? null;
  const actorUserId = user?.id ?? profile?.id ?? null;

  if (!companyId || !actorUserId) return null;

  return {
    companyId,
    actorUserId,
    isSuperAdmin,
    hasPermission: hasCompanyPermission,
  };
}

function createService() {
  return new BusinessAppointmentExceptionService(
    supabase,
    getBookingDomainServices().bookingDomain,
    createEntityNotesService,
  );
}

export function usePreviewBusinessApologyException() {
  const ctx = useExceptionContext();

  return useMutation({
    mutationFn: async (input: Omit<BusinessApologyExceptionInput, "idempotencyKey">) => {
      if (!ctx) throw new Error("Not authenticated");
      return createService().preview(ctx, input);
    },
  });
}

export function useExecuteBusinessApologyException() {
  const ctx = useExceptionContext();

  return useMutation({
    mutationFn: async (input: BusinessApologyExceptionInput) => {
      if (!ctx) throw new Error("Not authenticated");
      return createService().execute(ctx, input);
    },
  });
}
