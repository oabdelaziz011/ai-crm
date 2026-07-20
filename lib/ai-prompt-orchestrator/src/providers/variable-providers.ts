export type VariableResolutionContext = Record<string, unknown>;

export interface PromptVariableProvider {
  readonly key: string;
  resolve(context: VariableResolutionContext): Record<string, unknown>;
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function resolveVariablePath(context: VariableResolutionContext, path: string): unknown {
  return readPath(context, path);
}

export class CustomerVariableProvider implements PromptVariableProvider {
  readonly key = "customer";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    const customer = (context.customer as Record<string, unknown> | undefined) ?? {};
    return {
      customer: {
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        id: customer.id ?? "",
      },
    };
  }
}

export class CompanyVariableProvider implements PromptVariableProvider {
  readonly key = "company";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    const company = (context.company as Record<string, unknown> | undefined) ?? {};
    return {
      company: {
        name: company.name ?? context.companyName ?? "",
        id: company.id ?? context.companyId ?? "",
      },
    };
  }
}

export class ConversationVariableProvider implements PromptVariableProvider {
  readonly key = "conversation";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    const messages = Array.isArray(context.recentMessages)
      ? context.recentMessages
          .map((message) => {
            if (typeof message !== "object" || message === null) return "";
            const record = message as Record<string, unknown>;
            return `${String(record.role ?? "user").toUpperCase()}: ${String(record.content ?? "")}`;
          })
          .join("\n")
      : "";
    return {
      conversation: {
        history: messages,
        summary: context.conversationSummary ?? "",
        id: context.conversationId ?? "",
      },
    };
  }
}

export class WorkflowVariableProvider implements PromptVariableProvider {
  readonly key = "workflow";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    return {
      workflow: {
        input: context.workflowInput ?? context.input ?? {},
        variables: context.workflowVariables ?? context.variables ?? {},
        id: context.workflowId ?? "",
        executionId: context.executionId ?? "",
      },
    };
  }
}

export class BookingVariableProvider implements PromptVariableProvider {
  readonly key = "booking";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    const booking = (context.booking as Record<string, unknown> | undefined) ?? {};
    return {
      booking: {
        date: booking.date ?? "",
        time: booking.time ?? "",
        service: booking.service ?? "",
      },
    };
  }
}

export class SystemVariableProvider implements PromptVariableProvider {
  readonly key = "system";

  resolve(context: VariableResolutionContext): Record<string, unknown> {
    const now = context.systemTime instanceof Date ? context.systemTime : new Date();
    return {
      system: {
        time: now.toISOString(),
        locale: context.language ?? "en",
      },
    };
  }
}

export function createDefaultVariableProviders(): PromptVariableProvider[] {
  return [
    new CustomerVariableProvider(),
    new CompanyVariableProvider(),
    new ConversationVariableProvider(),
    new WorkflowVariableProvider(),
    new BookingVariableProvider(),
    new SystemVariableProvider(),
  ];
}

export function buildVariableContext(
  providers: PromptVariableProvider[],
  source: VariableResolutionContext,
): VariableResolutionContext {
  const merged: VariableResolutionContext = { ...source };
  for (const provider of providers) {
    Object.assign(merged, provider.resolve(source));
  }
  return merged;
}
