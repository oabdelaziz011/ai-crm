import { registerMetadataExtension } from "../core/persistence/metadata-extension-registry";
import { registerNodePropertyEditorOverride } from "../core/node-property-editor-registry";
import { registerDocumentValidationExtension } from "../core/validation/validation-extension-registry";
import { StartTriggerPropertyEditor } from "../components/triggers/start-trigger-property-editor";
import type { WorkflowDocument } from "../core/types";
import { createTriggerValidationExtension } from "./validation/trigger-validation-extension";
import {
  readTriggerConfigFromMetadata,
  TRIGGER_CONFIG_EXTENSION_KEY,
  withTriggerConfigExtension,
} from "./utilities/trigger-config-utils";

let registered = false;

export function registerTriggerPlatform(): void {
  if (registered) return;
  registered = true;

  registerDocumentValidationExtension(createTriggerValidationExtension());

  registerMetadataExtension({
    read(metadata) {
      const triggerConfig = readTriggerConfigFromMetadata(metadata);
      if (!triggerConfig) return undefined;
      return { [TRIGGER_CONFIG_EXTENSION_KEY]: triggerConfig };
    },
    write(document, metadata) {
      const triggerConfig = document.extensions?.[TRIGGER_CONFIG_EXTENSION_KEY];
      if (!triggerConfig || typeof triggerConfig !== "object") {
        const { [TRIGGER_CONFIG_EXTENSION_KEY]: _removed, ...rest } = metadata;
        return rest;
      }
      return {
        ...metadata,
        [TRIGGER_CONFIG_EXTENSION_KEY]: triggerConfig,
      };
    },
  });

  registerNodePropertyEditorOverride("start", StartTriggerPropertyEditor);
}

export function applyTriggerMetadataToDocument(
  document: WorkflowDocument,
  triggerConfig: ReturnType<typeof readTriggerConfigFromMetadata>,
): WorkflowDocument {
  if (!triggerConfig) return document;
  return withTriggerConfigExtension(document, triggerConfig);
}

export function resetTriggerPlatformRegistrationForTests(): void {
  registered = false;
}
