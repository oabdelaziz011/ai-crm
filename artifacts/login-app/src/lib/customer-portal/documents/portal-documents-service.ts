import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalDocumentView, PortalInvoiceView } from "@/lib/customer-portal/types";

/** Secure document access for customer portal. */
export class PortalDocumentsService {
  constructor(private readonly client: SupabaseClient) {}

  async listInvoices(customerId: string): Promise<PortalInvoiceView[]> {
    const { data, error } = await this.client
      .from("invoices")
      .select("id, amount, status, invoice_date, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      number: row.id.slice(0, 8).toUpperCase(),
      amountCents: Math.round(Number(row.amount ?? 0) * 100),
      currency: "USD",
      status: row.status ?? "Unpaid",
      issuedAt: row.invoice_date ?? row.created_at,
      paidAt: row.status === "Paid" ? row.created_at : null,
      taxInfo: null,
    }));
  }

  async listDocuments(customerId: string): Promise<PortalDocumentView[]> {
    const { data, error } = await this.client
      .from("invoices")
      .select("id, amount, status, invoice_date, created_at, pdf_storage_path")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const docs: PortalDocumentView[] = [];
    for (const row of data ?? []) {
      const number = row.id.slice(0, 8).toUpperCase();
      let downloadUrl: string | null = null;

      if (row.pdf_storage_path) {
        const { data: signed } = await this.client.storage
          .from("invoices")
          .createSignedUrl(row.pdf_storage_path, 3600);
        downloadUrl = signed?.signedUrl ?? null;
      }

      docs.push({
        id: row.id,
        type: row.status === "Paid" ? "receipt" : "invoice",
        title: `Invoice ${number}`,
        createdAt: row.invoice_date ?? row.created_at,
        downloadUrl,
        mimeType: "application/pdf",
      });
    }

    return docs;
  }

  async getSignedDownloadUrl(documentId: string): Promise<string | null> {
    const { data: path, error } = await this.client.rpc("portal_get_document_signed_url", {
      p_document_id: documentId,
    });
    if (error || !path) return null;

    const storagePath = String(path);
    const { data: signed, error: signError } = await this.client.storage
      .from("invoices")
      .createSignedUrl(storagePath, 3600);

    if (signError) return null;
    return signed?.signedUrl ?? null;
  }
}
