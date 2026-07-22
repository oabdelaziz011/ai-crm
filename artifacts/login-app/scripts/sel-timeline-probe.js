// Session-only browser probe — NOT imported by app. Paste via CDP or bookmarklet.
(function () {
  function selectionKey(ids) {
    return [...ids].sort().join("|");
  }
  function getController() {
    const el = document.querySelector(".react-flow");
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber$"));
    let f = el[k];
    while (f) {
      if (f.memoizedProps?.controller?.dispatch) return f.memoizedProps.controller;
      f = f.return;
    }
    return null;
  }
  function getRuntimeSelected() {
    return (window.__WB_CANVAS_DEBUG__?.getStoreNodes?.() ?? [])
      .filter((n) => n.selected)
      .map((n) => n.id)
      .sort();
  }
  function findReactFlowFiber() {
    const el = document.querySelector(".react-flow");
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber$"));
    let f = el[k];
    while (f) {
      const p = f.memoizedProps;
      if (p?.onSelectionChange && p?.onNodesChange) return f;
      f = f.return;
    }
    return null;
  }

  const controller = getController();
  const rfFiber = findReactFlowFiber();
  if (!controller || !rfFiber) {
    return { error: "probe install failed", hasController: !!controller, hasFiber: !!rfFiber };
  }

  const log = [];
  let invocation = 0;
  const origDispatch = controller.dispatch.bind(controller);
  controller.dispatch = function (action) {
    if (action?.type === "SELECT_NODES" && log.length > 0) {
      const entry = log[log.length - 1];
      entry.selectNodesDispatched = true;
      entry.dispatchedIds = [...action.nodeIds].sort();
    }
    return origDispatch(action);
  };

  const original = rfFiber.memoizedProps.onSelectionChange;
  const wrapped = (params) => {
    invocation += 1;
    const rfSelectedIds = params.nodes.map((n) => n.id).sort();
    const builderSelectedIds = [...controller.state.selectedNodeIds].sort();
    const runtimeSelectedIds = getRuntimeSelected();
    const guardE1 = rfSelectedIds.length === 0 && builderSelectedIds.length > 0;
    const guardE2 = selectionKey(rfSelectedIds) === selectionKey(builderSelectedIds);
    const entry = {
      invocation,
      timestamp: Date.now(),
      rfSelectedIds,
      builderSelectedIds,
      runtimeSelectedIds,
      selectionKeyRf: selectionKey(rfSelectedIds),
      selectionKeyBuilder: selectionKey(builderSelectedIds),
      selectionKeyRuntime: selectionKey(runtimeSelectedIds),
      guardE1,
      guardE2,
      wouldDispatch: !(guardE1 || guardE2),
      selectNodesDispatched: false,
      dispatchedIds: [],
    };
    log.push(entry);
    original(params);
    entry.builderAfterDispatch = [...controller.state.selectedNodeIds].sort();
    entry.runtimeAfterDispatch = getRuntimeSelected();
  };

  rfFiber.memoizedProps.onSelectionChange = wrapped;
  if (rfFiber.pendingProps) rfFiber.pendingProps.onSelectionChange = wrapped;

  window.__SEL_TIMELINE__ = {
    log,
    clear() {
      log.length = 0;
      invocation = 0;
    },
    dump() {
      return log.slice();
    },
    snap() {
      return {
        builder: [...controller.state.selectedNodeIds].sort(),
        runtime: getRuntimeSelected(),
        dom: [...document.querySelectorAll(".react-flow__node.selected")]
          .map((n) => n.getAttribute("data-id"))
          .filter(Boolean)
          .sort(),
      };
    },
  };

  return { ok: true, installed: true };
})();
