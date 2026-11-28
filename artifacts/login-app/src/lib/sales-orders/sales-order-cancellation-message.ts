/** Pure helper for delivery-worker cancellation WhatsApp copy. */

export function buildCancellationWorkerMessage(input: {
  orderNumber: string;
  customerName: string;
  cancellationReason?: string | null;
}): string {
  const lines = [
    "Order Cancellation Notice",
    "",
    `Order: ${input.orderNumber}`,
    `Customer: ${input.customerName || "—"}`,
    "",
    "This order has been cancelled by the customer.",
    "",
    "Please do not proceed with preparation or delivery.",
  ];
  if (input.cancellationReason?.trim()) {
    lines.push("", `Reason: ${input.cancellationReason.trim()}`);
  }
  return lines.join("\n");
}
