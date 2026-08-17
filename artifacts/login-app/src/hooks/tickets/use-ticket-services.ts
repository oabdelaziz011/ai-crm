import { useAuth } from "@/context/auth-context";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { getLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-read-port-adapter";
import { supabase } from "@/lib/supabase";
import type { TicketServiceContext } from "@workspace/ticket-platform";

export function useTicketServiceContext() {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  const companyId = company?.id ?? null;
  const ticketingEntitled = isSuperAdmin || commercialFeatureEnabled("ticketing") === true;
  const canView = Boolean(
    companyId && ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.view")),
  );
  const canCreate = ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.create"));
  const canEdit = ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.edit"));
  const canAssign = ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.assign"));
  const canComment = ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.comment"));
  const canClose = ticketingEntitled && (isSuperAdmin || hasCompanyPermission("tickets.close"));

  function buildContext(): TicketServiceContext {
    if (!companyId) throw new Error("Not authenticated");
    return {
      userId: user?.id ?? null,
      companyId,
      isSuperAdmin,
      hasPermission: hasCompanyPermission,
    };
  }

  function platform() {
    return getLoginAppTicketPlatformServices(supabase);
  }

  return {
    companyId,
    canView,
    canCreate,
    canEdit,
    canAssign,
    canComment,
    canClose,
    buildContext,
    platform,
  };
}
