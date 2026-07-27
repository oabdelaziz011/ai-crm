export * from "@/lib/communication/types";
export * from "@/lib/communication/providers/communication-provider";
export * from "@/lib/communication/providers/channel-providers";
export * from "@/lib/communication/templates";
export * from "@/lib/communication/dispatcher";
export * from "@/lib/communication/queue";
export * from "@/lib/communication/history";
export * from "@/lib/communication/preferences";
export * from "@/lib/communication/scheduler";
export * from "@/lib/communication/events";
export * from "@/lib/communication/utilities";
export * from "@/lib/communication/services";
export * from "@/lib/communication/hooks";
export * from "@/lib/communication/cache";

export {
  createCommunicationPlatform,
  getCommunicationPlatform,
} from "@/lib/communication/services/communication-platform-service";
