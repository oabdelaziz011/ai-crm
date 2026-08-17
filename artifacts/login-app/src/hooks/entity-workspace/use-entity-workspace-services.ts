import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createLoginAppEntityActivityWritePort } from "@/lib/application-layer/adapters/entity-port-adapters";
import {
  createEntityAttachmentsService,
  createEntityNotesService,
  createEntityTimelineService,
} from "@/lib/entity-workspace";
import { supabase } from "@/lib/supabase";

export function useEntityWorkspaceServices() {
  const { company, user, profile, displayName } = useAuth();
  const { hasCompanyPermission, isSuperAdmin } = useCompanyPermissionAuth();

  const companyId = company?.id ?? profile?.company_id ?? "";
  const actorUserId = user?.id ?? profile?.id ?? "";

  return useMemo(() => {
    if (!companyId || !actorUserId) {
      return null;
    }
    const ctx = {
      companyId,
      actorUserId,
      isSuperAdmin,
      hasPermission: hasCompanyPermission,
    };
    return {
      ctx,
      notes: createEntityNotesService(ctx),
      attachments: createEntityAttachmentsService(ctx),
      timeline: createEntityTimelineService(ctx),
      /** Existing entity_activities write port — communication / audit events. */
      activities: createLoginAppEntityActivityWritePort(supabase, ctx),
      displayName: displayName || user?.email || null,
    };
  }, [actorUserId, companyId, displayName, hasCompanyPermission, isSuperAdmin, user?.email]);
}
