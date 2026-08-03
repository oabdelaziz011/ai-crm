import type { ApplicationContext } from "../contracts/application-context.js";
import type { AssembledContext } from "./context-assembly-service.js";

export type UnifiedMemorySnapshot = Readonly<{
  conversation: Readonly<{
    conversationId: string;
    recentMessageCount: number;
    summary?: string;
  }>;
  entity: Readonly<{
    customerId?: string;
    leadId?: string;
    bookingId?: string;
    invoiceId?: string;
  }>;
  knowledge: Readonly<{
    query?: string;
    chunkCount: number;
    contextText?: string;
  }>;
  action: Readonly<{
    recentToolKeys: readonly string[];
  }>;
  session: Readonly<{
    sessionId?: string;
    correlationId: string;
  }>;
}>;

export type UnifiedMemoryLoadInput = Readonly<{
  conversationId: string;
  correlationId: string;
  sessionId?: string;
  assembled: AssembledContext;
  recentMessages?: ReadonlyArray<{ role: string; content: string }>;
  recentToolKeys?: readonly string[];
}>;

/** Single memory resolution path — no runtime-specific loaders. */
export class UnifiedMemoryPipeline {
  load(input: UnifiedMemoryLoadInput, _context: ApplicationContext): UnifiedMemorySnapshot {
    const knowledge = input.assembled.knowledge as Record<string, unknown> | undefined;
    const customer = input.assembled.customer as Record<string, unknown> | undefined;
    const lead = input.assembled.lead as Record<string, unknown> | undefined;
    const booking = input.assembled.booking as Record<string, unknown> | undefined;
    const invoice = input.assembled.invoice as Record<string, unknown> | undefined;

    return Object.freeze({
      conversation: Object.freeze({
        conversationId: input.conversationId,
        recentMessageCount: input.recentMessages?.length ?? 0,
        summary: typeof input.assembled.conversation === "object" && input.assembled.conversation
          ? String((input.assembled.conversation as Record<string, unknown>).summary ?? "")
          : undefined,
      }),
      entity: Object.freeze({
        customerId: customer?.id ? String(customer.id) : undefined,
        leadId: lead?.id ? String(lead.id) : undefined,
        bookingId: booking?.id ? String(booking.id) : undefined,
        invoiceId: invoice?.id ? String(invoice.id) : undefined,
      }),
      knowledge: Object.freeze({
        query: knowledge?.query ? String(knowledge.query) : undefined,
        chunkCount: typeof knowledge?.chunkCount === "number" ? knowledge.chunkCount : 0,
        contextText: knowledge?.contextText ? String(knowledge.contextText) : undefined,
      }),
      action: Object.freeze({
        recentToolKeys: Object.freeze(input.recentToolKeys ?? []),
      }),
      session: Object.freeze({
        sessionId: input.sessionId,
        correlationId: input.correlationId,
      }),
    });
  }
}
