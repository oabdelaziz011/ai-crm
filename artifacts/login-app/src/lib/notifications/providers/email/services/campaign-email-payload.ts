import type { CampaignContentAttachment } from "@/lib/campaigns/types";
import { isSafeCampaignStoragePath, parseCampaignAttachments } from "@/lib/campaigns/campaign-content";
import type { RenderedEmail } from "@/lib/notifications/providers/email/types/email-types";

export function escapeCampaignEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function campaignDetailToEmailHtml(detail: string): string {
  const escaped = escapeCampaignEmailHtml(detail).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return `<p>${escaped || ""}</p>`;
}

export function isMarketingCampaignEmailParams(params: Record<string, string>): boolean {
  return params.source === "marketing_campaign";
}

export function applyCampaignEmailRender(rendered: RenderedEmail, params: Record<string, string>): RenderedEmail {
  if (!isMarketingCampaignEmailParams(params)) return rendered;
  const title = (params.campaignTitle ?? "").trim();
  const detail = params.detail ?? "";
  return {
    ...rendered,
    subject: title || rendered.subject,
    text: detail,
    html: campaignDetailToEmailHtml(detail),
  };
}

export function parseCampaignEmailAttachmentsFromParams(
  params: Record<string, string>,
  companyId: string,
): CampaignContentAttachment[] {
  const raw = params.campaignAttachments?.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return parseCampaignAttachments(parsed, companyId).filter((item) =>
      isSafeCampaignStoragePath(companyId, item.storagePath),
    );
  } catch {
    return [];
  }
}
