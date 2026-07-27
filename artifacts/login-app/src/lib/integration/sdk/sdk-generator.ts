/** SDK generator abstraction — foundation for TypeScript/JavaScript SDK generation. */
export type SdkLanguage = "typescript" | "javascript" | "python" | "csharp" | "java" | "php";

export type SdkGeneratorConfig = {
  language: SdkLanguage;
  baseUrl: string;
  apiVersion: string;
  packageName: string;
};

export type GeneratedSdkArtifact = {
  language: SdkLanguage;
  files: Array<{ path: string; content: string }>;
};

export function generateSdkStub(config: SdkGeneratorConfig): GeneratedSdkArtifact {
  const clientName = config.packageName.replace(/[^a-zA-Z0-9]/g, "") || "ValueORClient";

  if (config.language === "typescript" || config.language === "javascript") {
    return {
      language: config.language,
      files: [
        {
          path: `${clientName.toLowerCase()}.ts`,
          content: `/** Auto-generated ValueOR SDK (${config.apiVersion}) */
export class ${clientName} {
  constructor(private readonly apiKey: string, private readonly baseUrl = "${config.baseUrl}") {}

  private async request<T>(method: string, path: string): Promise<T> {
    const res = await fetch(\`\${this.baseUrl}/api/${config.apiVersion}\${path}\`, {
      method,
      headers: { Authorization: \`Bearer \${this.apiKey}\`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(\`API error \${res.status}\`);
    return res.json() as Promise<T>;
  }

  listCustomers(cursor?: string) { return this.request("GET", \`/customers\${cursor ? \`?cursor=\${cursor}\` : ""}\`); }
  listBookings(date?: string) { return this.request("GET", \`/bookings\${date ? \`?date=\${date}\` : ""}\`); }
  listBranches() { return this.request("GET", "/branches"); }
  listInvoices() { return this.request("GET", "/invoices"); }
}
`,
        },
      ],
    };
  }

  return {
    language: config.language,
    files: [{ path: "README.md", content: `# ${clientName}\n\nSDK generation for ${config.language} is planned.\n` }],
  };
}
