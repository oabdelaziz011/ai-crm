import { canConnect } from "../connection-rules";
import { assignBranchForNewEdge } from "../logic/branch-utils";
import {
  createEdgeId,
  createNodeId,
  type BuilderAction,
  type BuilderEdge,
  type BuilderNode,
  type BuilderState,
  type BuilderViewport,
  type WorkflowDocument,
} from "../types";

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameViewport(left: BuilderViewport, right: BuilderViewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
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
        saveStatus: "dirty",
      };
    case "DELETE_NODES":
      return deleteNodes(state, action.nodeIds);
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
      const outgoing = state.document.edges.filter((edge) => edge.source === action.sourceNodeId);
      let edges = [...state.document.edges];
      if (outgoing.length === 1) {
        const targetId = outgoing[0]!.target;
        edges = edges.filter((edge) => edge.id !== outgoing[0]!.id);
        edges.push(createEdgeFromNodes(action.sourceNodeId, action.node.id, state.document.nodes, edges));
        edges.push(createEdgeFromNodes(action.node.id, targetId, [...state.document.nodes, action.node], edges));
      } else {
        edges.push(createEdgeFromNodes(action.sourceNodeId, action.node.id, state.document.nodes, edges));
      }

      return {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, action.node],
          edges,
        },
        selectedNodeIds: [action.node.id],
        saveStatus: "dirty",
      };
    }
    case "SET_SAVE_STATUS":
      return { ...state, saveStatus: action.status };
    case "SET_VALIDATION":
      return { ...state, validationIssues: action.issues };
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
    clipboard: [],
  };
}

export function createEdgeFromNodes(source: string, target: string, nodes?: BuilderNode[], edges?: BuilderEdge[]) {
  const base = { id: createEdgeId(source, target), source, target };
  if (!nodes || !edges) return base;
  const sourceNode = nodes.find((node) => node.id === source);
  return { ...base, ...assignBranchForNewEdge(sourceNode, edges) };
}
