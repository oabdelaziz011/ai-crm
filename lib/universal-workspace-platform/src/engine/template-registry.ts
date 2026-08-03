export type WorkspaceTemplateDefinition = {
  key: string;
  labelKey: string;
  icon: string;
  industry: string;
  defaultEntityTypes: string[];
};

export const WORKSPACE_TEMPLATES: WorkspaceTemplateDefinition[] = [
  { key: "clinic", labelKey: "templates.clinic", icon: "Stethoscope", industry: "healthcare", defaultEntityTypes: ["customer", "invoice", "booking"] },
  { key: "hospital", labelKey: "templates.hospital", icon: "Hospital", industry: "healthcare", defaultEntityTypes: ["customer", "employee", "ticket"] },
  { key: "training_center", labelKey: "templates.training", icon: "GraduationCap", industry: "education", defaultEntityTypes: ["customer", "lead", "project"] },
  { key: "automotive", labelKey: "templates.automotive", icon: "Car", industry: "automotive", defaultEntityTypes: ["customer", "order", "asset"] },
  { key: "legal", labelKey: "templates.legal", icon: "Scale", industry: "legal", defaultEntityTypes: ["customer", "contract", "invoice"] },
  { key: "manufacturing", labelKey: "templates.manufacturing", icon: "Factory", industry: "manufacturing", defaultEntityTypes: ["order", "asset", "employee"] },
  { key: "construction", labelKey: "templates.construction", icon: "HardHat", industry: "construction", defaultEntityTypes: ["project", "asset", "contract"] },
  { key: "consulting", labelKey: "templates.consulting", icon: "Briefcase", industry: "consulting", defaultEntityTypes: ["customer", "project", "invoice"] },
  { key: "beauty", labelKey: "templates.beauty", icon: "Sparkles", industry: "beauty", defaultEntityTypes: ["customer", "booking", "invoice"] },
  { key: "gym", labelKey: "templates.gym", icon: "Dumbbell", industry: "fitness", defaultEntityTypes: ["customer", "contract", "booking"] },
  { key: "education", labelKey: "templates.education", icon: "BookOpen", industry: "education", defaultEntityTypes: ["customer", "lead", "project"] },
  { key: "hr", labelKey: "templates.hr", icon: "Users", industry: "hr", defaultEntityTypes: ["employee", "lead", "contract"] },
  { key: "real_estate", labelKey: "templates.realEstate", icon: "Home", industry: "real_estate", defaultEntityTypes: ["lead", "customer", "contract"] },
];

export function getWorkspaceTemplate(key: string): WorkspaceTemplateDefinition | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.key === key);
}

export function listWorkspaceTemplates(): WorkspaceTemplateDefinition[] {
  return WORKSPACE_TEMPLATES;
}
