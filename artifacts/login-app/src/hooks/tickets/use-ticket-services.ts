import { useAuth } from "@/context/auth-context";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useAuthUser } from "@/hooks/use-rbac";
import { getLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-read-port-adapter";
import { supabase } from "@/lib/supabase";
import type { TicketServiceContext } from "@workspace/ticket-platform";

export function useTicketServiceContext() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  const companyId = company?.id ?? null;
  const ticketingEntitled = isSuperAdmin || commercialFeatureEnabled("ticketing") === true;
  const canView = Boolean(
    companyId && ticketingEntitled && (isSuperAdmin || hasPermission("tickets.view")),
  );
  const canCreate = ticketingEntitled && (isSuperAdmin || hasPermission("tickets.create"));
  const canEdit = ticketingEntitled && (isSuperAdmin || hasPermission("tickets.edit"));
  const canAssign = ticketingEntitled && (isSuperAdmin || hasPermission("tickets.assign"));
  const canComment = ticketingEntitled && (isSuperAdmin || hasPermission("tickets.comment"));
  const canClose = ticketingEntitled && (isSuperAdmin || hasPermission("tickets.close"));

  function buildContext(): TicketServiceContext {
    if (!companyId) throw new Error("Not authenticated");
    return {
      userId: user?.id ?? null,
      companyId,
      isSuperAdmin,
      hasPermission,
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
