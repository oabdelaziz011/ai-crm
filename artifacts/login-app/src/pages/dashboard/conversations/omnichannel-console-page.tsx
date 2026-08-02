import { OmnichannelConsole } from "@/components/omnichannel/omnichannel-console";

/** Agent workspace lives inside the dashboard content region (sidebar + header remain visible). */
export default function OmnichannelConsolePage() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
      <OmnichannelConsole />
    </div>
  );
}