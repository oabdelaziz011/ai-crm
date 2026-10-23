/**
 * Product demo scheduling & bookings API (independent of clinic scheduling).
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  createProductDemoSchedulingServices,
  PRODUCT_DEMO_PERMISSIONS,
  ProductDemoConflictError,
  ProductDemoPermissionError,
  ProductDemoValidationError,
} from "@workspace/product-demo-scheduling";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";

const router: IRouter = Router();
router.use(requireSupabaseAuth);

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getUserScopedClient(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!url || !anon || !token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function mapError(error: unknown): never {
  if (error instanceof ProductDemoPermissionError) {
    throw new HttpError(403, error.message, "forbidden");
  }
  if (error instanceof ProductDemoValidationError) {
    throw new HttpError(400, error.message, error.code);
  }
  if (error instanceof ProductDemoConflictError) {
    throw new HttpError(409, error.message, error.code);
  }
  throw error;
}

function demoCtx(req: Request, permissions: string[]) {
  const companyId = req.supabaseCompanyId;
  const userId = req.supabaseUser?.id;
  if (!companyId || !userId) {
    throw new HttpError(401, "Authenticated company context required", "unauthorized");
  }
  const allowed = new Set(permissions);
  return {
    companyId,
    userId,
    ctx: {
      userId,
      companyId,
      isSuperAdmin: Boolean(req.supabaseIsSuperAdmin),
      hasPermission: (code: string) =>
        Boolean(req.supabaseIsSuperAdmin) || allowed.has(code),
    },
  };
}

async function requirePerm(req: Request, companyId: string, code: string) {
  try {
    await requireCompanyPermission(getUserScopedClient(req), companyId, code);
  } catch (error) {
    if (error instanceof CompanyPermissionDeniedError) {
      throw new HttpError(403, "Permission denied.", "forbidden");
    }
    throw error;
  }
}

router.get("/product-demos/offerings", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [
      PRODUCT_DEMO_PERMISSIONS.view,
      PRODUCT_DEMO_PERMISSIONS.manage,
    ]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.view);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const result = await services.queries.listOfferings(ctx, companyId, {
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    res.json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const body = req.body ?? {};
    const offering = await services.commands.upsertOffering(ctx, {
      companyId,
      catalogProductId: String(body.catalogProductId ?? ""),
      title: body.title != null ? String(body.title) : undefined,
      durationMinutes: body.durationMinutes != null ? Number(body.durationMinutes) : undefined,
      bufferMinutes: body.bufferMinutes != null ? Number(body.bufferMinutes) : undefined,
      timezone: body.timezone != null ? String(body.timezone) : undefined,
      capacity: body.capacity != null ? Number(body.capacity) : undefined,
    });
    res.status(201).json({ offering });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings/:offeringId/presenters", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const presenter = await services.commands.assignPresenter(ctx, {
      companyId,
      offeringId: String(req.params.offeringId),
      userId: String(req.body?.userId ?? ""),
      isActive: req.body?.isActive !== false,
    });
    res.status(201).json({ presenter });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.get("/product-demos/offerings/:offeringId/windows", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.view]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.view);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const result = await services.queries.listWindows(
      ctx,
      companyId,
      String(req.params.offeringId),
    );
    res.json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings/:offeringId/weekdays", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const body = req.body ?? {};
    const result = await services.commands.setWeekdayAvailability(ctx, {
      companyId,
      offeringId: String(req.params.offeringId),
      weekday: Number(body.weekday),
      isWorkDay: Boolean(body.isWorkDay),
      startTime: body.startTime != null ? String(body.startTime) : undefined,
      endTime: body.endTime != null ? String(body.endTime) : undefined,
      presenterUserId: body.presenterUserId != null ? String(body.presenterUserId) : null,
      timezone: body.timezone != null ? String(body.timezone) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings/:offeringId/windows", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const body = req.body ?? {};
    const window = await services.commands.addAvailabilityWindow(ctx, {
      companyId,
      offeringId: String(req.params.offeringId),
      presenterUserId: body.presenterUserId != null ? String(body.presenterUserId) : null,
      weekday: Number(body.weekday),
      startTime: String(body.startTime ?? ""),
      endTime: String(body.endTime ?? ""),
      timezone: body.timezone != null ? String(body.timezone) : undefined,
    });
    res.status(201).json({ window });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings/:offeringId/generate-slots", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const body = req.body ?? {};
    const dates = Array.isArray(body.dates) ? body.dates.map((value: unknown) => String(value)) : [];
    const result = await services.commands.generateAndPublishSlots(ctx, {
      companyId,
      offeringId: String(req.params.offeringId),
      daysAhead: dates.length ? dates.length : body.daysAhead != null ? Number(body.daysAhead) : 14,
      publish: body.publish !== false,
      fromDate: body.fromDate != null ? String(body.fromDate) : undefined,
      dates,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/offerings/:offeringId/status", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const offering = await services.commands.setOfferingStatus(ctx, {
      companyId,
      offeringId: String(req.params.offeringId),
      status: String(req.body?.status ?? "draft") as "draft" | "published" | "archived",
    });
    res.json({ offering });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.get("/product-demos/slots", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.view]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.view);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const result = await services.queries.listSlots(ctx, companyId, {
      offeringId: typeof req.query.offeringId === "string" ? req.query.offeringId : undefined,
      catalogProductId:
        typeof req.query.catalogProductId === "string" ? req.query.catalogProductId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    res.json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/slots/:slotId/publish", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const slot = await services.commands.publishSlot(ctx, {
      companyId,
      slotId: String(req.params.slotId),
    });
    res.json({ slot });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/slots/:slotId/unpublish", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const slot = await services.commands.unpublishSlot(ctx, {
      companyId,
      slotId: String(req.params.slotId),
    });
    res.json({ slot });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/slots/:slotId/block", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.manage]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.manage);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const slot = await services.commands.blockSlot(ctx, {
      companyId,
      slotId: String(req.params.slotId),
      reason: req.body?.reason != null ? String(req.body.reason) : undefined,
    });
    res.json({ slot });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

/** Customer / staff confirm — creates booking only after explicit slot selection. */
router.post("/product-demos/bookings/confirm", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.book]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.book);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const body = req.body ?? {};
    const booking = await services.commands.confirmBooking(ctx, {
      companyId,
      slotId: String(body.slotId ?? ""),
      customerId: body.customerId != null ? String(body.customerId) : null,
      leadId: body.leadId != null ? String(body.leadId) : null,
      conversationId: body.conversationId != null ? String(body.conversationId) : null,
      notes: body.notes != null ? String(body.notes) : null,
      clientRequestId: body.clientRequestId != null ? String(body.clientRequestId) : null,
    });
    res.status(201).json({ booking });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.get("/product-demos/bookings", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.view]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.view);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const result = await services.queries.listBookings(ctx, companyId, {
      catalogProductId:
        typeof req.query.catalogProductId === "string" ? req.query.catalogProductId : undefined,
      customerId: typeof req.query.customerId === "string" ? req.query.customerId : undefined,
      leadId: typeof req.query.leadId === "string" ? req.query.leadId : undefined,
      presenterUserId:
        typeof req.query.presenterUserId === "string" ? req.query.presenterUserId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      query: typeof req.query.query === "string" ? req.query.query : undefined,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    res.json(result);
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.get("/product-demos/bookable-slots", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [
      PRODUCT_DEMO_PERMISSIONS.view,
      PRODUCT_DEMO_PERMISSIONS.book,
    ]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.view);
    const productId = typeof req.query.catalogProductId === "string" ? req.query.catalogProductId : "";
    if (!productId) throw new HttpError(400, "catalogProductId required", "validation");
    const services = createProductDemoSchedulingServices(getServiceClient());
    const slots = await services.queries.listBookableSlotsForProduct(ctx, {
      companyId,
      catalogProductId: productId,
      limit: Number(req.query.limit ?? 20),
    });
    res.json({ items: slots, nearest: slots[0] ?? null });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

router.post("/product-demos/bookings/:bookingId/cancel", async (req, res, next) => {
  try {
    const { companyId, ctx } = demoCtx(req, [PRODUCT_DEMO_PERMISSIONS.book]);
    await requirePerm(req, companyId, PRODUCT_DEMO_PERMISSIONS.book);
    const services = createProductDemoSchedulingServices(getServiceClient());
    const booking = await services.commands.cancelBooking(ctx, {
      companyId,
      bookingId: String(req.params.bookingId),
      reason: req.body?.reason != null ? String(req.body.reason) : undefined,
    });
    res.json({ booking });
  } catch (error) {
    next(error instanceof HttpError ? error : mapError(error));
  }
});

export default router;
