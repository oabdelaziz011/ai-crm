import { Router, type IRouter } from "express";
import resourcesRouter from "./resources.js";
import { OPENAPI_V1_SPEC } from "./openapi-spec.js";
import { createIntegrationPlatformServices } from "@login-app/lib/integration/services/integration-platform-factory";
import { getServiceClient } from "../../lib/integration-client.js";

const router: IRouter = Router();

router.get("/openapi.json", (_req, res) => {
  res.json(OPENAPI_V1_SPEC);
});

router.get("/docs", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html><head><title>ValueOR API v1</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui' });</script>
</body></html>`);
});

router.post("/oauth/token", async (req, res) => {
  try {
    const services = createIntegrationPlatformServices(getServiceClient());

    const grantType = String(req.body?.grant_type ?? "");
    if (grantType !== "client_credentials") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    const result = await services.oauth.clientCredentials({
      clientId: String(req.body?.client_id ?? ""),
      clientSecret: String(req.body?.client_secret ?? ""),
    });

    res.json({
      access_token: result.accessToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      scope: result.scope,
    });
  } catch (err) {
    res.status(401).json({ error: "invalid_client", error_description: err instanceof Error ? err.message : String(err) });
  }
});

router.use(resourcesRouter);

export default router;
