import type { AutomationChannel } from "../constants.js";
import { BaseChannelProvider } from "./channel-provider.js";
import type { ProviderCapabilities } from "./models.js";

function createCapabilities(
  channel: AutomationChannel,
  providerKey: string,
  overrides?: Partial<ProviderCapabilities>,
): ProviderCapabilities {
  return {
    channel,
    providerKey,
    supportsText: true,
    supportsButtons: true,
    supportsLists: false,
    supportsMedia: true,
    supportsTemplates: false,
    supportsInteractiveReplies: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: false,
    ...overrides,
  };
}

class WebChatTransportProvider extends BaseChannelProvider {
  readonly channel = "web_chat" as const;
  readonly providerKey = "generic.web_chat";

  getCapabilities(): ProviderCapabilities {
    return createCapabilities(this.channel, this.providerKey, {
      supportsLists: true,
      supportsTemplates: true,
      supportsReadReceipts: true,
      interactiveList: {
        maxRowsPerList: 100,
        maxSectionsPerList: 10,
        supportsListPagination: true,
      },
    });
  }
}

class ApiTransportProvider extends BaseChannelProvider {
  readonly channel = "api" as const;
  readonly providerKey = "generic.api";

  getCapabilities(): ProviderCapabilities {
    return createCapabilities(this.channel, this.providerKey, {
      supportsButtons: false,
      supportsLists: false,
      supportsMedia: false,
      supportsInteractiveReplies: false,
      supportsDeliveryReceipts: false,
    });
  }
}

class EmailTransportProvider extends BaseChannelProvider {
  readonly channel = "email" as const;
  readonly providerKey = "generic.email";

  getCapabilities(): ProviderCapabilities {
    return createCapabilities(this.channel, this.providerKey, {
      supportsButtons: false,
      supportsLists: false,
      supportsMedia: true,
      supportsTemplates: true,
      supportsInteractiveReplies: false,
    });
  }
}

export function createBuiltInChannelProviders(): BaseChannelProvider[] {
  return [new WebChatTransportProvider(), new ApiTransportProvider(), new EmailTransportProvider()];
}
