import type { ExecutiveReport } from "@/lib/executive/types";

/** PDF export abstraction — swappable renderer. */
export interface ExecutivePdfExporter {
  generate(report: ExecutiveReport): Promise<{ url: string | null; blob: Blob | null }>;
}

export class StubExecutivePdfExporter implements ExecutivePdfExporter {
  async generate(report: ExecutiveReport): Promise<{ url: string | null; blob: Blob | null }> {
    const lines = [report.title, `Generated: ${report.generatedAt}`, ""];
    for (const section of report.sections) {
      lines.push(section.heading);
      for (const [k, v] of Object.entries(section.metrics)) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "application/pdf" });
    return { url: null, blob };
  }
}
