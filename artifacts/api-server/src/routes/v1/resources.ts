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

router.get(
  "/tickets",
  requireScopes("tickets.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listTickets(req.apiAuth!, {
      q: req.query.q ? String(req.query.q) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      priority: req.query.priority ? String(req.query.priority) : undefined,
      customerId: req.query.customerId ? String(req.query.customerId) : undefined,
      conversationId: req.query.conversationId ? String(req.query.conversationId) : undefined,
      assignedUserId: req.query.assignedUserId ? String(req.query.assignedUserId) : undefined,
      assigneeName: req.query.assigneeName ? String(req.query.assigneeName) : undefined,
      limit: req.query.limit ? String(req.query.limit) : undefined,
      offset: req.query.offset ? String(req.query.offset) : undefined,
    });
    res.json(result);
  }),
);

router.get(
  "/tickets/metrics",
  requireScopes("tickets.read"),
  withAudit(async (req, res) => {
    const metrics = await getIntegrationServices().gateway.getTicketMetrics(req.apiAuth!);
    res.json(metrics);
  }),
);

router.get(
  "/tickets/:id",
  requireScopes("tickets.read"),
  withAudit(async (req, res) => {
    try {
      const ticket = await getIntegrationServices().gateway.getTicket(req.apiAuth!, req.params.id);
      res.json(ticket);
    } catch {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found" } });
    }
  }),
);

router.post(
  "/tickets",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.createTicket(req.apiAuth!, req.body ?? {});
    res.status(201).json(result);
  }),
);

router.patch(
  "/tickets/:id",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.updateTicket(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/close",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.closeTicket(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/reopen",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.reopenTicket(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.delete(
  "/tickets/:id",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.deleteTicket(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/assign",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.assignTicket(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/unassign",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.unassignTicket(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/comments",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.addTicketComment(req.apiAuth!, req.params.id, req.body ?? {});
    res.status(201).json(result);
  }),
);

router.post(
  "/tickets/:id/priority",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.changeTicketPriority(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/tickets/:id/status",
  requireScopes("tickets.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.changeTicketStatus(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.get(
  "/customers/:id/tickets",
  requireScopes("tickets.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listCustomerTickets(
      req.apiAuth!,
      req.params.id,
      req.query.limit ? Number(req.query.limit) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/conversations/:id/tickets",
  requireScopes("tickets.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listConversationTickets(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/transfer",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.transferConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/accept",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.acceptConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/reject",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.rejectConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/assign",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.assignConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/queue",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.queueConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/escalate",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.escalateConversation(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/conversations/:id/handoff/return-to-ai",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.returnConversationToAi(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.get(
  "/conversations/:id/handoff/ownership",
  requireScopes("handoff.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getHandoffOwnership(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.get(
  "/conversations/:id/handoff/history",
  requireScopes("handoff.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getHandoffOwnershipHistory(
      req.apiAuth!,
      req.params.id,
      req.query.limit ? Number(req.query.limit) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/conversations/:id/handoff/workspace",
  requireScopes("handoff.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getAgentWorkspace(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.get(
  "/handoff/queues",
  requireScopes("handoff.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listHandoffQueues(req.apiAuth!);
    res.json(result);
  }),
);

router.get(
  "/handoff/metrics",
  requireScopes("handoff.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getHandoffMetrics(
      req.apiAuth!,
      req.query.periodStart ? String(req.query.periodStart) : undefined,
    );
    res.json(result);
  }),
);

router.post(
  "/handoff/presence",
  requireScopes("handoff.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.updateAgentPresence(req.apiAuth!, req.body ?? {});
    res.json(result);
  }),
);

router.get(
  "/leads",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listLeads(
      req.apiAuth!,
      req.query.q ? String(req.query.q) : undefined,
      req.query.limit ? Number(req.query.limit) : undefined,
      req.query.offset ? Number(req.query.offset) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/leads/metrics",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getLeadMetrics(
      req.apiAuth!,
      req.query.periodStart ? String(req.query.periodStart) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/leads/pipelines",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listLeadPipelines(req.apiAuth!);
    res.json(result);
  }),
);

router.get(
  "/leads/pipelines/:id/stages",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listLeadStages(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.get(
  "/leads/:id",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getLead(req.apiAuth!, req.params.id);
    if (!result.lead) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Lead not found" } });
      return;
    }
    res.json(result);
  }),
);

router.post(
  "/leads",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.createLead(req.apiAuth!, req.body ?? {});
    res.status(201).json(result);
  }),
);

router.patch(
  "/leads/:id",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.updateLead(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.delete(
  "/leads/:id",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.deleteLead(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/leads/:id/assign",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.assignLead(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/leads/:id/merge",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.mergeLeads(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/leads/:id/convert",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.convertLead(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/leads/:id/qualify",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.qualifyLead(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/leads/:id/stage",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.changeLeadStage(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.get(
  "/leads/:id/activities",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listLeadActivities(
      req.apiAuth!,
      req.params.id,
      req.query.limit ? Number(req.query.limit) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/leads/:id/notes",
  requireScopes("leads.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listLeadNotes(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/leads/:id/notes",
  requireScopes("leads.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.addLeadNote(req.apiAuth!, req.params.id, req.body ?? {});
    res.status(201).json(result);
  }),
);

router.get(
  "/appointments",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.listAppointments(
      req.apiAuth!,
      req.query.q ? String(req.query.q) : undefined,
      req.query.customerId ? String(req.query.customerId) : undefined,
      req.query.limit ? Number(req.query.limit) : undefined,
      req.query.offset ? Number(req.query.offset) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/appointments/metrics",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getAppointmentMetrics(
      req.apiAuth!,
      req.query.periodStart ? String(req.query.periodStart) : undefined,
    );
    res.json(result);
  }),
);

router.get(
  "/appointments/availability",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getAppointmentAvailability(
      req.apiAuth!,
      String(req.query.resourceId ?? ""),
      String(req.query.serviceId ?? ""),
      String(req.query.date ?? ""),
    );
    res.json(result);
  }),
);

router.get(
  "/appointments/:id",
  requireScopes("bookings.read"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.getAppointment(req.apiAuth!, req.params.id);
    if (!result.appointment) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Appointment not found" } });
      return;
    }
    res.json(result);
  }),
);

router.post(
  "/appointments",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.createAppointment(req.apiAuth!, req.body ?? {});
    res.status(201).json(result);
  }),
);

router.patch(
  "/appointments/:id",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.updateAppointment(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/appointments/:id/cancel",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.cancelAppointment(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/appointments/:id/reschedule",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.rescheduleAppointment(req.apiAuth!, req.params.id, req.body ?? {});
    res.json(result);
  }),
);

router.post(
  "/appointments/:id/confirm",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.confirmAppointment(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/appointments/:id/check-in",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.checkInAppointment(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

router.post(
  "/appointments/:id/complete",
  requireScopes("bookings.write"),
  withAudit(async (req, res) => {
    const result = await getIntegrationServices().gateway.completeAppointment(req.apiAuth!, req.params.id);
    res.json(result);
  }),
);

export default router;
