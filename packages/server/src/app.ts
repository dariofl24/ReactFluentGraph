import express from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { ClusterResponse, Snapshot } from "../../shared/src/types.ts";
import { Store, publicWorkflow } from "./store.ts";
import type { StoredWorkflow } from "./store.ts";
import { ApiError } from "./errors.ts";
import { isObject, MAX_FILE_BYTES, parseWorkflow } from "./graph.ts";
import { generate } from "./generate.ts";
import { readLegacy } from "./legacy.ts";
import { validateNodeColors } from "./configuration.ts";
import { nodeColor } from "../../shared/src/palette.ts";
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, "INVALID_INPUT", `${field} is required.`);
  return value.trim();
}
function enabled(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new ApiError(400, "INVALID_INPUT", "enabled must be a boolean.");
  return value;
}
function location(value: unknown): string {
  const path = text(value, "Absolute JSON path");
  if (!isAbsolute(path))
    throw new ApiError(400, "INVALID_INPUT", "Workflow path must be absolute.");
  return path;
}
export function createApp(store: Store, clientDirectory?: string) {
  const app = express();
  let busy = false;
  app.disable("x-powered-by");
  // This local filesystem API must not accept writes from an unrelated web page.
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (req.get("sec-fetch-site") === "cross-site")
        return next(
          new ApiError(
            403,
            "ORIGIN_REJECTED",
            "Use FluentGraph from its local application URL.",
          ),
        );
      if (origin) {
        let allowed = false;
        try {
          const u = new URL(origin);
          allowed =
            ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
            ["3001", "5173", process.env.PORT ?? "3001"].includes(u.port);
        } catch {
          /* rejected below */
        }
        if (!allowed)
          return next(
            new ApiError(
              403,
              "ORIGIN_REJECTED",
              "Untrusted application origin.",
            ),
          );
      }
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/configuration/node-colors", (_req, res) =>
    res.json(store.nodeColors()),
  );
  app.put("/api/configuration/node-colors", (req, res) =>
    res.json(store.saveNodeColors(validateNodeColors(req.body))),
  );

  app.use("/api", (req, _res, next) => {
    if (busy && !["GET", "HEAD"].includes(req.method))
      return next(
        new ApiError(
          409,
          "GENERATION_BUSY",
          "A generation or import is running. Please wait.",
        ),
      );
    next();
  });
  const getWorkflow = (id: string) => {
    const w = store.workflow(id);
    if (!w) throw new ApiError(404, "NOT_FOUND", "Workflow not found.");
    return w;
  };
  const uniqueName = (name: string, id?: string) => {
    if (store.workflows().some((w) => w.id !== id && w.name === name))
      throw new ApiError(
        409,
        "DUPLICATE_NAME",
        "A workflow with that name already exists.",
      );
  };
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/workflows", (_req, res) =>
    res.json(store.workflows().map(publicWorkflow)),
  );
  app.post("/api/workflows", (req, res) => {
    const name = text(req.body?.name, "Name");
    uniqueName(name);
    const w: StoredWorkflow = {
      id: randomUUID(),
      name,
      source: "path",
      location: location(req.body?.location),
      filename: null,
      enabled:
        req.body.enabled === undefined ? true : enabled(req.body.enabled),
      document: null,
    };
    store.save(w);
    res.status(201).json(publicWorkflow(w));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 3 },
  });
  app.post("/api/workflows/upload", upload.single("file"), (req, res) => {
    // Multipart parsing yields; another operation may have acquired the lock
    // since the request passed the first guard.
    if (busy)
      throw new ApiError(
        409,
        "GENERATION_BUSY",
        "A generation or import is running. Please wait.",
      );
    if (!req.file)
      throw new ApiError(400, "FILE_REQUIRED", "Choose a workflow JSON file.");
    const name = text(
      req.body?.name || req.file.originalname.replace(/\.json$/i, ""),
      "Name",
    );
    uniqueName(name);
    const document = req.file.buffer.toString("utf8");
    parseWorkflow(document, req.file.originalname);
    if (
      req.body?.enabled !== undefined &&
      !["true", "false"].includes(req.body.enabled)
    )
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "enabled must be true or false.",
      );
    const w: StoredWorkflow = {
      id: randomUUID(),
      name,
      source: "upload",
      location: null,
      filename: req.file.originalname,
      enabled: req.body?.enabled !== "false",
      document,
    };
    store.save(w);
    res.status(201).json(publicWorkflow(w));
  });
  app.patch("/api/workflows/:id", (req, res) => {
    const w = getWorkflow(String(req.params.id));
    if (
      !isObject(req.body) ||
      !Object.keys(req.body).some((k) =>
        ["name", "location", "enabled"].includes(k),
      )
    )
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Provide name, location, or enabled.",
      );
    if (req.body.name !== undefined) {
      w.name = text(req.body.name, "Name");
      uniqueName(w.name, w.id);
    }
    if (req.body.location !== undefined) {
      if (w.source !== "path")
        throw new ApiError(
          400,
          "INVALID_INPUT",
          "Uploaded workflows do not have a local path.",
        );
      w.location = location(req.body.location);
    }
    if (req.body.enabled !== undefined) w.enabled = enabled(req.body.enabled);
    store.save(w);
    res.json(publicWorkflow(w));
  });
  app.delete("/api/workflows/:id", (req, res) => {
    getWorkflow(String(req.params.id));
    store.remove(String(req.params.id));
    res.status(204).end();
  });
  app.post("/api/generations", async (_req, res) => {
    const workflows = store.workflows().filter((w) => w.enabled);
    if (!workflows.length)
      throw new ApiError(
        422,
        "NO_WORKFLOWS",
        "Enable at least one workflow before generating.",
      );
    busy = true;
    try {
      const clusters = await generate(workflows),
        id = randomUUID(),
        createdAt = new Date().toISOString();
      const snapshot: Snapshot = {
        id,
        createdAt,
        imported: false,
        clusters: clusters.map((c, i) => ({
          ...c,
          id: `${id}-${i}`,
          createdAt,
        })),
      };
      store.saveSnapshot(snapshot);
      res.status(201).json({ id, clusterCount: clusters.length });
    } finally {
      busy = false;
    }
  });
  app.get("/api/clusters", (_req, res) => {
    const snapshot = store.snapshot();
    const response: ClusterResponse = {
      snapshot: snapshot
        ? {
            id: snapshot.id,
            createdAt: snapshot.createdAt,
            imported: snapshot.imported,
          }
        : null,
      stale: store.stale(),
      clusters:
        snapshot?.clusters.map((c) => ({
          id: c.id,
          nodeCount: c.nodes.length,
          edgeCount: c.edges.length,
          types: [...new Set(c.nodes.map((n) => n.type))].sort(),
          preview: c.nodes.slice(0, 3).map((n) => n.name),
        })) ?? [],
    };
    res.json(response);
  });
  app.get("/api/clusters/:id", (req, res) => {
    const c = store.snapshot()?.clusters.find((c) => c.id === req.params.id);
    if (!c)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "This cluster is unavailable. It may have been replaced by a newer generation.",
      );
    const configuration = store.nodeColors();
    res.json({
      ...c,
      nodes: c.nodes.map((node) => ({
        ...node,
        color: nodeColor(node.type, configuration),
      })),
    });
  });
  app.post("/api/import/legacy", async (req, res) => {
    if (store.workflows().length || store.snapshot())
      throw new ApiError(
        409,
        "IMPORT_CONFLICT",
        "Legacy import requires empty application storage.",
      );
    const directory = text(req.body?.directory, "Legacy directory");
    if (!isAbsolute(directory))
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Legacy directory must be an absolute path.",
      );
    busy = true;
    try {
      const result = await readLegacy(directory);
      store.import(result.workflows, result.snapshot);
      res.status(201).json({
        workflows: result.workflows.length,
        clusters: result.snapshot.clusters.length,
      });
    } finally {
      busy = false;
    }
  });
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "API endpoint not found.")),
  );
  if (clientDirectory) {
    app.use(express.static(clientDirectory));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(clientDirectory, "index.html")),
    );
  }
  app.use(
    (
      error: Error & { status?: number; code?: string; type?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        res.status(tooLarge ? 413 : 400).json({
          error: {
            code: error.code,
            message: tooLarge
              ? "Maximum workflow file size is 25 MiB."
              : error.message,
          },
        });
        return;
      }
      const status = error.status ?? 500;
      res.status(status).json({
        error: {
          code:
            error.code ??
            (status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST"),
          message:
            status === 500
              ? "An unexpected server error occurred. Check the server log."
              : error.message,
        },
      });
      if (status === 500) console.error(error);
    },
  );
  return app;
}
