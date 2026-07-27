/** Enterprise Marketplace & Plugin Platform */
export * from "@/lib/plugins/types";
export { getPluginPlatformServices, createPluginPlatformServices } from "@/lib/plugins/services/plugin-platform-factory";
export { PluginPlatformService } from "@/lib/plugins/services/plugin-platform-service";
export { PluginRuntimeService } from "@/lib/plugins/runtime/plugin-runtime-service";
export { validateManifest, parseManifest } from "@/lib/plugins/manifest/manifest-validator";
export { pluginSandbox } from "@/lib/plugins/sandbox/plugin-sandbox";
export { EXTENSION_POINTS, BUILTIN_WIDGETS } from "@/lib/plugins/registry/plugin-registry";
export { buildDependencyGraph, detectCycles } from "@/lib/plugins/registry/dependency-graph";
export { hasPluginPermission } from "@/lib/plugins/permissions/permission-resolver";
export { createPluginScaffold, validatePluginManifest } from "@/lib/plugins/sdk/plugin-sdk";
export {
  useMarketplaceOverview,
  useMarketplaceCatalog,
  useInstalledPlugins,
  usePluginMonitoring,
  usePluginAuditLog,
  useInstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
  useUninstallPlugin,
} from "@/lib/plugins/hooks/use-marketplace-dashboard";
export { MARKETPLACE_PERMISSIONS, canViewMarketplace } from "@/lib/plugins/security/plugin-permissions";
