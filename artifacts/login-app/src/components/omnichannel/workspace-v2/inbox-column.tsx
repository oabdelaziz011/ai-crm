import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { InboxRow } from "@/components/omnichannel/workspace-v2/inbox-row";

import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

import {

  OMNI_RENDER_TARGET_ID,

  OMNI_RENDER_TARGET_NUMBER,

} from "@/lib/omnichannel/debug/omni-render-audit";

import { traceDomRenderStage } from "@/lib/omnichannel/debug/omni-dom-render-audit";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";



const VIRT_PROOF_LOG = "[OMNI_VIRT_PROOF]";



declare global {

  interface Window {

    __OMNI_VIRT_PROOF__?: {

      at?: string;

      virtualizationDisabled?: boolean;

      totalConversations?: number;

      renderedRowsCount?: number;

      targetInConversationsProp?: boolean;

      targetIndex?: number | null;

      targetRendered?: boolean;

      queueCardMounted?: boolean;

      domElementExists?: boolean;

      domVisible?: Record<string, unknown> | null;

    };

  }

}



type InboxColumnProps = {

  title: string;

  conversations: UnifiedConversation[];

  selectedId: string | null;

  isLoading: boolean;

  hasMore: boolean;

  emptyTitle: string;

  emptyHint: string;

  loadingLabel: string;

  onSelect: (id: string) => void;

  onLoadMore: () => void;

  rowLabels: {

    visitorLabel: string;

    noPreview: string;

    aiEmployee: string;

    unassigned: string;

    open: string;

    newBadge?: string;

    pin?: string;

    star?: string;

    markUnread?: string;

    follow?: string;

  };

  unreadOverflowLabel: string;

};



export const InboxColumn = memo(function InboxColumn({

  title,

  conversations,

  selectedId,

  isLoading,

  hasMore,

  emptyTitle,

  emptyHint,

  loadingLabel,

  onSelect,

  onLoadMore,

  rowLabels,

  unreadOverflowLabel,

}: InboxColumnProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConversationsRef = useRef(conversations);

  /**
   * REAL fix: workspace-body uses overflow:hidden, so in-flow height can never
   * paint past the Conversation stretch box. Pin the Inbox panel to the viewport
   * with position:fixed (spacer keeps the flex slot / width). Conversation untouched.
   */
  useLayoutEffect(() => {
    const spacer = spacerRef.current;
    const panel = columnRef.current;
    if (!spacer || !panel) return;

    const sync = () => {
      const rect = spacer.getBoundingClientRect();
      const top = Math.max(0, Math.round(rect.top));
      const left = Math.round(rect.left);
      const width = Math.round(rect.width);
      panel.style.position = "fixed";
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.style.width = `${width}px`;
      panel.style.bottom = "0px";
      panel.style.height = "auto";
      panel.style.zIndex = "25";
      panel.style.right = "auto";
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(spacer);
    const body = spacer.parentElement;
    if (body) ro?.observe(body);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      ro?.disconnect();
    };
  }, []);



  const handleScroll = useCallback(() => {

    const node = scrollRef.current;

    if (!node) return;

    if (hasMore && node.scrollTop + node.clientHeight >= node.scrollHeight - 80) {

      onLoadMore();

    }

  }, [hasMore, onLoadMore]);



  useEffect(() => {
    traceReorderStage({
      stage: "InboxColumn",
      file: "inbox-column.tsx",
      function: "InboxColumn",
      line: 155,
      before: prevConversationsRef.current,
      after: conversations,
      arrayReferenceChanged: prevConversationsRef.current !== conversations,
      sortCalled: false,
      extra: { selectedId, isLoading, virtualizationDisabled: true },
    });
    prevConversationsRef.current = conversations;

    traceDomRenderStage({

      stage: "InboxColumn.conversationsProp",

      file: "inbox-column.tsx",

      function: "InboxColumn",

      line: 78,

      rows: conversations,

      extra: {

        selectedId,

        isLoading,

        hasMore,

        virtualizationDisabled: true,

      },

    });



    const targetIndex = conversations.findIndex((c) => c.id === OMNI_RENDER_TARGET_ID);

    const targetInConversationsProp = targetIndex >= 0;

    const renderedRowsCount = isLoading || conversations.length === 0 ? 0 : conversations.length;



    const logProof = (domElementExists: boolean, domVisible: Record<string, unknown> | null) => {

      const proof = {

        at: new Date().toISOString(),

        virtualizationDisabled: true,

        totalConversations: conversations.length,

        renderedRowsCount,

        targetId: OMNI_RENDER_TARGET_ID,

        targetNumber: OMNI_RENDER_TARGET_NUMBER,

        targetInConversationsProp,

        targetIndex: targetInConversationsProp ? targetIndex : null,

        targetRendered: targetInConversationsProp && !isLoading && conversations.length > 0,

        queueCardMounted: Boolean(window.__OMNI_VIRT_PROOF__?.queueCardMounted),

        domElementExists,

        domVisible,

      };

      window.__OMNI_VIRT_PROOF__ = { ...window.__OMNI_VIRT_PROOF__, ...proof };

      console.info(VIRT_PROOF_LOG, proof);

    };



    requestAnimationFrame(() => {

      const domNode = scrollRef.current?.querySelector(

        `[data-conversation-id="${OMNI_RENDER_TARGET_ID}"]`,

      );

      const domElementExists = domNode instanceof HTMLElement;

      const domVisible = domElementExists

        ? {

            display: globalThis.window.getComputedStyle(domNode).display,

            visibility: globalThis.window.getComputedStyle(domNode).visibility,

            opacity: globalThis.window.getComputedStyle(domNode).opacity,

            offsetHeight: domNode.offsetHeight,

            offsetTop: domNode.offsetTop,

            hidden: domNode.hidden,

          }

        : null;

      logProof(domElementExists, domVisible);

    });

  }, [conversations, isLoading, selectedId, hasMore]);



  return (
    <>
    {/* In-flow width slot only — does not control Inbox paint height */}
    <div
      ref={spacerRef}
      className="ws-inbox-spacer w-[var(--ws-list-width)] shrink-0 self-stretch"
      aria-hidden
    />

    <section

      ref={(node) => {
        columnRef.current = node;
      }}

      className="ws-inbox-column overflow-hidden border-s border-[var(--ws-border)] bg-[var(--ws-surface)]"

      aria-label={title}

    >

      <header className="flex shrink-0 items-center border-b border-[var(--ws-border-subtle)] px-3 py-2">

        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ws-muted)]">{title}</h2>

        <span className="ms-auto text-[10px] tabular-nums text-[var(--ws-muted)]">{conversations.length}</span>

      </header>



      <div

        ref={scrollRef}

        className="ws-inbox-list focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)]/40"

        onScroll={handleScroll}

        role="listbox"

        tabIndex={0}

        aria-activedescendant={selectedId ?? undefined}

      >

        {isLoading ? <p className="p-3 text-xs text-[var(--ws-muted)]">{loadingLabel}</p> : null}

        {!isLoading && conversations.length === 0 ? (

          <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">

            <p className="text-sm font-medium">{emptyTitle}</p>

            <p className="text-xs text-[var(--ws-muted)]">{emptyHint}</p>

          </div>

        ) : (

          conversations.map((conversation, index) => (

            <div

              key={conversation.id}

              className="ws-inbox-row-wrapper"

              data-conversation-id={conversation.id}

            >

              <InboxRow

                conversation={conversation}

                active={conversation.id === selectedId}

                index={index}

                onSelect={onSelect}

                ownerLabel={conversation.ownerLabel}

                ownershipTier={conversation.ownershipTier}

                unreadOverflowLabel={unreadOverflowLabel}

                labels={rowLabels}

              />

            </div>

          ))

        )}

      </div>

    </section>
    </>
  );

});


