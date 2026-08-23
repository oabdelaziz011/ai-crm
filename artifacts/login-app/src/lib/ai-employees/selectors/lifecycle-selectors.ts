import type {
  AiEmployeeRecord,
  AiEmployeeVersionComparison,
  AiEmployeeVersionSnapshot,
} from "@/lib/ai-employees/types";

export function employeeToVersionSnapshot(employee: AiEmployeeRecord): AiEmployeeVersionSnapshot {
  return {
    displayName: employee.displayName,
    description: employee.description,
    avatar: employee.avatar,
    department: employee.department,
    provider: employee.provider,
    model: employee.model,
    temperature: employee.temperature,
    maxTokens: employee.maxTokens,
    systemPrompt: employee.systemPrompt,
    systemPromptSummary: employee.systemPromptSummary,
    welcomeMessage: employee.welcomeMessage,
    knowledgeSourceIds: [...employee.knowledgeSourceIds],
    knowledgeSummary: employee.knowledgeSummary,
    allowedToolKeys: [...employee.allowedToolKeys],
    toolSummary: employee.toolSummary,
    promptVersionLabel: employee.promptVersionLabel,
    runtimeConfiguration: employee.runtimeConfiguration,
    tags: [...employee.tags],
  };
}

export function compareEmployeeVersionSnapshots(
  left: AiEmployeeVersionSnapshot,
  right: AiEmployeeVersionSnapshot,
  leftVersionNumber: number,
  rightVersionNumber: number,
): AiEmployeeVersionComparison {
  return {
    leftVersionNumber,
    rightVersionNumber,
    sections: [
      section("prompt", left.systemPrompt, right.systemPrompt),
      section("welcome", left.welcomeMessage, right.welcomeMessage),
      section("runtime", JSON.stringify(left.runtimeConfiguration), JSON.stringify(right.runtimeConfiguration)),
      section("knowledge", left.knowledgeSourceIds.join(", "), right.knowledgeSourceIds.join(", ")),
      section("tools", left.allowedToolKeys.join(", "), right.allowedToolKeys.join(", ")),
      section(
        "limits",
        `${left.temperature ?? "—"} / ${left.maxTokens ?? "—"}`,
        `${right.temperature ?? "—"} / ${right.maxTokens ?? "—"}`,
      ),
    ],
  };
}

function section(
  name: AiEmployeeVersionComparison["sections"][number]["section"],
  before: string,
  after: string,
) {
  return {
    section: name,
    changed: before !== after,
    before,
    after,
  };
}
