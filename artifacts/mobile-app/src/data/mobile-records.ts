export type MobileRecordResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export async function postMobileRecord(input: {
  apiUrl: string;
  token: string;
  instanceHostname: string;
  sessionCompanyId: string;
  action: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<MobileRecordResult> {
  const claimed = typeof input.action.companyId === "string" ? input.action.companyId : null;
  if (claimed && claimed !== input.sessionCompanyId) {
    return { ok: false, status: 403, code: "cross_tenant", message: "Access denied for this company." };
  }
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await fetchImpl(`${input.apiUrl}/api/mobile/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        "X-ValueOR-Instance": input.instanceHostname,
        Accept: "application/json",
      },
      body: JSON.stringify({ ...input.action, companyId: input.sessionCompanyId }),
    });
  } catch {
    return { ok: false, status: 0, code: "network_error", message: "The network request failed." };
  }
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.status === 401 || response.status === 403 && body?.code === "unauthorized") {
    return { ok: false, status: response.status, code: "session_expired", message: "Your session has expired." };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof body?.code === "string" ? body.code : "error",
      message: typeof body?.message === "string" ? body.message : "Something went wrong.",
    };
  }
  return { ok: true, status: response.status, body: body ?? {} };
}

export async function deliverConfirmedMessage(input: {
  apiUrl: string;
  token: string;
  instanceHostname: string;
  sessionCompanyId: string;
  prepared: Record<string, unknown> | null;
  fetchImpl?: FetchLike;
}): Promise<MobileRecordResult> {
  const delivery = input.prepared?.delivery;
  if (!delivery || typeof delivery !== "object") {
    return { ok: false, status: 400, code: "confirmation_required", message: "Confirm the message before it can be sent." };
  }
  const payload = delivery as { path?: unknown; body?: Record<string, unknown> };
  if (payload.body?.companyId !== input.sessionCompanyId || payload.path !== "/api/omnichannel/outbound/dispatch") {
    return { ok: false, status: 403, code: "cross_tenant", message: "Access denied for this company." };
  }
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const response = await fetchImpl(`${input.apiUrl}${payload.path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        "X-ValueOR-Instance": input.instanceHostname,
        Accept: "application/json",
      },
      body: JSON.stringify(payload.body),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      return { ok: false, status: response.status, code: "delivery_failed", message: typeof body?.message === "string" ? body.message : "The message was not sent." };
    }
    return { ok: true, status: response.status, body: body ?? {} };
  } catch {
    return { ok: false, status: 0, code: "network_error", message: "The network request failed." };
  }
}
