import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";
const workflow = (name = "A", props = {}) =>
  JSON.stringify({ rulesets: [{ name, type: "ORDER", rules: [{ props }] }] });
async function setup(t: import("node:test").TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "fluentgraph-"));
  const store = new Store(join(dir, "db.sqlite"));
  const app = createApp(store);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, store, api: request(app) };
}
test("path CRUD persists, rereads files, marks snapshots stale, preserves results on failure", async (t) => {
  const { dir, store, api } = await setup(t);
  const location = join(dir, "wf.json");
  await writeFile(location, workflow());
  const added = await api
    .post("/api/workflows")
    .send({ name: "Orders", location, enabled: true })
    .expect(201);
  const id = added.body.id;
  await api.post("/api/generations").expect(201);
  const initial = (await api.get("/api/clusters").expect(200)).body;
  assert.equal(initial.clusters[0].nodeCount, 1);
  assert.equal(initial.stale, false);
  await writeFile(
    location,
    JSON.stringify({
      rulesets: [
        { name: "A", rules: [{ props: { event: "B" } }] },
        { name: "B" },
      ],
    }),
  );
  await api.post("/api/generations").expect(201);
  const next = (await api.get("/api/clusters")).body;
  assert.equal(next.clusters[0].nodeCount, 2);
  await api.get("/api/clusters/" + initial.clusters[0].id).expect(404);
  await api
    .patch("/api/workflows/" + id)
    .send({ name: "Orders renamed" })
    .expect(200);
  assert.equal((await api.get("/api/clusters")).body.stale, true);
  await writeFile(location, "broken");
  const failed = await api.post("/api/generations").expect(422);
  assert.match(failed.body.error.message, /invalid JSON/);
  assert.equal(
    (await api.get("/api/clusters")).body.snapshot.id,
    next.snapshot.id,
  );
  const reopened = new Store(join(dir, "db.sqlite"));
  assert.equal(reopened.workflows()[0].name, "Orders renamed");
  assert.equal(reopened.snapshot()!.clusters[0].nodes.length, 2);
  reopened.close();
  await api.delete("/api/workflows/" + id).expect(204);
  assert.equal(store.workflows().length, 0);
  await api
    .patch("/api/workflows/" + id)
    .send({ enabled: true })
    .expect(404);
  await api.post("/api/generations").expect(422);
});
test("uploads validate before saving, retain bytes, generate, and enforce size limits", async (t) => {
  const { api, store } = await setup(t);
  await api
    .post("/api/workflows/upload")
    .field("name", "Bad")
    .attach("file", Buffer.from("{}"), "bad.json")
    .expect(422);
  assert.equal(store.workflows().length, 0);
  const uploaded = await api
    .post("/api/workflows/upload")
    .field("name", "Uploaded")
    .field("enabled", "true")
    .attach("file", Buffer.from(workflow("U")), "workflow.json")
    .expect(201);
  assert.equal(uploaded.body.source, "upload");
  await api.post("/api/generations").expect(201);
  const c = (await api.get("/api/clusters")).body.clusters[0];
  const detail = await api.get("/api/clusters/" + c.id).expect(200);
  assert.equal(detail.body.nodes[0].name, "U");
  await api
    .post("/api/workflows/upload")
    .attach("file", Buffer.alloc(25 * 1024 * 1024 + 1), "big.json")
    .expect(413);
  assert.equal(store.workflows().length, 1);
  await api
    .patch("/api/workflows/" + uploaded.body.id)
    .send({ enabled: "false" })
    .expect(400);
  await api
    .post("/api/workflows")
    .send({ name: "Relative", location: "../x.json" })
    .expect(400);
});
test("legacy import copies headers/JSON/dates and refuses conflicts without touching originals", async (t) => {
  const { dir, api } = await setup(t);
  const legacy = join(dir, "legacy");
  await mkdir(join(legacy, "data"), { recursive: true });
  const registration =
    '{"schemaVersion":"1.0"}\n' +
    JSON.stringify({
      id: "Legacy",
      location: "/tmp/source.json",
      enabled: true,
    });
  const cluster =
    '{"schemaVersion":"1.0"}\n' +
    JSON.stringify({
      id: 0,
      creationDate: 1600000000000,
      nodeDefinitions: [{ id: 1, label: "A" }],
      contents: [{ id: 1, content: '{"name":"A","extra":42}' }],
      relations: [{ from: 1, to: 1 }],
    });
  await writeFile(join(legacy, "data/workflowFiles.json"), registration);
  await writeFile(join(legacy, "data/clusters.json"), cluster);
  await api.post("/api/import/legacy").send({ directory: legacy }).expect(201);
  const list = (await api.get("/api/clusters")).body;
  assert.equal(list.snapshot.imported, true);
  const result = (await api.get("/api/clusters/" + list.clusters[0].id)).body;
  assert.equal(result.nodes[0].workflowId, null);
  assert.equal(result.nodes[0].ruleset.extra, 42);
  assert.equal(result.createdAt, "2020-09-13T12:26:40.000Z");
  await api.post("/api/import/legacy").send({ directory: legacy }).expect(409);
  assert.equal(
    await readFile(join(legacy, "data/workflowFiles.json"), "utf8"),
    registration,
  );
  assert.equal(
    await readFile(join(legacy, "data/clusters.json"), "utf8"),
    cluster,
  );
});
test("invalid legacy references roll back workflow registrations as well as clusters", async (t) => {
  const { dir, api, store } = await setup(t);
  await mkdir(join(dir, "data"));
  await writeFile(
    join(dir, "data/workflowFiles.json"),
    JSON.stringify({ id: "X", location: "/tmp/x.json", enabled: true }),
  );
  await writeFile(
    join(dir, "data/clusters.json"),
    JSON.stringify({
      id: 0,
      creationDate: 0,
      nodeDefinitions: [{ id: 1, label: "A" }],
      contents: [{ id: 1, content: '{"name":"A"}' }],
      relations: [{ from: 1, to: 2 }],
    }),
  );
  await api.post("/api/import/legacy").send({ directory: dir }).expect(422);
  assert.equal(store.workflows().length, 0);
  assert.equal(store.snapshot(), null);
});

test("a multipart upload started before generation cannot commit while generation is busy", async (t) => {
  const { createServer, request: httpRequest } = await import("node:http");
  const { dir, store } = await setup(t);
  const app = createApp(store);
  const path = join(dir, "base.json");
  await writeFile(path, workflow("Base"));
  store.save({
    id: "base",
    name: "Base",
    source: "path",
    location: path,
    enabled: true,
    filename: null,
    document: null,
  });
  const prefixSeen = Promise.withResolvers<void>();
  const generationStarted = Promise.withResolvers<void>();
  const server = createServer((req, res) => {
    app(req, res);
    if (req.url === "/api/workflows/upload")
      req.once("data", () => prefixSeen.resolve());
    if (req.url === "/api/generations") generationStarted.resolve();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address() as import("node:net").AddressInfo;
  const boundary = "fluentgraph-delayed-upload";
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nLate upload\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="late.json"\r\nContent-Type: application/json\r\n\r\n${workflow("Late")}`;
  const suffix = `\r\n--${boundary}--\r\n`;
  let uploadRequest: import("node:http").ClientRequest;
  const uploadResult = new Promise<number>((resolve, reject) => {
    uploadRequest = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/api/workflows/upload",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": Buffer.byteLength(prefix + suffix),
        },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode!));
      },
    );
    uploadRequest.on("error", reject);
    uploadRequest.write(prefix);
  });
  await prefixSeen.promise;
  const generation = request(server)
    .post("/api/generations")
    .then((res) => res);
  await generationStarted.promise;
  uploadRequest!.end(suffix);
  const [uploadStatus, generationResult] = await Promise.all([
    uploadResult,
    generation,
  ]);
  assert.equal(uploadStatus, 409);
  assert.equal(generationResult.status, 201);
  assert.equal(store.workflows().length, 1);
  assert.equal(store.snapshot()!.clusters[0].nodes[0].name, "Base");
  assert.equal(store.stale(), false);
});

test("node color configuration persists, normalizes custom types, and recolors existing clusters without regeneration", async (t) => {
  const { dir, api } = await setup(t);
  const initial = (await api.get("/api/configuration/node-colors").expect(200))
    .body;
  assert.equal(initial.colors.ORDER, "#BAE6FD");
  assert.equal(initial.fallbackColor, "#E2E8F0");
  assert.equal(initial.revision, 0);
  const location = join(dir, "colors.json");
  await writeFile(
    location,
    JSON.stringify({
      rulesets: [
        { name: "Order node", type: "ORDER" },
        { name: "Custom node", type: "SPECIAL_TYPE" },
        { name: "Unknown node", type: "OTHER" },
      ],
    }),
  );
  await api
    .post("/api/workflows")
    .send({ name: "Colors", location, enabled: true })
    .expect(201);
  await api.post("/api/generations").expect(201);
  const original = (await api.get("/api/clusters")).body;
  const saved = (
    await api
      .put("/api/configuration/node-colors")
      .send({
        colors: { order: "#112233", " special_type ": "#aabbcc" },
        fallbackColor: "#445566",
        revision: initial.revision,
      })
      .expect(200)
  ).body;
  assert.equal(saved.colors.ORDER, "#112233");
  assert.equal(saved.colors.SPECIAL_TYPE, "#AABBCC");
  assert.equal(saved.colors.FULFILMENT, "#C7D2FE");
  assert.equal(saved.revision, 1);
  const actual: Record<string, string> = {};
  for (const c of original.clusters) {
    const detail = (await api.get("/api/clusters/" + c.id).expect(200)).body;
    for (const n of detail.nodes) actual[n.name] = n.color;
  }
  assert.deepEqual(actual, {
    "Order node": "#112233",
    "Custom node": "#AABBCC",
    "Unknown node": "#445566",
  });
  const current = (await api.get("/api/clusters")).body;
  assert.equal(current.snapshot.id, original.snapshot.id);
  assert.equal(current.stale, false);
  const reopened = new Store(join(dir, "db.sqlite"));
  try {
    assert.deepEqual(reopened.nodeColors(), saved);
  } finally {
    reopened.close();
  }
});

test("invalid colors and duplicate normalized types cannot corrupt configuration; stale edits return conflict", async (t) => {
  const { api } = await setup(t);
  const initial = (await api.get("/api/configuration/node-colors").expect(200))
    .body;
  for (const body of [
    { colors: { ORDER: "red" }, fallbackColor: "#E2E8F0", revision: 0 },
    { colors: { " ": "#112233" }, fallbackColor: "#E2E8F0", revision: 0 },
    {
      colors: { ORDER: "#112233", order: "#445566" },
      fallbackColor: "#E2E8F0",
      revision: 0,
    },
    { colors: { ORDER: "#112233" }, fallbackColor: "white", revision: 0 },
    { colors: [], fallbackColor: "#E2E8F0", revision: 0 },
    { colors: { ORDER: "#112233" }, fallbackColor: "#E2E8F0", revision: -1 },
  ])
    await api.put("/api/configuration/node-colors").send(body).expect(400);
  assert.deepEqual(
    (await api.get("/api/configuration/node-colors")).body,
    initial,
  );
  const saved = (
    await api
      .put("/api/configuration/node-colors")
      .send({ ...initial, colors: { ...initial.colors, CUSTOM: "#123456" } })
      .expect(200)
  ).body;
  await api
    .put("/api/configuration/node-colors")
    .send({ ...initial, colors: { ORDER: "#000000" } })
    .expect(409);
  assert.deepEqual(
    (await api.get("/api/configuration/node-colors")).body,
    saved,
  );
});
