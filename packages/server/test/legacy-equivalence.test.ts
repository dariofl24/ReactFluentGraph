import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildClusters, parseWorkflow } from "../src/graph.ts";
const directory = process.env.FLUENTGRAPH_LEGACY_DIR;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
test(
  "private legacy workflow matches complete normalized nodes, edges and components",
  { skip: !directory },
  async () => {
    const lines = async (file: string) =>
      (await readFile(join(directory!, "data", file), "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
        .filter((r) => !r.schemaVersion);
    const registrations = await lines("workflowFiles.json");
    const inputs = await Promise.all(
      registrations
        .filter((w) => w.enabled)
        .map(async (w) => ({
          id: w.id,
          name: w.id,
          document: parseWorkflow(await readFile(w.location, "utf8"), w.id),
        })),
    );
    const result = buildClusters(inputs);
    assert.deepEqual(
      result.map((c) => c.nodes.length),
      [111, 7, 4, 3, 2, 1],
    );
    assert.equal(
      result.reduce((n, c) => n + c.nodes.length, 0),
      128,
    );
    assert.equal(
      result.reduce((n, c) => n + c.edges.length, 0),
      146,
    );
    const actual = result
      .map((c) => {
        const byId = new Map(c.nodes.map((n) => [n.id, canonical(n.ruleset)]));
        return canonical({
          nodes: [...byId.values()].sort(),
          edges: c.edges
            .map((e) => canonical([byId.get(e.from), byId.get(e.to)]))
            .sort(),
        });
      })
      .sort();
    const legacy = (await lines("clusters.json"))
      .map((c) => {
        const byId = new Map(
          c.contents.map((n: { id: number; content: string }) => [
            n.id,
            canonical(JSON.parse(n.content)),
          ]),
        );
        return canonical({
          nodes: [...byId.values()].sort(),
          edges: c.relations
            .map((e: { from: number; to: number }) =>
              canonical([byId.get(e.from), byId.get(e.to)]),
            )
            .sort(),
        });
      })
      .sort();
    assert.deepEqual(actual, legacy);
  },
);
