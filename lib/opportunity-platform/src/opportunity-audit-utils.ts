export function formatAuditMoney(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "USD";
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : String(amount);
  return `${formatted} ${code}`;
}

export function formatProductAttachedSummary(input: {
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}): string {
  return [
    "Product:",
    input.productName.trim(),
    "",
    "Qty:",
    String(input.quantity),
    "",
    "Price:",
    formatAuditMoney(input.unitPrice, input.currency),
  ].join("\n");
}

export function formatProductRemovedSummary(input: {
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}): string {
  return [
    "Product:",
    input.productName.trim(),
    "",
    "Qty:",
    String(input.quantity),
    "",
    "Price:",
    formatAuditMoney(input.unitPrice, input.currency),
  ].join("\n");
}

export function formatLineFieldChangeSummary(label: string): string {
  return `${label} changed`;
}

export function formatQuoteCreatedSummary(input: {
  quoteNumber: string;
  versionNumber: number;
}): string {
  return [
    "Quote:",
    input.quoteNumber.trim(),
    "",
    "Version:",
    String(input.versionNumber),
  ].join("\n");
}

export function formatQuoteVersionCreatedSummary(input: {
  quoteNumber: string;
  previousVersion: number;
  nextVersion: number;
}): string {
  return [
    "Quote:",
    input.quoteNumber.trim(),
    "",
    "Version:",
    `${input.previousVersion} → ${input.nextVersion}`,
  ].join("\n");
}

export function formatQuoteSubmittedSummary(input: {
  quoteNumber: string;
  submittedBy?: string;
}): string {
  const lines = ["Quote:", input.quoteNumber.trim()];
  if (input.submittedBy?.trim()) {
    lines.push("", "Submitted by:", input.submittedBy.trim());
  }
  return lines.join("\n");
}

export function formatQuoteApprovedSummary(input: {
  quoteNumber: string;
  approvedBy?: string;
}): string {
  const lines = ["Quote:", input.quoteNumber.trim()];
  if (input.approvedBy?.trim()) {
    lines.push("", "Approved by:", input.approvedBy.trim());
  }
  return lines.join("\n");
}

export function formatQuoteRejectedSummary(input: {
  quoteNumber: string;
  rejectedBy?: string;
}): string {
  const lines = ["Quote:", input.quoteNumber.trim()];
  if (input.rejectedBy?.trim()) {
    lines.push("", "Rejected by:", input.rejectedBy.trim());
  }
  return lines.join("\n");
}

export function formatQuoteStatusChangedSummary(input: {
  quoteNumber: string;
  previousStatus: string;
  nextStatus: string;
}): string {
  return [
    "Quote:",
    input.quoteNumber.trim(),
    "",
    "Status:",
    `${input.previousStatus} → ${input.nextStatus}`,
  ].join("\n");
}
