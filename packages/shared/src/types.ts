export type JsonObject = { [key: string]: unknown };
export interface Ruleset extends JsonObject {
  name: string;
  type?: string;
  subtype?: string;
  rules?: { props?: JsonObject | null; [key: string]: unknown }[];
}
export interface WorkflowDocument extends JsonObject {
  rulesets: Ruleset[];
}
export interface Workflow {
  id: string;
  name: string;
  source: "path" | "upload";
  location: string | null;
  filename: string | null;
  enabled: boolean;
}
export interface GraphNode {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  workflowId: string | null;
  workflowName: string | null;
  color: string;
  ruleset: JsonObject;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}
export interface Cluster {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt?: string;
}
export interface ClusterSummary {
  id: string;
  nodeCount: number;
  edgeCount: number;
  types: string[];
  preview: string[];
}
export interface Snapshot {
  id: string;
  createdAt: string;
  imported: boolean;
  clusters: Cluster[];
}
export interface ClusterResponse {
  snapshot: Omit<Snapshot, "clusters"> | null;
  stale: boolean;
  clusters: ClusterSummary[];
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface NodeColorConfiguration {
  colors: Record<string, string>;
  fallbackColor: string;
  revision: number;
}
