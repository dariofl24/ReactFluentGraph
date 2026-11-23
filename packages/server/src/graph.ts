import { nodeColor } from "../../shared/src/palette.ts";
export { nodeColor };
import type {
  Cluster,
  GraphEdge,
  GraphNode,
  WorkflowDocument,
} from "../../shared/src/types.ts";
import { invalid } from "./errors.ts";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateWorkflow(data: unknown): WorkflowDocument {
  if (!isObject(data) || !Array.isArray(data.rulesets))
    throw invalid(
      "Workflow must be a JSON object containing a rulesets array.",
    );
  for (const [i, r] of data.rulesets.entries()) {
    if (!isObject(r) || typeof r.name !== "string" || !r.name.trim())
      throw invalid(`Ruleset ${i + 1} needs a non-empty name.`);
    if (r.type !== undefined && typeof r.type !== "string")
      throw invalid(`Ruleset ${r.name}: type must be a string.`);
    if (r.subtype !== undefined && typeof r.subtype !== "string")
      throw invalid(`Ruleset ${r.name}: subtype must be a string.`);
    if (r.rules !== undefined && !Array.isArray(r.rules))
      throw invalid(`Ruleset ${r.name}: rules must be an array.`);
    for (const rule of (r.rules as unknown[] | undefined) ?? []) {
      if (!isObject(rule))
        throw invalid(`Ruleset ${r.name}: every rule must be an object.`);
      if (rule.props != null && !isObject(rule.props))
        throw invalid(`Ruleset ${r.name}: rule props must be an object.`);
    }
  }
  return data as WorkflowDocument;
}
export function parseWorkflow(text: string, label: string): WorkflowDocument {
  if (Buffer.byteLength(text) > MAX_FILE_BYTES)
    throw new (class extends Error {
      status = 413;
      code = "FILE_TOO_LARGE";
    })(`${label}: maximum file size is 25 MiB.`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid(`${label}: invalid JSON.`);
  }
  try {
    return validateWorkflow(data);
  } catch (e) {
    throw invalid(`${label}: ${(e as Error).message}`);
  }
}
function stringProps(props: Record<string, unknown>): Set<string> {
  const values = new Set<string>(),
    stack = [props];
  while (stack.length)
    for (const value of Object.values(stack.pop()!)) {
      if (typeof value === "string") values.add(value);
      else if (Array.isArray(value))
        for (const item of value) {
          if (typeof item === "string") values.add(item);
        }
      else if (isObject(value)) stack.push(value);
    }
  return values;
}
export interface GraphInput {
  id: string;
  name: string;
  document: WorkflowDocument;
}
export function buildClusters(inputs: GraphInput[]): Cluster[] {
  const nodes: GraphNode[] = [],
    byName = new Map<string, GraphNode[]>();
  for (const input of inputs.slice().sort((a, b) => a.id.localeCompare(b.id)))
    input.document.rulesets.forEach((r, index) => {
      const type = r.type || "UNKNOWN";
      const n: GraphNode = {
        id: `${input.id}:${index}`,
        name: r.name,
        type,
        subtype: r.subtype ?? null,
        workflowId: input.id,
        workflowName: input.name,
        color: nodeColor(type),
        ruleset: r,
      };
      nodes.push(n);
      byName.set(r.name, [...(byName.get(r.name) ?? []), n]);
    });
  const edges: GraphEdge[] = [],
    neighbors = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  for (const node of nodes) {
    const targets = new Set<string>();
    for (const r of (node.ruleset as WorkflowDocument["rulesets"][number])
      .rules ?? [])
      if (r.props)
        for (const name of stringProps(r.props))
          for (const target of byName.get(name) ?? []) targets.add(target.id);
    for (const to of [...targets].sort()) {
      edges.push({ id: JSON.stringify([node.id, to]), from: node.id, to });
      neighbors.get(node.id)!.add(to);
      neighbors.get(to)!.add(node.id);
    }
  }
  const visited = new Set<string>(),
    components: string[][] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const ids: string[] = [],
      stack = [node.id];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop()!;
      ids.push(id);
      for (const next of neighbors.get(id)!)
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
    }
    components.push(ids);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = components.map((ids) => {
    const set = new Set(ids);
    return {
      ids,
      nodes: ids
        .map((id) => byId.get(id)!)
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
      edges: edges.filter((e) => set.has(e.from)),
    };
  });
  groups.sort(
    (a, b) =>
      b.nodes.length - a.nodes.length ||
      a.nodes[0].name.localeCompare(b.nodes[0].name) ||
      a.nodes[0].id.localeCompare(b.nodes[0].id),
  );
  return groups.map((g, index) => ({
    id: String(index),
    nodes: g.nodes,
    edges: g.edges,
  }));
}
