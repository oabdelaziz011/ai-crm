export type VariableCategory = "customer" | "conversation" | "booking" | "company" | "workflow" | "system" | "ai";

export type WorkflowVariable = {
  id: string;
  category: VariableCategory;
  label: string;
  token: string;
  description?: string;
  previewValue?: string;
};

export type VariableProvider = {
  id: string;
  category: VariableCategory;
  label: string;
  listVariables: () => WorkflowVariable[];
};

const providers = new Map<string, VariableProvider>();

export function registerVariableProvider(provider: VariableProvider): void {
  providers.set(provider.id, provider);
}

export function listVariableProviders(): VariableProvider[] {
  return [...providers.values()];
}

export function listVariablesByCategory(category: VariableCategory): WorkflowVariable[] {
  return listVariableProviders()
    .filter((provider) => provider.category === category)
    .flatMap((provider) => provider.listVariables());
}

export function listAllWorkflowVariables(): WorkflowVariable[] {
  return listVariableProviders().flatMap((provider) => provider.listVariables());
}

export function findWorkflowVariable(token: string): WorkflowVariable | undefined {
  return listAllWorkflowVariables().find((variable) => variable.token === token);
}
