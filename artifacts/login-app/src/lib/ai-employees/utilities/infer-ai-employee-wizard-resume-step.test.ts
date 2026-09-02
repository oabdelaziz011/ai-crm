import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferAiEmployeeWizardResumeStepIndex } from "./infer-ai-employee-wizard-resume-step";
import { DEFAULT_AI_EMPLOYEE_FORM } from "@/lib/ai-employees/validators";

describe("inferAiEmployeeWizardResumeStepIndex", () => {
  it("resumes at knowledge when channels are set but knowledge/tools are empty", () => {
    const index = inferAiEmployeeWizardResumeStepIndex({
      ...DEFAULT_AI_EMPLOYEE_FORM,
      displayName: "Resume Probe",
      systemPrompt: "You are a disposable test employee.",
      provider: "openai",
      model: "gpt-4.1",
      knowledgeSourceIds: [],
      allowedToolKeys: [],
      tags: ["channel:whatsapp"],
    });
    assert.equal(index, 3);
  });

  it("resumes at tools when knowledge is set but tools are empty", () => {
    const index = inferAiEmployeeWizardResumeStepIndex({
      ...DEFAULT_AI_EMPLOYEE_FORM,
      displayName: "Resume Probe",
      systemPrompt: "You are a disposable test employee.",
      provider: "openai",
      model: "gpt-4.1",
      knowledgeSourceIds: ["ks-1"],
      allowedToolKeys: [],
      tags: ["channel:whatsapp"],
    });
    assert.equal(index, 4);
  });

  it("resumes at review when all configuration areas are filled", () => {
    const index = inferAiEmployeeWizardResumeStepIndex({
      ...DEFAULT_AI_EMPLOYEE_FORM,
      displayName: "Resume Probe",
      systemPrompt: "You are a disposable test employee.",
      provider: "openai",
      model: "gpt-4.1",
      knowledgeSourceIds: ["ks-1"],
      allowedToolKeys: ["search_knowledge"],
      tags: ["channel:whatsapp"],
    });
    assert.equal(index, 6);
  });
});
