import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeJsonLine } from "../src/jsonSyntax.ts";

test("distinguishes JSON keys, string values, numbers, booleans, null and punctuation", () => {
  const line = '  "values": [true, false, null, -12.5e+2, "true", "42"],';
  const tokens = tokenizeJsonLine(line);
  assert.equal(tokens.map((t) => t.text).join(""), line);
  assert.deepEqual(
    tokens.filter((t) => !["plain", "punctuation"].includes(t.kind)),
    [
      { kind: "key", text: '"values"' },
      { kind: "boolean", text: "true" },
      { kind: "boolean", text: "false" },
      { kind: "null", text: "null" },
      { kind: "number", text: "-12.5e+2" },
      { kind: "string", text: '"true"' },
      { kind: "string", text: '"42"' },
    ],
  );
  assert.equal(tokens.find((t) => t.text === ":")?.kind, "punctuation");
});
test("preserves escaped quotes, backslashes and HTML-looking JSON as literal text", () => {
  const line = JSON.stringify({
    'quoted"key': 'backslash\\ and "quotes" <script>alert(1)</script>',
  });
  const tokens = tokenizeJsonLine(line);
  assert.equal(tokens.map((t) => t.text).join(""), line);
  assert.deepEqual(
    tokens.filter((t) => t.kind === "key").map((t) => JSON.parse(t.text)),
    ['quoted"key'],
  );
  assert.deepEqual(
    tokens.filter((t) => t.kind === "string").map((t) => JSON.parse(t.text)),
    ['backslash\\ and "quotes" <script>alert(1)</script>'],
  );
});
test("keeps whitespace-only lines intact", () => {
  assert.deepEqual(tokenizeJsonLine("   "), [{ kind: "plain", text: "   " }]);
  assert.deepEqual(tokenizeJsonLine(""), []);
});
