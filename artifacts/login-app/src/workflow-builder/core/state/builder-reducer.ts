import { canConnect } from "../connection-rules";
import { assignBranchForNewEdge } from "../logic/branch-utils";
import { generateInteractiveRouting } from "../logic/interactive-routing-generator";
import { createEdgeId, createNodeId, type BuilderAction, type BuilderEdge, type BuilderNode, type BuilderState, type BuilderViewport, type WorkflowDocument } from "../types";
import { createBuilderClientKey } from "../persistence/builder-node-identity";

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameViewport(left: BuilderViewport, right: BuilderViewport): boolean {
  const epsilon = 0.001;
  return (
    Math.abs(left.x - right.x) < epsilon &&
    Math.abs(left.y - right.y) < epsilon &&
    Math.abs(left.zoom - right.zoom) < epsilon
  );
}

function deleteNodes(state: BuilderState, nodeIds: string[]): BuilderState {
  const ids = new Set(nodeIds);
  return {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes.filter((node) => !ids.has(node.id)),
      edges: state.document.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
    },
    selectedNodeIds: state.selectedNodeIds.filter((id) => !ids.has(id)),
    selectedEdgeIds: state.selectedEdgeIds.filter((id) => {
      const edge = state.document.edges.find((entry) => entry.id === id);
      return edge ? !ids.has(edge.source) && !ids.has(edge.target) : true;
    }),
    saveStatus: "dirty",
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "LOAD_DOCUMENT":
      return {
        ...state,
        document: action.document,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        saveStatus: "saved",
        validationIssues: [],
        activeValidationIssueId: null,
        validationPanelFocusNonce: 0,
        clipboard: [],
      };
    case "REPLACE_STATE":
      return action.state;
    case "SET_METADATA":
      return {
        ...state,
        document: { ...state.document, ...action.patch },
        saveStatus: "dirty",
      };
    case "ADD_NODE":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, action.node],
        },
        selectedNodeIds: [action.node.id],
        selectedEdgeIds: [],
        saveStatus: "dirty",
        layoutAnimationEnabled: true,
      };
    case "UPDATE_NODE_CONFIG":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map((node) =>
            node.id === action.nodeId ? { ...node, config: { ...node.config, ...action.patch } } : node,
          ),
        },
        selectedNodeIds: state.selectedNodeIds,
        saveStatus: "dirty",
      };
    case "UPDATE_NODE_POSITIONS":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map((node) => {
            const next = action.positions.find((entry) => entry.id === node.id);
            return next ? { ...node, position: { x: next.x, y: next.y } } : node;
          }),
        },
        selectedNodeIds: state.selectedNodeIds,
        selectedEdgeIds: state.selectedEdgeIds,
        saveStatus: "dirty",
        layoutAnimationEnabled: action.transient ? state.layoutAnimationEnabled : true,
      };
    case "DELETE_NODES":
      return { ...deleteNodes(state, action.nodeIds), layoutAnimationEnabled: true };
    case "ADD_EDGE": {
      const attempt = canConnect({
        sourceId: action.edge.source,
        targetId: action.edge.target,
        nodes: state.document.nodes,
        edges: state.document.edges,
      });
      if (!attempt.allowed) return state;
      const sourceNode = state.document.nodes.find((node) => node.id === action.edge.source);
      const branch = assignBranchForNewEdge(sourceNode, state.document.edges);
      const edge: BuilderEdge = { ...action.edge, ...branch };
      return {
        ...state,
        document: {
          ...state.document,
          edges: [...state.document.edges, edge],
        },
        saveStatus: "dirty",
      };
    }
    case "DELETE_EDGES":
      return {
        ...state,
        document: {
          ...state.document,
          edges: state.document.edges.filter((edge) => !action.edgeIds.includes(edge.id)),
        },
        selectedEdgeIds: state.selectedEdgeIds.filter((id) => !action.edgeIds.includes(id)),
        saveStatus: "dirty",
      };
    case "SET_VIEWPORT":
      if (sameViewport(state.document.viewport, action.viewport)) {
        return state;
      }
      return {
        ...state,
        document: { ...state.document, viewport: action.viewport },
        saveStatus: "dirty",
      };
    case "SELECT_NODES":
      if (
        state.selectedEdgeIds.length === 0 &&
        sameStringArray(state.selectedNodeIds, action.nodeIds)
      ) {
        return state;
      }
      return { ...state, selectedNodeIds: action.nodeIds, selectedEdgeIds: [] };
    case "SELECT_EDGES":
      if (
        state.selectedNodeIds.length === 0 &&
        sameStringArray(state.selectedEdgeIds, action.edgeIds)
      ) {
        return state;
      }
      return { ...state, selectedEdgeIds: action.edgeIds, selectedNodeIds: [] };
    case "COPY_NODES": {
      const ids = new Set(action.nodeIds);
      return {
        ...state,
        clipboard: state.document.nodes.filter((node) => ids.has(node.id)).map((node) => structuredClone(node)),
      };
    }
    case "PASTE_NODES": {
      if (state.clipboard.length === 0) return state;
      const offset = action.offset ?? { x: 40, y: 40 };
      const pasted = state.clipboard.map((node) => ({
        ...structuredClone(node),
        id: createNodeId(),
        clientKey: createBuilderClientKey(),
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      }));
      return {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, ...pasted],
        },
        selectedNodeIds: pasted.map((node) => node.id),
        saveStatus: "dirty",
      };
    }
    case "DUPLICATE_NODES": {
      const ids = new Set(action.nodeIds);
      const selectedNodes = state.document.nodes.filter((node) => ids.has(node.id));
      if (selectedNodes.length === 0) return state;
      const offset = action.offset ?? { x: 40, y: 40 };
      const idMap = new Map<string, string>();
      const duplicated = selectedNodes.map((node) => {
        const nextId = createNodeId();
        idMap.set(node.id, nextId);
        return {
          ...structuredClone(node),
          id: nextId,
          clientKey: createBuilderClientKey(),
          position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
        };
      });
      const duplicatedEdges = state.document.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({
          id: createEdgeId(idMap.get(edge.source)!, idMap.get(edge.target)!),
          source: idMap.get(edge.source)!,
          target: idMap.get(edge.target)!,
          branchKey: edge.branchKey,
          branchLabel: edge.branchLabel,
        }));
      return {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, ...duplicated],
          edges: [...state.document.edges, ...duplicatedEdges],
        },
        selectedNodeIds: duplicated.map((node) => node.id),
        saveStatus: "dirty",
      };
    }
    case "INSERT_NODE_AFTER": {
      const nodesWithNew = [...state.document.nodes, action.node];
      const outgoing = state.document.edges.filter((edge) => edge.source === action.sourceNodeId);
      let edges = [...state.document.edges];

      const appendEdge = (source: string, target: string, currentEdges: BuilderEdge[]) => {
        const attempt = canConnect({
          sourceId: source,
          targetId: target,
          nodes: nodesWithNew,
          edges: currentEdges,
        });
        if (!attempt.allowed) return;
        edges.push(createEdgeFromNodes(source, target, nodesWithNew, currentEdges));
      };

      if (outgoing.length === 1) {
        const targetId = outgoing[0]!.target;
        edges = edges.filter((edge) => edge.id !== outgoing[0]!.id);
        appendEdge(action.sourceNodeId, action.node.id, edges);
        appendEdge(action.node.id, targetId, edges);
      } else {
        appendEdge(action.sourceNodeId, action.node.id, edges);
      }

      return {
        ...state,
        document: {
          ...state.document,
          nodes: nodesWithNew,
          edges,
        },
        selectedNodeIds: [action.node.id],
        selectedEdgeIds: [],
        saveStatus: "dirty",
      };
    }
    case "GENERATE_INTERACTIVE_ROUTING": {
      const result = generateInteractiveRouting(state.document, action.interactiveNodeId);
      return {
        ...state,
        document: result.document,
        selectedNodeIds: [result.switchNodeId],
        selectedEdgeIds: [],
        saveStatus: "dirty",
      };
    }
    case "SET_SAVE_STATUS":
      return { ...state, saveStatus: action.status };
    case "SET_VALIDATION": {
      const activeStillExists = action.issues.some((issue) => issue.id === state.activeValidationIssueId);
      return {
        ...state,
        validationIssues: action.issues,
        activeValidationIssueId: activeStillExists ? state.activeValidationIssueId : null,
      };
    }
    case "SET_ACTIVE_VALIDATION_ISSUE":
      return { ...state, activeValidationIssueId: action.issueId };
    case "REQUEST_VALIDATION_PANEL_FOCUS":
      return { ...state, validationPanelFocusNonce: state.validationPanelFocusNonce + 1 };
    case "SET_LAYOUT_ANIMATION":
      return state.layoutAnimationEnabled === action.enabled
        ? state
        : { ...state, layoutAnimationEnabled: action.enabled };
    default:
      return state;
  }
}

export function createInitialBuilderState(document: WorkflowDocument): BuilderState {
  return {
    document,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    saveStatus: "saved",
    validationIssues: [],
    activeValidationIssueId: null,
    validationPanelFocusNonce: 0,
    clipboard: [],
    layoutAnimationEnabled: true,
  };
}

export function createEdgeFromNodes(source: string, target: string, nodes?: BuilderNode[], edges?: BuilderEdge[]) {
  const base = { id: createEdgeId(source, target), source, target };
  if (!nodes || !edges) return base;
  const sourceNode = nodes.find((node) => node.id === source);
  return { ...base, ...assignBranchForNewEdge(sourceNode, edges) };
}
