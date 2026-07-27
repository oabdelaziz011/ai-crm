import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentIntentRequest, PaymentIntentResult, WebhookPayload, WebhookProcessResult } from "@/lib/billing/types/financial-types";
import type { PaymentProviderCode } from "@/lib/billing/types/financial-enums";
import { CustomerPaymentRepository } from "@/lib/billing/repositories/customer-payment-repository";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import { PaymentProviderRegistry } from "@/lib/billing/providers/payment-provider-registry";
import { LedgerService } from "@/lib/billing/ledger/ledger-service";
import { buildIdempotencyKey } from "@/lib/billing/utilities/idempotency";
import { getCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";

/** Payment orchestration — intent → provider → confirmation → invoice update. */
export class PaymentService {
  private readonly payments: CustomerPaymentRepository;
  private readonly invoices: CustomerInvoiceRepository;

  constructor(
    private readonly client: SupabaseClient,
    private readonly providers: PaymentProviderRegistry,
    private readonly ledger: LedgerService,
  ) {
    this.payments = new CustomerPaymentRepository(client);
    this.invoices = new CustomerInvoiceRepository(client);
  }

  async resolveProvider(companyId: string): Promise<PaymentProviderCode> {
    const { data } = await this.client
      .from("company_financial_settings")
      .select("default_payment_provider")
      .eq("company_id", companyId)
      .maybeSingle();
    return (data?.default_payment_provider as PaymentProviderCode) ?? "sandbox";
  }

  async createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntentResult> {
    const providerCode = request.providerCode ?? (await this.resolveProvider(request.companyId));
    const provider = this.providers.get(providerCode);
    if (!provider) throw new Error(`Payment provider not registered: ${providerCode}`);

    const idempotencyKey =
      request.idempotencyKey ??
      buildIdempotencyKey("payment", [request.companyId, request.invoiceId, String(request.amountCents)]);

    const existing = await this.payments.getByIdempotencyKey(request.companyId, idempotencyKey);
    if (existing) {
      return {
        intentId: existing.id,
        providerCode: existing.providerCode ?? providerCode,
        checkoutUrl: null,
        providerIntentId: null,
        status: existing.status,
      };
    }

    const payment = await this.payments.create({
      companyId: request.companyId,
      invoiceId: request.invoiceId,
      customerId: request.customerId,
      paymentMethod: "online",
      providerCode,
      amountCents: request.amountCents,
      currency: request.currency,
      idempotencyKey,
    });

    const result = await provider.createIntent({ ...request, providerCode });

    await this.client.from("payment_intents").insert({
      company_id: request.companyId,
      invoice_id: request.invoiceId,
      customer_id: request.customerId,
      provider_code: providerCode,
      provider_intent_id: result.providerIntentId,
      amount: request.amountCents / 100,
      currency: request.currency,
      status: "requires_payment_method",
      metadata: { paymentId: payment.id },
    });

    return { ...result, intentId: payment.id };
  }

  async confirmPayment(
    companyId: string,
    paymentId: string,
    providerPaymentId?: string | null,
  ): Promise<void> {
    const payment = await this.payments.markCompleted(paymentId, providerPaymentId);
    const invoice = await this.invoices.getById(companyId, payment.invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    const newPaidCents = invoice.paidCents + payment.amountCents;
    await this.invoices.recordPayment(companyId, invoice.id, newPaidCents, invoice.totalCents);

    await this.ledger.recordPayment({
      companyId,
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
    });

    await this.audit(companyId, "payment.confirmed", "payment", payment.id);

    const bus = getEnterpriseEventPublisher();
    await bus.publish({
      companyId,
      eventType: "payment.completed",
      eventId: `${payment.id}:payment.completed`,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
      },
    });

    if (newPaidCents >= invoice.totalCents) {
      await bus.publish({
        companyId,
        eventType: "invoice.paid",
        eventId: `${invoice.id}:invoice.paid`,
        payload: { invoiceId: invoice.id, customerId: invoice.customerId, totalCents: invoice.totalCents },
      });
      await this.notifyInvoicePaid(companyId, invoice.customerId, invoice.id);
    }
  }

  async listPayments(companyId: string, limit?: number) {
    return this.payments.listByCompany(companyId, limit);
  }

  private async notifyInvoicePaid(companyId: string, customerId: string | null, invoiceId: string): Promise<void> {
    if (!customerId) return;
    const { data: customer } = await this.client
      .from("customers")
      .select("name, email, phone")
      .eq("id", customerId)
      .maybeSingle();

    await getCommunicationPlatform().events.handleDomainEvent("invoice.paid", {
      companyId,
      channels: ["email", "whatsapp"],
      recipient: {
        customerId,
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
        name: customer?.name ?? "Customer",
      },
      variables: { invoiceId },
      idempotencyKey: `invoice.paid:${invoiceId}`,
      metadata: { invoiceId },
    });
  }

  private async audit(companyId: string, action: string, entityType: string, entityId: string): Promise<void> {
    await this.client.from("financial_audit_log").insert({
      company_id: companyId,
      action,
      entity_type: entityType,
      entity_id: entityId,
    });
  }
}

/** Queue-based webhook handler with idempotency and retry support. */
export class WebhookHandler {
  constructor(
    private readonly client: SupabaseClient,
    private readonly providers: PaymentProviderRegistry,
    private readonly paymentService: PaymentService,
  ) {}

  async enqueue(payload: WebhookPayload): Promise<string> {
    const { data, error } = await this.client
      .from("webhook_events")
      .insert({
        provider_code: payload.providerCode,
        event_type: payload.eventType,
        provider_event_id: payload.providerEventId ?? null,
        payload: payload.payload as Record<string, unknown>,
        idempotency_key: payload.idempotencyKey ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    }
    return String(data.id);
  }

  async process(eventId: string): Promise<WebhookProcessResult> {
    const { data: event, error } = await this.client
      .from("webhook_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !event) return { processed: false, error: "Event not found" };

    await this.client.from("webhook_events").update({ status: "processing" }).eq("id", eventId);

    try {
      const provider = this.providers.get(event.provider_code as PaymentProviderCode);
      if (!provider?.parseWebhook) throw new Error("Provider does not support webhooks");

      const parsed = provider.parseWebhook(event.payload);
      if (parsed.status !== "completed") {
        await this.client.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventId);
        return { processed: true };
      }

      const { data: intent } = await this.client
        .from("payment_intents")
        .select("company_id, metadata")
        .eq("provider_intent_id", parsed.intentId)
        .maybeSingle();

      const paymentId = (intent?.metadata as Record<string, string>)?.paymentId;
      if (paymentId && intent?.company_id) {
        await this.paymentService.confirmPayment(String(intent.company_id), paymentId, parsed.providerPaymentId);
      }

      await this.client.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventId);
      return { processed: true, paymentId: paymentId ?? undefined };
    } catch (err) {
      await this.client.from("webhook_events").update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
      }).eq("id", eventId);
      return { processed: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}
