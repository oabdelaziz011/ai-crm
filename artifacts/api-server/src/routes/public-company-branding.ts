import { Router, type Request, type Response } from "express";
import { sanitizeCompanyBrandingObjectPath } from "@workspace/channel-platform";

export const PUBLIC_COMPANY_BRANDING_ROUTE_PREFIX = "/api/public/company-branding";

function localSupabaseOrigin(): string {
  const fromEnv = String(process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(fromEnv)) return fromEnv;
  return "http://127.0.0.1:54321";
}

/**
 * Public proxy so Meta (WhatsApp) can fetch local company-branding product images
 * via the developer tunnel. Local-only; production catalogs already use https CDN URLs.
 */
export function createPublicCompanyBrandingRouter(): Router {
  const router = Router();

  router.get("/{*objectPath}", async (req: Request, res: Response) => {
    if (String(process.env.VALUEOR_ENV ?? "").trim().toLowerCase() !== "local") {
      res.status(404).end();
      return;
    }

    const rawPath = Array.isArray(req.params.objectPath)
      ? req.params.objectPath.join("/")
      : String(req.params.objectPath ?? "");
    const objectPath = sanitizeCompanyBrandingObjectPath(rawPath);
    if (!objectPath) {
      res.status(404).end();
      return;
    }

    const upstream = `${localSupabaseOrigin()}/storage/v1/object/public/company-branding/${objectPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;

    try {
      const response = await fetch(upstream, {
        method: "GET",
        headers: { Accept: "image/*,*/*" },
        redirect: "follow",
      });
      if (!response.ok) {
        res.status(response.status === 404 ? 404 : 502).end();
        return;
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (!/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
        res.status(415).end();
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) {
        res.status(502).end();
        return;
      }

      res.setHeader("Content-Type", contentType.startsWith("image/") ? contentType : "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.status(200).end(buffer);
    } catch {
      res.status(502).end();
    }
  });

  return router;
}

export default createPublicCompanyBrandingRouter();
