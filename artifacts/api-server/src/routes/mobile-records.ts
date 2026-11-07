/**
 * Authenticated native record actions. Tenant and permissions are resolved
 * before any platform service runs. This route does not call a channel provider.
 */
import { Router, type IRouter } from "express";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { MOBILE_INSTANCE_HEADER } from "../mobile/mobile-access.js";
import { randomUUID } from "node:crypto";
import { decideMobileAction } from "../mobile/mobile-actions.js";
import {
  attachmentPathOwnedBy,
  authorizeAttachmentConversation,
  buildAttachmentObjectPath,
  decideAttachmentRead,
  MOBILE_ATTACHMENT_BUCKET,
  MOBILE_ATTACHMENT_URL_SECONDS,
  validateAttachmentDescriptor,
} from "../mobile/mobile-attachments.js";
import { resolveMobilePrincipal, type MobilePrincipal } from "../mobile/mobile-principal.js";
import {
  decidePushRegistration,
  isPushStorageMissingError,
  pushRegistryClient,
  pushStorageBlockedResponse,
  revokeStoredPushRegistrations,
  savePushRegistration,
} from "../mobile/mobile-push.js";
import { createRecordPorts, runMobileRecord } from "../mobile/mobile-record-executor.js";

const router: IRouter = Router();

router.use(requireSupabaseAuth);

router.post("/mobile/records", async (req, res, next) => {
  try {
    const principal = await resolveMobilePrincipal({
      userId: req.supabaseUser?.id ?? null,
      token: req.supabaseAuthToken ?? null,
      profileCompanyId: req.supabaseCompanyId ?? null,
      isSuperAdmin: Boolean(req.supabaseIsSuperAdmin),
      instanceHeader: req.header(MOBILE_INSTANCE_HEADER),
    });
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    const decision = decideMobileAction({
      scope: principal.scope,
      companyId: principal.company?.id ?? null,
      isSuperAdmin: principal.isSuperAdmin,
      permissions: principal.permissions,
      body: req.body,
    });
    if (!decision.ok) {
      res.status(decision.status).json({ code: decision.code, message: decision.message });
      return;
    }
    const result = await runMobileRecord(
      {
        userId: principal.userId,
        companyId: decision.companyId,
        isSuperAdmin: principal.isSuperAdmin,
        permissions: principal.permissions,
      },
      decision.action,
      createRecordPorts(principal.userClient),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

async function principalFrom(req: { supabaseUser?: { id?: string }; supabaseAuthToken?: string | null; supabaseCompanyId?: string | null; supabaseIsSuperAdmin?: boolean; header(name: string): string | undefined }) {
  return resolveMobilePrincipal({
    userId: req.supabaseUser?.id ?? null,
    token: req.supabaseAuthToken ?? null,
    profileCompanyId: req.supabaseCompanyId ?? null,
    isSuperAdmin: Boolean(req.supabaseIsSuperAdmin),
    instanceHeader: req.header(MOBILE_INSTANCE_HEADER),
  });
}

function canReadConversation(principal: Extract<MobilePrincipal, { ok: true }>): boolean {
  return principal.isSuperAdmin
    || principal.permissions.includes("ai.conversations.view")
    || principal.permissions.includes("ai.conversations.view_assigned");
}

async function liveConversation(principal: Extract<MobilePrincipal, { ok: true }>, id: string) {
  const { data, error } = await principal.userClient
    .from("conversations")
    .select("id, company_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data?.id || !data.company_id) return null;
  return { id: String(data.id), companyId: String(data.company_id) };
}

router.post("/mobile/attachments/prepare", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    const descriptor = validateAttachmentDescriptor({
      bytes: Number(req.body?.bytes),
      mime: String(req.body?.mime ?? ""),
      fileName: String(req.body?.fileName ?? ""),
    });
    if (!descriptor.ok) {
      res.status(descriptor.status).json({ code: descriptor.code, message: descriptor.message });
      return;
    }
    const conversation = await liveConversation(principal, String(req.body?.conversationId ?? ""));
    const authorized = authorizeAttachmentConversation({
      sessionCompanyId: principal.company?.id ?? null,
      claimedCompanyId: typeof req.body?.companyId === "string" ? req.body.companyId : null,
      conversation,
      canReply: principal.isSuperAdmin || principal.permissions.includes("ai.conversations.reply"),
      needsReply: true,
    });
    if (!authorized.ok) {
      res.status(authorized.status).json({ code: authorized.code, message: authorized.message });
      return;
    }
    const path = buildAttachmentObjectPath({
      companyId: authorized.companyId,
      conversationId: authorized.conversationId,
      objectId: randomUUID(),
      fileName: descriptor.fileName,
    });
    res.json({ ok: true, bucket: MOBILE_ATTACHMENT_BUCKET, path, mime: descriptor.mime });
  } catch (error) {
    next(error);
  }
});

router.get("/mobile/attachments", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    if (!canReadConversation(principal)) {
      const denied = decideAttachmentRead({ canRead: false, sessionCompanyId: principal.company?.id ?? null, conversation: null });
      res.status(denied.status).json({ code: denied.code, message: denied.message });
      return;
    }
    const conversation = await liveConversation(principal, String(req.query.conversationId ?? ""));
    const authorized = decideAttachmentRead({
      canRead: true,
      sessionCompanyId: principal.company?.id ?? null,
      conversation,
    });
    if (!authorized.ok) {
      res.status(authorized.status).json({ code: authorized.code, message: authorized.message });
      return;
    }
    const folder = `${authorized.companyId}/${authorized.conversationId}`;
    const listed = await principal.userClient.storage.from(MOBILE_ATTACHMENT_BUCKET).list(folder);
    if (listed.error) {
      res.status(400).json({ code: "validation_error", message: "Attachments could not be listed." });
      return;
    }
    res.json({
      ok: true,
      attachments: (listed.data ?? []).filter((file) => file.name && file.id).map((file) => ({
        name: file.name,
        path: `${folder}/${file.name}`,
        size: typeof file.metadata?.size === "number" ? file.metadata.size : null,
        mime: typeof file.metadata?.mimetype === "string" ? file.metadata.mimetype : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/mobile/attachments/download", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    if (!canReadConversation(principal)) {
      const denied = decideAttachmentRead({ canRead: false, sessionCompanyId: principal.company?.id ?? null, conversation: null });
      res.status(denied.status).json({ code: denied.code, message: denied.message });
      return;
    }
    const conversation = await liveConversation(principal, String(req.body?.conversationId ?? ""));
    const authorized = decideAttachmentRead({
      canRead: true,
      sessionCompanyId: principal.company?.id ?? null,
      claimedCompanyId: typeof req.body?.companyId === "string" ? req.body.companyId : null,
      conversation,
    });
    if (!authorized.ok) {
      res.status(authorized.status).json({ code: authorized.code, message: authorized.message });
      return;
    }
    const path = String(req.body?.path ?? "");
    if (!attachmentPathOwnedBy(path, authorized.companyId, authorized.conversationId)) {
      res.status(404).json({ code: "not_found", message: "Record not found." });
      return;
    }
    const signed = await principal.userClient.storage.from(MOBILE_ATTACHMENT_BUCKET).createSignedUrl(path, MOBILE_ATTACHMENT_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      res.status(404).json({ code: "not_found", message: "Record not found." });
      return;
    }
    res.json({ ok: true, url: signed.data.signedUrl, expiresIn: MOBILE_ATTACHMENT_URL_SECONDS });
  } catch (error) {
    next(error);
  }
});

router.post("/mobile/attachments/delete", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    const conversation = await liveConversation(principal, String(req.body?.conversationId ?? ""));
    const authorized = authorizeAttachmentConversation({
      sessionCompanyId: principal.company?.id ?? null,
      claimedCompanyId: typeof req.body?.companyId === "string" ? req.body.companyId : null,
      conversation,
      canReply: principal.isSuperAdmin || principal.permissions.includes("ai.conversations.reply"),
      needsReply: true,
    });
    if (!authorized.ok) {
      res.status(authorized.status).json({ code: authorized.code, message: authorized.message });
      return;
    }
    const path = String(req.body?.path ?? "");
    if (!attachmentPathOwnedBy(path, authorized.companyId, authorized.conversationId)) {
      res.status(404).json({ code: "not_found", message: "Record not found." });
      return;
    }
    const removed = await principal.userClient.storage.from(MOBILE_ATTACHMENT_BUCKET).remove([path]);
    if (removed.error) {
      res.status(403).json({ code: "forbidden", message: "Permission denied." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/mobile/push-token", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    const decision = decidePushRegistration(req.body, principal.company?.id ?? null);
    if (!decision.ok) {
      res.status(decision.status).json({ code: decision.code, message: decision.message });
      return;
    }
    try {
      const saved = await savePushRegistration(pushRegistryClient(), {
        userId: principal.userId,
        companyId: principal.company?.id ?? "",
        token: decision.token,
        platform: decision.platform,
        deviceName: decision.deviceName,
      });
      res.json({ ok: true, stored: true, duplicate: saved.duplicate, delivered: false });
    } catch (error) {
      if (isPushStorageMissingError(error)) {
        const blocked = pushStorageBlockedResponse();
        res.status(blocked.status).json(blocked.body);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.delete("/mobile/push-token", async (req, res, next) => {
  try {
    const principal = await principalFrom(req);
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    if (!principal.company?.id) {
      res.status(403).json({ code: "tenant_required", message: "A company workspace is required." });
      return;
    }
    try {
      await revokeStoredPushRegistrations(pushRegistryClient(), principal.userId, principal.company.id);
      res.json({ ok: true, revoked: true, delivered: false });
    } catch (error) {
      if (isPushStorageMissingError(error)) {
        const blocked = pushStorageBlockedResponse();
        res.status(blocked.status).json(blocked.body);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

export default router;
