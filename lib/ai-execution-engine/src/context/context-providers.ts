import { KnowledgeContextProvider } from "./knowledge-context-provider.js";
import { AssembledContextProvider } from "./assembled-context-provider.js";
import { Customer360ContextProvider } from "@workspace/customer-360";

export type RuntimeContextSource = Record<string, unknown>;

export interface RuntimeContextProvider {
  readonly key: string;
  resolve(source: RuntimeContextSource): Record<string, unknown>;
}

export class CustomerContextProvider implements RuntimeContextProvider {
  readonly key = "customer";
  resolve(source: RuntimeContextSource) {
    const customer = (source.customer as Record<string, unknown> | undefined) ?? {};
    return { customer: { name: customer.name ?? "", phone: customer.phone ?? "", email: customer.email ?? "" } };
  }
}

export class ConversationContextProvider implements RuntimeContextProvider {
  readonly key = "conversation";
  resolve(source: RuntimeContextSource) {
    return {
      conversation: {
        id: source.conversationId ?? "",
        history: source.recentMessages ?? [],
        summary: source.conversationSummary ?? "",
      },
    };
  }
}

export class WorkflowContextProvider implements RuntimeContextProvider {
  readonly key = "workflow";
  resolve(source: RuntimeContextSource) {
    return {
      workflow: {
        id: source.workflowId ?? "",
        executionId: source.executionId ?? "",
        input: source.workflowInput ?? source.input ?? {},
        variables: source.workflowVariables ?? source.variables ?? {},
      },
    };
  }
}

export class CompanyContextProvider implements RuntimeContextProvider {
  readonly key = "company";
  resolve(source: RuntimeContextSource) {
    return {
      company: {
        id: source.companyId ?? "",
        name: source.companyName ?? "",
      },
    };
  }
}

export class BookingContextProvider implements RuntimeContextProvider {
  readonly key = "booking";
  resolve(source: RuntimeContextSource) {
    const booking = (source.booking as Record<string, unknown> | undefined) ?? {};
    return { booking: { date: booking.date ?? "", time: booking.time ?? "", service: booking.service ?? "" } };
  }
}

export class ExecutionContextProvider implements RuntimeContextProvider {
  readonly key = "execution";
  resolve(source: RuntimeContextSource) {
    return {
      execution: {
        id: source.executionId ?? "",
        sessionId: source.sessionId ?? "",
        correlationId: source.correlationId ?? "",
      },
    };
  }
}

export class SystemContextProvider implements RuntimeContextProvider {
  readonly key = "system";
  resolve(source: RuntimeContextSource) {
    const now = source.systemTime instanceof Date ? source.systemTime : new Date();
    return { system: { time: now.toISOString(), locale: source.language ?? "en" } };
  }
}

export function createDefaultRuntimeContextProviders(): RuntimeContextProvider[] {
  return [
    new AssembledContextProvider(),
    new CustomerContextProvider(),
    new ConversationContextProvider(),
    new WorkflowContextProvider(),
    new CompanyContextProvider(),
    new BookingContextProvider(),
    new ExecutionContextProvider(),
    new SystemContextProvider(),
    new KnowledgeContextProvider(),
    new Customer360ContextProvider(),
  ];
}
