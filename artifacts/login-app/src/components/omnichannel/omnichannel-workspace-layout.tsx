import { memo, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

type OmnichannelWorkspaceLayoutProps = {
  queues: ReactNode;
  list: ReactNode;
  conversation: ReactNode;
  sidebar: ReactNode;
};

export const OmnichannelWorkspaceLayout = memo(function OmnichannelWorkspaceLayout({
  queues,
  list,
  conversation,
  sidebar,
}: OmnichannelWorkspaceLayoutProps) {
  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 rounded-xl">
      <ResizablePanel defaultSize={15} minSize={12} maxSize={22} className="min-w-0 pe-1">
        {queues}
      </ResizablePanel>
      <ResizableHandle withHandle className="mx-0.5 bg-transparent" />
      <ResizablePanel defaultSize={25} minSize={18} maxSize={34} className="min-w-0 px-0.5">
        {list}
      </ResizablePanel>
      <ResizableHandle withHandle className="mx-0.5 bg-transparent" />
      <ResizablePanel defaultSize={40} minSize={28} className="min-w-0 px-0.5">
        {conversation}
      </ResizablePanel>
      <ResizableHandle withHandle className="mx-0.5 bg-transparent" />
      <ResizablePanel defaultSize={20} minSize={16} maxSize={30} className="hidden min-w-0 ps-1 xl:block">
        {sidebar}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
