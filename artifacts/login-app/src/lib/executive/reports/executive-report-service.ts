import type { ExecutiveDashboardSnapshot, ExecutiveReport, ExecutiveReportRequest } from "@/lib/executive/types";
import { formatMoney } from "@/lib/billing/utilities/money";

/** Report generation — CSV/PDF export ready. */
export class ExecutiveReportService {
  generate(request: ExecutiveReportRequest, snapshot: ExecutiveDashboardSnapshot): ExecutiveReport {
    const title = `${request.kind} ${request.period} report`;

    const sections: ExecutiveReport["sections"] = [
      {
        heading: "Executive Summary",
        metrics: {
          "Today's Revenue": formatMoney(snapshot.summary.todayRevenueCents),
          "Monthly Revenue": formatMoney(snapshot.summary.monthlyRevenueCents),
          "Bookings Today": snapshot.summary.bookingsToday,
          Outstanding: formatMoney(snapshot.summary.outstandingBalanceCents),
        },
      },
      {
        heading: "Operational KPIs",
        metrics: {
          "Completion Rate": `${snapshot.operational.completionRate}%`,
          "Cancellation Rate": `${snapshot.operational.cancellationRate}%`,
          "No-Show Rate": `${snapshot.operational.noShowRate}%`,
          "Capacity Utilization": `${snapshot.operational.capacityUtilization}%`,
        },
      },
      {
        heading: "Financial KPIs",
        metrics: {
          Revenue: formatMoney(snapshot.financial.revenueCents),
          "Outstanding Invoices": formatMoney(snapshot.financial.outstandingInvoicesCents),
          "Refund Rate": `${snapshot.financial.refundRate}%`,
          Collections: formatMoney(snapshot.financial.collectionsCents),
        },
      },
    ];

    if (request.kind === "doctor") {
      sections.push({
        heading: "Doctor Performance",
        metrics: Object.fromEntries(
          snapshot.doctors.slice(0, 10).map((d) => [d.resourceName, formatMoney(d.revenueCents)]),
        ),
      });
    }

    if (request.kind === "branch") {
      sections.push({
        heading: "Branch Performance",
        metrics: Object.fromEntries(
          snapshot.branches.slice(0, 10).map((b) => [b.branchName, formatMoney(b.revenueCents)]),
        ),
      });
    }

    if (request.kind === "communication") {
      sections.push({
        heading: "Communication",
        metrics: {
          Delivered: snapshot.communication.whatsappDelivered + snapshot.communication.emailDelivered,
          Failed: snapshot.communication.failedMessages,
          "Delivery Success": `${snapshot.communication.deliverySuccessRate}%`,
        },
      });
    }

    if (request.kind === "customer") {
      sections.push({
        heading: "Customer",
        metrics: {
          "New Customers": snapshot.customer.newCustomers,
          "Retention Rate": `${snapshot.customer.retentionRate}%`,
          "Portal Usage": snapshot.customer.portalUsageCount,
        },
      });
    }

    return {
      title,
      kind: request.kind,
      period: request.period,
      generatedAt: new Date().toISOString(),
      sections,
    };
  }
}
