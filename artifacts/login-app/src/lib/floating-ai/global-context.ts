import type { FloatingAiPageContext, FloatingAiEntity, FloatingAiRuntimeMetadata } from "./types";

function resolveCurrentEntity(context: FloatingAiPageContext): FloatingAiEntity | null {
  if (context.currentEntity) return context.currentEntity;

  if (context.selectedCustomer) {
    return {
      type: "customer",
      id: context.selectedCustomer.id,
      label: context.selectedCustomer.name,
    };
  }

  if (context.selectedInvoice) {
    return {
      type: "invoice",
      id: context.selectedInvoice.id,
      label: context.selectedInvoice.label ?? context.selectedInvoice.id,
      reference: context.selectedInvoice.label,
    };
  }

  if (context.selectedBooking || context.bookingId) {
    const id = context.selectedBooking?.id ?? context.bookingId!;
    return {
      type: "booking",
      id,
      label: context.selectedBooking?.label ?? id,
    };
  }

  if (context.selectedEmployee) {
    return {
      type: "employee",
      id: context.selectedEmployee.id,
      label: context.selectedEmployee.name,
    };
  }

  return null;
}

/** Build structured runtime metadata from page context */
export function buildRuntimePageContext(context: FloatingAiPageContext): FloatingAiRuntimeMetadata {
  return buildRuntimeMetadata(context);
}

export function buildRuntimeMetadata(context: FloatingAiPageContext): FloatingAiRuntimeMetadata {
  const currentEntity = resolveCurrentEntity(context);

  return {
    module: context.page,
    moduleLabel: context.moduleLabel,
    route: context.route,
    pageTitle: context.pageTitle,
    company: {
      id: context.companyId ?? null,
      name: context.companyName ?? null,
    },
    user: {
      id: context.userId ?? null,
      name: context.userName ?? null,
    },
    currentEntity,
    selectedRows: context.selectedRows ?? [],
    selectedCount: context.selectedCount ?? context.selectedRows?.length ?? 0,
    filters: context.filters ?? {},
    capturedAt: new Date().toISOString(),
  };
}
