/** OpenAPI 3.1 specification for ValueOR Public API v1 */
export const OPENAPI_V1_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "ValueOR Public API",
    version: "1.0.0",
    description: "Enterprise integration API — all endpoints delegate to domain services.",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  tags: [
    { name: "customers", description: "Customer CRM" },
    { name: "bookings", description: "Scheduling bookings" },
    { name: "branches", description: "Branch management" },
    { name: "invoices", description: "Financial invoices" },
    { name: "organization", description: "Organization hierarchy" },
    { name: "oauth", description: "OAuth 2.1 token endpoint" },
  ],
  paths: {
    "/customers": {
      get: {
        tags: ["customers"],
        summary: "List customers",
        parameters: [{ name: "cursor", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Paginated customer list" }, "401": { description: "Unauthorized" } },
      },
    },
    "/customers/{id}": {
      get: {
        tags: ["customers"],
        summary: "Get customer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Customer" }, "404": { description: "Not found" } },
      },
    },
    "/bookings": {
      get: {
        tags: ["bookings"],
        summary: "List bookings",
        parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" } }],
        responses: { "200": { description: "Booking list" } },
      },
    },
    "/bookings/{id}": {
      get: {
        tags: ["bookings"],
        summary: "Get booking",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Booking" }, "404": { description: "Not found" } },
      },
    },
    "/branches": { get: { tags: ["branches"], summary: "List branches", responses: { "200": { description: "Branch list" } } } },
    "/doctors": { get: { tags: ["branches"], summary: "List doctors/resources", responses: { "200": { description: "Doctor list" } } } },
    "/invoices": { get: { tags: ["invoices"], summary: "List invoices", responses: { "200": { description: "Invoice list" } } } },
    "/payments": { get: { tags: ["invoices"], summary: "List payments", responses: { "200": { description: "Payment list" } } } },
    "/organization": { get: { tags: ["organization"], summary: "Organization overview", responses: { "200": { description: "Hierarchy overview" } } } },
    "/oauth/token": {
      post: {
        tags: ["oauth"],
        summary: "OAuth 2.1 client credentials token",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  grant_type: { type: "string", enum: ["client_credentials"] },
                  client_id: { type: "string" },
                  client_secret: { type: "string" },
                },
                required: ["grant_type", "client_id", "client_secret"],
              },
            },
          },
        },
        responses: { "200": { description: "Access token" }, "401": { description: "Invalid client" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", enum: ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;
