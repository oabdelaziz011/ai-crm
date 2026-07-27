import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CommunicationDispatcher } from "@/lib/communication/dispatcher/communication-dispatcher";
import { CommunicationPreferenceService } from "@/lib/communication/preferences/communication-preference-service";
import { CustomerCommunicationPreferencesRepository } from "@/lib/communication/preferences/customer-communication-preferences-repository";
import { CommunicationQueueEngine, CommunicationQueueRepository } from "@/lib/communication/queue/communication-queue-engine";
import { CommunicationHistoryService } from "@/lib/communication/history/communication-history-service";
import { ReminderScheduler, ReminderScheduleRepository } from "@/lib/communication/scheduler/reminder-scheduler";
import { CommunicationDomainEventBridge } from "@/lib/communication/events/domain-event-bridge";
import { createDefaultCommunicationProviders } from "@/lib/communication/providers/channel-providers";

export type CommunicationPlatformServices = {
  dispatcher: CommunicationDispatcher;
  queue: CommunicationQueueEngine;
  history: CommunicationHistoryService;
  reminders: ReminderScheduler;
  events: CommunicationDomainEventBridge;
  customerPreferences: CustomerCommunicationPreferencesRepository;
};

export function createCommunicationPlatform(client: SupabaseClient = supabase): CommunicationPlatformServices {
  const customerPreferences = new CustomerCommunicationPreferencesRepository(client);
  const preferenceService = new CommunicationPreferenceService(client, customerPreferences);
  const dispatcher = new CommunicationDispatcher(preferenceService);

  for (const provider of createDefaultCommunicationProviders()) {
    dispatcher.register(provider);
  }

  const queue = new CommunicationQueueEngine(new CommunicationQueueRepository(client));
  const history = new CommunicationHistoryService(client);
  const reminders = new ReminderScheduler(new ReminderScheduleRepository(client));
  const events = new CommunicationDomainEventBridge(dispatcher, reminders);

  return { dispatcher, queue, history, reminders, events, customerPreferences };
}

let cached: CommunicationPlatformServices | null = null;

export function getCommunicationPlatform(): CommunicationPlatformServices {
  if (!cached) cached = createCommunicationPlatform();
  return cached;
}
