import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerInvoice } from "@/lib/billing/types/financial-types";

export interface InvoicePdfGenerator {
  generate(invoice: CustomerInvoice): Promise<{ url: string | null; blob: Blob | null }>;
}

/** Generates a minimal valid PDF 1.4 document. */
export function buildMinimalPdf(text: string): Uint8Array {
  const escaped = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 12 Tf 50 750 Td (${escaped}) Tj ET`;
  const streamLen = stream.length;

  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${streamLen}>>stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000345 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
${400 + streamLen}
%%EOF`;

  return new TextEncoder().encode(pdf);
}

export class MinimalInvoicePdfGenerator implements InvoicePdfGenerator {
  async generate(invoice: CustomerInvoice): Promise<{ url: string | null; blob: Blob | null }> {
    const text = `Invoice ${invoice.invoiceNumber ?? invoice.id} Total: ${(invoice.totalCents / 100).toFixed(2)} ${invoice.currency}`;
    const bytes = buildMinimalPdf(text);
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy], { type: "application/pdf" });
    return { url: null, blob };
  }
}

/** Uploads PDF to Supabase storage and persists path on invoice. */
export class StorageInvoicePdfGenerator implements InvoicePdfGenerator {
  constructor(
    private readonly client: SupabaseClient,
    private readonly inner: InvoicePdfGenerator = new MinimalInvoicePdfGenerator(),
  ) {}

  async generate(invoice: CustomerInvoice): Promise<{ url: string | null; blob: Blob | null }> {
    const { blob } = await this.inner.generate(invoice);
    if (!blob || !invoice.companyId) return { url: null, blob };

    const path = `${invoice.companyId}/${invoice.id}.pdf`;
    const { error: uploadError } = await this.client.storage
      .from("invoices")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.warn("[StorageInvoicePdfGenerator] upload failed:", uploadError.message);
      return { url: null, blob };
    }

    await this.client
      .from("invoices")
      .update({ pdf_storage_path: path })
      .eq("id", invoice.id)
      .eq("company_id", invoice.companyId);

    const { data: signed } = await this.client.storage.from("invoices").createSignedUrl(path, 3600);
    return { url: signed?.signedUrl ?? null, blob };
  }
}

export class NoOpInvoicePdfGenerator implements InvoicePdfGenerator {
  async generate(_invoice: CustomerInvoice): Promise<{ url: string | null; blob: Blob | null }> {
    return { url: null, blob: null };
  }
}

/** @deprecated Use MinimalInvoicePdfGenerator */
export class StubInvoicePdfGenerator extends MinimalInvoicePdfGenerator {}
