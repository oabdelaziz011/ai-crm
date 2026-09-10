/**
 * Vite/Rollup manual chunk resolver — splits vendor and workspace packages only.
 * App route code stays on natural lazy boundaries to avoid pulling feature chunks
 * into the login shell via shared UI modules.
 */
export function resolveManualChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  const normalized = id.replace(/\\/g, "/");

  if (normalized.includes("pdfjs-dist") || normalized.includes("pdf-lib")) {
    return "pdf-generation";
  }
  if (normalized.includes("nodemailer")) {
    return "nodemailer";
  }
  if (normalized.includes("recharts") || normalized.includes("d3-")) {
    return "charts";
  }
  if (normalized.includes("@xyflow/react") || normalized.includes("@xyflow/system")) {
    return "workflow-builder";
  }
  if (
    normalized.includes("@workspace/knowledge-platform")
    || normalized.includes("@workspace/embedding-platform")
    || normalized.includes("@workspace/retrieval-engine")
    || normalized.includes("@workspace/vector-store")
    || normalized.includes("@workspace/vector-query")
  ) {
    return "knowledge-platform";
  }
  if (
    normalized.includes("@workspace/runtime-integration")
    || normalized.includes("@workspace/ai-execution-engine")
    || normalized.includes("@workspace/agent-runtime")
    || normalized.includes("@workspace/ai-tool-router")
    || normalized.includes("@workspace/ai-observability")
    || normalized.includes("@workspace/platform-ai-provider")
    || normalized.includes("@workspace/automation-platform")
    || normalized.includes("@workspace/ai-workflow-platform")
  ) {
    return "ai-runtime";
  }
  if (
    normalized.includes("@workspace/ai-conversation")
    || normalized.includes("@workspace/channel-platform")
    || normalized.includes("@workspace/channel-registry")
    || normalized.includes("@workspace/ai-prompt-orchestrator")
  ) {
    return "ai-chat";
  }
  if (normalized.includes("date-fns") || normalized.includes("react-day-picker")) {
    return "vendor-dates";
  }
  if (normalized.includes("framer-motion")) {
    return "vendor-motion";
  }
  if (normalized.includes("@supabase")) {
    return "vendor-supabase";
  }
  if (normalized.includes("lucide-react")) {
    return "vendor-icons";
  }

  // Remaining node_modules, including React and Radix, share one chunk.
  // A separate vendor-radix/vendor-misc split created a circular init cycle
  // (radix → react → misc → radix), so React was undefined when Radix ran
  // forwardRef/createContext at module scope.
  return "vendor-react";
}
