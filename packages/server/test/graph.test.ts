import test from "node:test";
import assert from "node:assert/strict";
import { buildClusters, validateWorkflow } from "../src/graph.ts";
const doc = (rulesets: unknown[]) => ({ rulesets });
const rule = (name: string, props: unknown = {}) => ({
  name,
  type: "ORDER",
  rules: [{ props }],
});
const input = (id: string, data: unknown) => ({
  id,
  name: id,
  document: validateWorkflow(data),
});

test("matches exact names, all duplicates, nested objects and direct string arrays only", () => {
  const result = buildClusters([
    input(
      "one",
      doc([
        rule("A", {
          one: "B",
          nested: { x: ["B", "C"] },
          ignored: [{ x: "D" }],
          case: "b",
        }),
        rule("B"),
        rule("C"),
        rule("D"),
      ]),
    ),
    input("two", doc([rule("B")])),
  ]);
  assert.deepEqual(
    result.map((c) => c.nodes.length),
    [4, 1],
  );
  assert.equal(result[0].edges.length, 3);
  assert.equal(
    new Set(result.flatMap((c) => c.nodes.map((n) => n.id))).size,
    5,
  );
  assert.deepEqual(result[0].edges.map((e) => e.to).sort(), [
    "one:1",
    "one:2",
    "two:0",
  ]);
});
test("handles cycles, self links and isolated nodes deterministically", () => {
  const result = buildClusters([
    input(
      "wf",
      doc([rule("A", { x: "B" }), rule("B", { x: ["A", "B"] }), rule("C")]),
    ),
  ]);
  assert.deepEqual(
    result.map((c) => [c.nodes.length, c.edges.length]),
    [
      [2, 3],
      [1, 0],
    ],
  );
  assert.deepEqual(
    result,
    buildClusters([
      input(
        "wf",
        doc([rule("A", { x: "B" }), rule("B", { x: ["A", "B"] }), rule("C")]),
      ),
    ]),
  );
});
test("preserves raw JSON and provenance, tolerates absent type and empty workflows", () => {
  const r = { name: "Untyped", description: "kept", rules: [] };
  const node = buildClusters([input("wf", doc([r]))])[0].nodes[0];
  assert.deepEqual(node.ruleset, r);
  assert.equal(node.workflowId, "wf");
  assert.equal(node.type, "UNKNOWN");
  assert.deepEqual(buildClusters([input("wf", doc([]))]), []);
});
test("rejects malformed workflows and rules rather than silently dropping nodes", () => {
  for (const bad of [
    null,
    {},
    [],
    { rulesets: [{}] },
    doc([{ name: "A", rules: {} }]),
    doc([{ name: "A", rules: [null] }]),
    doc([{ name: "A", rules: [{ props: [] }] }]),
  ])
    assert.throws(() => validateWorkflow(bad));
});

test("generated nodes use the pastel type palette, case-insensitively, with the fallback for unknown types", () => {
  const palette: [string, string][] = [
    ["ORDER", "#BAE6FD"],
    ["FULFILMENT", "#C7D2FE"],
    ["RETURN_ORDER", "#FECDD3"],
    ["WAVE", "#DDD6FE"],
    ["LOCATION", "#A7F3D0"],
    ["INVENTORY_CATALOGUE", "#FED7AA"],
    ["INVENTORY_POSITION", "#99F6E4"],
    ["INVENTORY_QUANTITY", "#D9F99D"],
    ["CREDIT_MEMO", "#FBCFE8"],
    ["BILLING_ACCOUNT", "#FDE68A"],
    ["INVOICE", "#BBF7D0"],
    ["FULFILMENT_PLAN", "#BFDBFE"],
    ["FULFILMENT_OPTIONS", "#E9D5FF"],
    ["FULFILMENT_CHOICE", "#FDBA74"],
    ["ARTICLE", "#F5D0FE"],
    ["CONSIGNMENT", "#FCA5A5"],
    ["CUSTOM", "#E2E8F0"],
  ];
  for (const [type, color] of palette) {
    const clusters = buildClusters([
      input(
        "palette",
        doc([{ name: "Colored ruleset", type: type.toLowerCase() }]),
      ),
    ]);
    assert.equal(clusters[0].nodes[0].color, color, type);
  }
});
