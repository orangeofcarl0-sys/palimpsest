/** PLMP-GRAPH-1 (24 号规格): the AgentGraph IR - renderer-neutral and
 * runtime-neutral. The capability gate decides what compiles to the current
 * DAG runtime; everything else fails closed with UNSUPPORTED_* diagnostics. */

export {
  AGENT_EDGE_KINDS,
  AGENT_NODE_KINDS,
  ROOT_SCOPE,
  agentGraphCapabilities,
  compileAgentGraph,
  parseAgentGraph,
} from "./ir.js";
export type {
  AgentGraph,
  AgentGraphDiagnostic,
  AgentGraphDiagnosticType,
  AgentGraphEdge,
  AgentGraphEdgeKind,
  AgentGraphNode,
  AgentGraphNodeKind,
  AgentTaskPayload,
} from "./ir.js";
