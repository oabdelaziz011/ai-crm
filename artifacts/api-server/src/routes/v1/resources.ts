import { Router, type IRouter, type Request, type Response } from "express";
import { apiAuthMiddleware, requireScopes, auditResponse } from "../../middleware/api-auth.js";
import { getIntegrationServices } from "../../lib/integration-client.js";

const router: IRouter = Router();

function withAudit(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const start = Date.now();
    try {
      await handler(req, res);
    } finally {
      auditResponse(req, res, start);
    }
  };
}

router.use(apiAuthMiddleware);

router.get(
  "/customers",
  requireScopes("customers.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listCustomers(req.apiAuth!, String(req.query.cursor ?? undefined));
    res.json(result);
  }),
);

router.get(
  "/customers/:id",
  requireScopes("customers.read"),
  withAudit(async (req, res) => {
    const customer = await getIntegrationServices().gateway.getCustomer(req.apiAuth!, req.params.id);
    if (!customer) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });
      return;
    }
    res.json(customer);
  }),
);

router.get(
  "/bookings",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listBookings(req.apiAuth!, req.query.date ? String(req.query.date) : undefined);
    res.json(result);
  }),
);

router.get(
  "/bookings/:id",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const booking = await getIntegrationServices().gateway.getBooking(req.apiAuth!, req.params.id);
    if (!booking) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
      return;
    }
    res.json(booking);
  }),
);

router.get(
  "/branches",
  requireScopes("branches.read"),
  withAudit(async (req, res) => {
    const branches = await getIntegrationServices().gateway.listBranches(req.apiAuth!);
    res.json({ data: branches });
  }),
);

router.get(
  "/doctors",
  requireScopes("branches.read"),
  withAudit(async (req, res) => {
    const doctors = await getIntegrationServices().gateway.listDoctors(req.apiAuth!);
    res.json({ data: doctors });
  }),
);

router.get(
  "/invoices",
  requireScopes("invoices.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listInvoices(req.apiAuth!);
    res.json(result);
  }),
);

router.get(
  "/payments",
  requireScopes("payments.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listPayments(req.apiAuth!);
    res.json(result);
  }),
);

router.get(
  "/organization",
  requireScopes("organization.read"),
  withAudit(async (req, res) => {
    const overview = await getIntegrationServices().gateway.getOrganizationOverview(req.apiAuth!);
    res.json(overview);
  }),
);

export default router;
