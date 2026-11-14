/**
 * WhatsApp connection lifecycle (Disconnect / Transfer) — ValueOR tenant binding only.
 * Never issues Meta Graph DELETE, deregister, or subscribed_apps unsubscribe.
 */

export type WhatsAppLifecycleAction = "disconnect" | "transfer";

export type WhatsAppLifecycleResult = {
  ok: true;
  action: WhatsAppLifecycleAction;
  companyId?: string;
  fromCompanyId?: string;
  toCompanyId?: string;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  eventId: string | null;
};

export class WhatsAppConnectionLifecycleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "forbidden"
      | "confirmation_required"
      | "phone_mismatch"
      | "not_found"
      | "no_phone_binding"
      | "missing_credentials"
      | "phone_in_use"
      | "target_has_active_connection"
      | "same_company"
      | "bad_request"
      | "rpc_failed",
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "WhatsAppConnectionLifecycleError";
  }
}

export type WhatsAppLifecycleRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

function mapRpcError(error: { message: string; code?: string }): WhatsAppConnectionLifecycleError {
  const msg = String(error.message ?? "rpc_failed");
  const lower = msg.toLowerCase();
  if (lower.includes("forbidden") || error.code === "42501") {
    return new WhatsAppConnectionLifecycleError("Not authorized for this WhatsApp lifecycle action.", "forbidden", 403);
  }
  if (lower.includes("confirmation_required")) {
    return new WhatsAppConnectionLifecycleError(
      "Confirmation text is required (type disconnect/transfer).",
      "confirmation_required",
      400,
    );
  }
  if (lower.includes("phone_mismatch")) {
    return new WhatsAppConnectionLifecycleError("Phone Number ID confirmation does not match.", "phone_mismatch", 400);
  }
  if (lower.includes("no_phone_binding")) {
    return new WhatsAppConnectionLifecycleError("Source company has no phone_number_id to transfer.", "no_phone_binding", 404);
  }
  if (lower.includes("missing_credentials")) {
    return new WhatsAppConnectionLifecycleError("Source company has no credentials to transfer.", "missing_credentials", 400);
  }
  if (lower.includes("not_found") || error.code === "P0002") {
    return new WhatsAppConnectionLifecycleError("WhatsApp connection not found.", "not_found", 404);
  }
  if (lower.includes("phone_in_use") || error.code === "23505") {
    return new WhatsAppConnectionLifecycleError(
      "Phone Number ID is already bound to another company.",
      "phone_in_use",
      409,
    );
  }
  if (lower.includes("target_has_active_connection")) {
    return new WhatsAppConnectionLifecycleError(
      "Target company already has a different active WhatsApp connection.",
      "target_has_active_connection",
      409,
    );
  }
  if (lower.includes("same_company")) {
    return new WhatsAppConnectionLifecycleError("Source and target company must differ.", "same_company", 400);
  }
  return new WhatsAppConnectionLifecycleError(msg, "rpc_failed", 500);
}

function asResult(action: WhatsAppLifecycleAction, data: unknown): WhatsAppLifecycleResult {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    ok: true,
    action,
    companyId: typeof row.company_id === "string" ? row.company_id : undefined,
    fromCompanyId: typeof row.from_company_id === "string" ? row.from_company_id : undefined,
    toCompanyId: typeof row.to_company_id === "string" ? row.to_company_id : undefined,
    phoneNumberId: typeof row.phone_number_id === "string" ? row.phone_number_id : null,
    businessAccountId: typeof row.business_account_id === "string" ? row.business_account_id : null,
    eventId: typeof row.event_id === "string" ? row.event_id : null,
  };
}

export async function disconnectCompanyWhatsAppConnection(
  input: {
    companyId: string;
    confirmPhoneNumberId?: string | null;
    confirmText: string;
    actorUserId?: string | null;
  },
  client: WhatsAppLifecycleRpcClient,
): Promise<WhatsAppLifecycleResult> {
  const companyId = String(input.companyId ?? "").trim();
  if (!companyId) {
    throw new WhatsAppConnectionLifecycleError("companyId required", "bad_request", 400);
  }
  const { data, error } = await client.rpc("disconnect_company_whatsapp_connection", {
    p_company_id: companyId,
    p_confirm_phone_number_id: input.confirmPhoneNumberId?.trim() || null,
    p_confirm_text: String(input.confirmText ?? "").trim(),
    p_actor_user_id: input.actorUserId?.trim() || null,
  });
  if (error) throw mapRpcError(error);
  return asResult("disconnect", data);
}

export async function recordWhatsAppReconnectEvent(
  input: {
    companyId: string;
    source: "manual" | "embedded_signup";
    phoneNumberId?: string | null;
    businessAccountId?: string | null;
    actorUserId?: string | null;
  },
  client: WhatsAppLifecycleRpcClient,
): Promise<{ eventId: string | null }> {
  const companyId = String(input.companyId ?? "").trim();
  if (!companyId) {
    throw new WhatsAppConnectionLifecycleError("companyId required", "bad_request", 400);
  }
  const action =
    input.source === "embedded_signup" ? "reconnect_embedded_signup" : "reconnect_manual";
  const { data, error } = await client.rpc("record_whatsapp_connection_lifecycle_event", {
    p_action: action,
    p_company_id: companyId,
    p_phone_number_id: input.phoneNumberId?.trim() || null,
    p_business_account_id: input.businessAccountId?.trim() || null,
    p_meta: { source: input.source },
    p_actor_user_id: input.actorUserId?.trim() || null,
  });
  if (error) throw mapRpcError(error);
  return { eventId: typeof data === "string" ? data : null };
}

export async function transferCompanyWhatsAppConnection(
  input: {
    fromCompanyId: string;
    toCompanyId: string;
    confirmPhoneNumberId: string;
    confirmText: string;
    actorUserId?: string | null;
  },
  client: WhatsAppLifecycleRpcClient,
): Promise<WhatsAppLifecycleResult> {
  const fromCompanyId = String(input.fromCompanyId ?? "").trim();
  const toCompanyId = String(input.toCompanyId ?? "").trim();
  const confirmPhoneNumberId = String(input.confirmPhoneNumberId ?? "").trim();
  if (!fromCompanyId || !toCompanyId) {
    throw new WhatsAppConnectionLifecycleError("fromCompanyId and toCompanyId required", "bad_request", 400);
  }
  if (!confirmPhoneNumberId) {
    throw new WhatsAppConnectionLifecycleError("confirmPhoneNumberId required", "bad_request", 400);
  }
  if (fromCompanyId === toCompanyId) {
    throw new WhatsAppConnectionLifecycleError("Source and target company must differ.", "same_company", 400);
  }

  const { data, error } = await client.rpc("transfer_company_whatsapp_connection", {
    p_from_company_id: fromCompanyId,
    p_to_company_id: toCompanyId,
    p_confirm_phone_number_id: confirmPhoneNumberId,
    p_confirm_text: String(input.confirmText ?? "").trim(),
    p_actor_user_id: input.actorUserId?.trim() || null,
  });
  if (error) throw mapRpcError(error);
  return asResult("transfer", data);
}
