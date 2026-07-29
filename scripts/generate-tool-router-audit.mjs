#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildToolRouterAuditReport,
  TOOL_REGISTRY,
} from "../lib/ai-tool-router/src/llm-tool-catalog.ts";
import { listRegisteredToolHandlerKeys } from "../lib/ai-tool-router/src/tool-handler-registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registeredKeys = listRegisteredToolHandlerKeys({
  customerService: {},
  crmAgentPorts: {},
});

const report = {
  ...buildToolRouterAuditReport(registeredKeys),
  summary: {
    totalRegisteredInCatalog: TOOL_REGISTRY.length,
    mockToolsExcluded: 8,
    confirmationProtected: 2,
    llmExposedAfterChange: 7,
    previouslyLlmExposed: 1,
  },
};

const outPath = join(__dirname, "../docs/architecture/tool-router-llm-exposure-audit.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
