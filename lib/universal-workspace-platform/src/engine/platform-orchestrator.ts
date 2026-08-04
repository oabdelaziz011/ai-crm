import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import { OperationsRuntimeConfigurationError } from "@workspace/universal-operations-engine";
import type { WorkspaceContext } from "../types/workspace-types.js";
import { workspaceEngine } from "./workspace-engine.js";
import { personalizationEngine } from "./personalization-engine.js";
import { widgetEngine } from "./widget-engine.js";
import { commandEngine } from "./command-engine.js";
import { searchEngine } from "./search-engine.js";
import { notificationEngine } from "./notification-engine.js";
import { favoritesEngine } from "./favorites-engine.js";
import { activityEngine } from "./activity-engine.js";
import { designerEngine } from "./designer-engine.js";
import { listWorkspaceTemplates } from "./template-registry.js";

export type PlatformSnapshot = {
  workspace: ReturnType<typeof workspaceEngine.resolve>;
  widgets: ReturnType<typeof widgetEngine.buildSnapshots>;
  commands: ReturnType<typeof commandEngine.list>;
  notifications: ReturnType<typeof notificationEngine.list>;
  unreadCount: number;
  favorites: ReturnType<typeof favoritesEngine.list>;
  activity: ReturnType<typeof activityEngine.groupByPeriod>;
  templates: ReturnType<typeof listWorkspaceTemplates>;
};

export class WorkspacePlatformOrchestrator {
  buildSnapshot(context: WorkspaceContext, userId: string, role: string, config: OperationsWorkspaceConfig): PlatformSnapshot {
    if (!config) {
      throw new OperationsRuntimeConfigurationError(
        "Published operations configuration is required — workspace platform cannot resolve without configuration",
      );
    }

    return {
      workspace: workspaceEngine.resolve(context.entityType, context.templateKey, config.customer360?.sections),
      widgets: widgetEngine.buildSnapshots(config.dashboard?.widgets ?? []),
      commands: commandEngine.list(role),
      notifications: notificationEngine.list(),
      unreadCount: notificationEngine.unreadCount(),
      favorites: favoritesEngine.list(),
      activity: activityEngine.groupByPeriod(),
      templates: listWorkspaceTemplates(),
    };
  }

  getPersonalization(userId: string) {
    return personalizationEngine.get(userId);
  }

  search(query: string) {
    const results = searchEngine.search(query);
    return { results, groups: searchEngine.groupResults(results) };
  }

  getDesignerPalette() {
    return designerEngine.getPalette();
  }

  createDesignerState(name: string, templateKey: string) {
    return designerEngine.createState(name, templateKey);
  }
}

export const workspacePlatformOrchestrator = new WorkspacePlatformOrchestrator();
