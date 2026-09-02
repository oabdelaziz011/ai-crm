import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { resolveConversationAttachmentUrl } from "@/lib/omnichannel/services/conversation-attachment-service";
import type { UnifiedMessageAttachment } from "@/lib/omnichannel/types/unified-conversation";
import {
  isConversationAttachmentsSignedUrl,
  isInternalConversationAttachmentStoragePath,
} from "@workspace/channel-platform/client";

/**
 * Resolve display URL for a single attachment once per storagePath.
 * Internal objects remint after auth; external URLs pass through.
 */
export function useResolvedAttachmentDisplayUrl(
  attachment: UnifiedMessageAttachment,
  conversationId: string | null,
): { url: string | null; loading: boolean; error: string | null } {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const companyId = profile?.company_id ?? null;
  const storagePath =
    typeof attachment.storagePath === "string" && attachment.storagePath.trim()
      ? attachment.storagePath.trim()
      : null;
  const needsResolve = Boolean(
    storagePath && conversationId && companyId && isInternalConversationAttachmentStoragePath(storagePath),
  );

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(needsResolve);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!needsResolve || !storagePath || !conversationId || !companyId) {
      setResolvedUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void resolveConversationAttachmentUrl({
      companyId,
      conversationId,
      storagePath,
      ctx: {
        userId: user?.id ?? null,
        companyId,
        isSuperAdmin,
        hasPermission,
      },
    })
      .then((url) => {
        if (cancelled) return;
        setResolvedUrl(url);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResolvedUrl(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : "attachment_resolve_failed");
      });

    return () => {
      cancelled = true;
    };
  }, [needsResolve, storagePath, conversationId, companyId, user?.id, isSuperAdmin, hasPermission]);

  if (needsResolve) {
    return { url: resolvedUrl, loading, error };
  }

  // External / inbound: pass through. Legacy internal signed URL without storagePath: fallback only.
  const fallback = attachment.url ?? null;
  if (fallback && isConversationAttachmentsSignedUrl(fallback) && !storagePath) {
    return { url: fallback, loading: false, error: null };
  }
  return { url: fallback, loading: false, error: null };
}
