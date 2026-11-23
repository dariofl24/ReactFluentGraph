import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Cluster, GraphNode, Snapshot } from "../../shared/src/types.ts";
import type { StoredWorkflow } from "./store.ts";
import { invalid } from "./errors.ts";
import { isObject, nodeColor } from "./graph.ts";
async function records(path: string): Promise<Record<string, unknown>[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw invalid(`Cannot read legacy file: ${path}`);
  }
  try {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as unknown)
      .filter((r) => !(isObject(r) && "schemaVersion" in r))
      .map((r) => {
        if (!isObject(r)) throw Error();
        return r;
      });
  } catch {
    throw invalid(`Invalid JSONDB records in ${path}`);
  }
}
export async function readLegacy(
  directory: string,
): Promise<{ workflows: StoredWorkflow[]; snapshot: Snapshot }> {
  const [wf, cs] = await Promise.all([
    records(join(directory, "data/workflowFiles.json")),
    records(join(directory, "data/clusters.json")),
  ]);
  const workflowNames = new Set<string>();
  const workflows: StoredWorkflow[] = wf.map((r) => {
    if (
      typeof r.id !== "string" ||
      !r.id.trim() ||
      typeof r.location !== "string" ||
      !r.location.trim() ||
      typeof r.enabled !== "boolean" ||
      workflowNames.has(r.id)
    )
      throw invalid("Invalid or repeated legacy workflow registration.");
    workflowNames.add(r.id);
    return {
      id: randomUUID(),
      name: r.id,
      source: "path",
      location: r.location,
      filename: null,
      enabled: r.enabled,
      document: null,
    };
  });
  const clusterIds = new Set<string>();
  const importId = randomUUID();
  const clusters: Cluster[] = cs
    .map((c) => {
      if (
        (typeof c.id !== "number" && typeof c.id !== "string") ||
        clusterIds.has(String(c.id)) ||
        !Array.isArray(c.nodeDefinitions) ||
        !Array.isArray(c.contents) ||
        !Array.isArray(c.relations)
      )
        throw invalid("Invalid or repeated legacy cluster.");
      clusterIds.add(String(c.id));
      const rawNodes = c.nodeDefinitions as unknown[],
        rawContent = c.contents as unknown[];
      const content = new Map<string, Record<string, unknown>>();
      for (const item of rawContent) {
        if (
          !isObject(item) ||
          (typeof item.id !== "number" && typeof item.id !== "string") ||
          typeof item.content !== "string" ||
          content.has(String(item.id))
        )
          throw invalid("Invalid legacy ruleset content.");
        let json: unknown;
        try {
          json = JSON.parse(item.content);
        } catch {
          throw invalid("Legacy ruleset content contains invalid JSON.");
        }
        if (!isObject(json))
          throw invalid("Legacy ruleset must be a JSON object.");
        content.set(String(item.id), json);
      }
      const nodeIds = new Set<string>();
      const nodes: GraphNode[] = rawNodes.map((raw) => {
        if (
          !isObject(raw) ||
          (typeof raw.id !== "number" && typeof raw.id !== "string") ||
          typeof raw.label !== "string" ||
          nodeIds.has(String(raw.id))
        )
          throw invalid("Invalid legacy node definition.");
        const id = String(raw.id);
        nodeIds.add(id);
        const ruleset = content.get(id);
        if (!ruleset) throw invalid("Legacy node is missing its JSON content.");
        const type =
          typeof ruleset.type === "string" ? ruleset.type : "UNKNOWN";
        return {
          id: `legacy:${c.id}:${id}`,
          name: raw.label,
          type,
          subtype: typeof ruleset.subtype === "string" ? ruleset.subtype : null,
          workflowId: null,
          workflowName: null,
          color: nodeColor(type),
          ruleset,
        };
      });
      if (content.size !== nodes.length)
        throw invalid("Legacy content references an unknown node.");
      const edges = new Map<string, { id: string; from: string; to: string }>();
      for (const r of c.relations) {
        if (
          !isObject(r) ||
          !nodeIds.has(String(r.from)) ||
          !nodeIds.has(String(r.to))
        )
          throw invalid("Legacy edge references an unknown node.");
        const from = `legacy:${c.id}:${r.from}`,
          to = `legacy:${c.id}:${r.to}`,
          id = JSON.stringify([from, to]);
        edges.set(id, { id, from, to });
      }
      const date = new Date(c.creationDate as string | number);
      if (!Number.isFinite(date.getTime()))
        throw invalid("Invalid legacy cluster creation date.");
      return {
        id: `${importId}-${c.id}`,
        createdAt: date.toISOString(),
        nodes,
        edges: [...edges.values()],
      };
    })
    .sort(
      (a, b) => b.nodes.length - a.nodes.length || a.id.localeCompare(b.id),
    );
  return {
    workflows,
    snapshot: {
      id: importId,
      createdAt:
        clusters
          .map((c) => c.createdAt!)
          .sort()
          .at(-1) ?? new Date().toISOString(),
      imported: true,
      clusters,
    },
  };
}
