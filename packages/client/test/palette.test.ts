import test from "node:test";
import assert from "node:assert/strict";
import { nodeColor, nodeTextColor } from "../../shared/src/palette.ts";
test("configured types override defaults, custom types are case-insensitive, and unknown types use the configured fallback", () => {
  const configuration = {
    colors: { ORDER: "#112233", CUSTOM_TYPE: "#F472B6" },
    fallbackColor: "#445566",
  };
  assert.equal(nodeColor(" order ", configuration), "#112233");
  assert.equal(nodeColor("custom_type", configuration), "#F472B6");
  assert.equal(nodeColor("missing", configuration), "#445566");
});
test("labels stay readable on both light and dark custom fills", () => {
  assert.equal(nodeTextColor("#000000"), "#FFFFFF");
  assert.equal(nodeTextColor("#FFFFFF"), "#1F2937");
  assert.equal(nodeTextColor("#BAE6FD"), "#1F2937");
  assert.equal(nodeTextColor("#111827"), "#FFFFFF");
});
