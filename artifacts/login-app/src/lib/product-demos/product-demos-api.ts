/**
 * Client for /product-demos/* APIs (api-server).
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";

export type ProductDemoOffering = {
  id: string;
  companyId: string;
  catalogProductId: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  capacity: number;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ProductDemoWindow = {
  id: string;
  companyId: string;
  offeringId: string;
  presenterUserId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  isActive: boolean;
};

export type ProductDemoPresenter = {
  id: string;
  companyId: string;
  offeringId: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
};

export type ProductDemoSlot = {
  id: string;
  companyId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: string;
  capacity: number;
  bookedCount: number;
  publishedAt: string | null;
  blockedReason: string | null;
};

export type ProductDemoBooking = {
  id: string;
  companyId: string;
  slotId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  customerId: string | null;
  leadId: string | null;
  conversationId: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  status: string;
  confirmationNumber: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type BookableDemoSlot = {
  slotId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  remainingCapacity: number;
};

export function productDemoErrorMessage(
  error: unknown,
  translate: (key: string) => string,
): string {
  if (error instanceof ProductDemoClientError) {
    if (
      error.status === 403 ||
      error.code === "forbidden" ||
      error.code === "PERMISSION_DENIED"
    ) {
      return translate("productDemos.forbidden");
    }
    if (error.code === "presenter_required") return translate("productDemos.presenterRequired");
    if (error.code === "presenter_not_in_company") {
      return translate("productDemos.presenterNotInCompany");
    }
    if (error.code === "presenter_not_assigned") {
      return translate("productDemos.presenterNotAssigned");
    }
    if (error.code === "invalid_window") return translate("productDemos.invalidWindow");
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return translate("productDemos.requestFailed");
}

export class ProductDemoClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductDemoClientError";
  }
}

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken({ forceRefresh });
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function apiBase(): string {
  const base = resolveAuthenticatedApiBase();
  if (!base) throw new Error("API base URL is not configured");
  return base;
}

async function parseError(res: Response): Promise<ProductDemoClientError> {
  let code = "request_failed";
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      code?: string;
    };
    code = body.error || body.code || code;
    message = body.message || body.error || message;
  } catch {
    // ignore
  }
  return new ProductDemoClientError(res.status, code, message);
}

async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${apiBase()}${path}`;
  const once = async (forceRefresh: boolean) =>
    fetch(url, {
      method,
      headers: await authHeaders(forceRefresh),
      credentials: "include",
      body: body != null ? JSON.stringify(body) : undefined,
    });

  let res = await once(false);
  if (res.status === 401) res = await once(true);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export function listProductDemoOfferings(input?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ProductDemoOffering[]; total: number }> {
  return requestJson("GET", `/product-demos/offerings${qs(input ?? {})}`);
}

export function createProductDemoOffering(body: {
  catalogProductId: string;
  title?: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  timezone?: string;
  capacity?: number;
}): Promise<{ offering: ProductDemoOffering }> {
  return requestJson("POST", "/product-demos/offerings", body);
}

export function assignProductDemoPresenter(
  offeringId: string,
  body: { userId: string; isActive?: boolean },
): Promise<{ presenter: ProductDemoPresenter }> {
  return requestJson(
    "POST",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/presenters`,
    body,
  );
}

export function listProductDemoWindows(offeringId: string): Promise<{
  windows: ProductDemoWindow[];
  presenters: ProductDemoPresenter[];
}> {
  return requestJson(
    "GET",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/windows`,
  );
}

export function setProductDemoWeekday(
  offeringId: string,
  body: {
    weekday: number;
    isWorkDay: boolean;
    startTime?: string;
    endTime?: string;
    presenterUserId?: string | null;
    timezone?: string;
  },
): Promise<{ weekday: number; isWorkDay: boolean }> {
  return requestJson(
    "POST",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/weekdays`,
    body,
  );
}

export function addProductDemoAvailabilityWindow(
  offeringId: string,
  body: {
    presenterUserId?: string | null;
    weekday: number;
    startTime: string;
    endTime: string;
    timezone?: string;
  },
): Promise<{ window: unknown }> {
  return requestJson(
    "POST",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/windows`,
    body,
  );
}

export function generateProductDemoSlots(
  offeringId: string,
  body?: { daysAhead?: number; publish?: boolean; fromDate?: string; dates?: string[] },
): Promise<{ created?: number; published?: number; slots?: ProductDemoSlot[] } & Record<string, unknown>> {
  return requestJson(
    "POST",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/generate-slots`,
    body ?? {},
  );
}

export function setProductDemoOfferingStatus(
  offeringId: string,
  status: "draft" | "published" | "archived",
): Promise<{ offering: ProductDemoOffering }> {
  return requestJson(
    "POST",
    `/product-demos/offerings/${encodeURIComponent(offeringId)}/status`,
    { status },
  );
}

export function listProductDemoSlots(input?: {
  offeringId?: string;
  catalogProductId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ProductDemoSlot[]; total: number }> {
  return requestJson("GET", `/product-demos/slots${qs(input ?? {})}`);
}

export function publishProductDemoSlot(slotId: string): Promise<{ slot: ProductDemoSlot }> {
  return requestJson("POST", `/product-demos/slots/${encodeURIComponent(slotId)}/publish`);
}

export function unpublishProductDemoSlot(slotId: string): Promise<{ slot: ProductDemoSlot }> {
  return requestJson("POST", `/product-demos/slots/${encodeURIComponent(slotId)}/unpublish`);
}

export function blockProductDemoSlot(
  slotId: string,
  reason?: string,
): Promise<{ slot: ProductDemoSlot }> {
  return requestJson("POST", `/product-demos/slots/${encodeURIComponent(slotId)}/block`, {
    reason,
  });
}

export function listProductDemoBookings(input?: {
  catalogProductId?: string;
  customerId?: string;
  leadId?: string;
  presenterUserId?: string;
  status?: string;
  from?: string;
  to?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ProductDemoBooking[]; total: number }> {
  return requestJson("GET", `/product-demos/bookings${qs(input ?? {})}`);
}

export function listBookableProductDemoSlots(input: {
  catalogProductId: string;
  limit?: number;
}): Promise<{ items: BookableDemoSlot[]; nearest: BookableDemoSlot | null }> {
  return requestJson("GET", `/product-demos/bookable-slots${qs(input)}`);
}

export function confirmProductDemoBooking(body: {
  slotId: string;
  customerId?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  notes?: string | null;
  clientRequestId?: string | null;
}): Promise<{ booking: ProductDemoBooking }> {
  return requestJson("POST", "/product-demos/bookings/confirm", body);
}

export function cancelProductDemoBooking(
  bookingId: string,
  reason?: string,
): Promise<{ booking: ProductDemoBooking }> {
  return requestJson(
    "POST",
    `/product-demos/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { reason },
  );
}
