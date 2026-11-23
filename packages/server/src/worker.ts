import { parentPort, workerData } from "node:worker_threads";
import { readFile, stat } from "node:fs/promises";
import type { StoredWorkflow } from "./store.ts";
import { buildClusters, MAX_FILE_BYTES, parseWorkflow } from "./graph.ts";
try {
  const workflows = workerData as StoredWorkflow[];
  const inputs = [];
  for (const w of workflows) {
    let text = w.document;
    if (w.source === "path") {
      try {
        const info = await stat(w.location!);
        if (!info.isFile()) throw Error("Not a file");
        if (info.size > MAX_FILE_BYTES)
          throw Object.assign(
            new Error(`${w.name}: maximum file size is 25 MiB.`),
            { status: 413, code: "FILE_TOO_LARGE" },
          );
        text = await readFile(w.location!, "utf8");
      } catch (e) {
        if ((e as { status?: number }).status === 413) throw e;
        throw Object.assign(
          new Error(
            `${w.name}: cannot read ${w.location}. Check the workflow path.`,
          ),
          { status: 422, code: "UNREADABLE_FILE" },
        );
      }
    }
    inputs.push({
      id: w.id,
      name: w.name,
      document: parseWorkflow(text ?? "", w.name),
    });
  }
  parentPort!.postMessage({ clusters: buildClusters(inputs) });
} catch (e) {
  const error = e as Error & { status?: number; code?: string };
  parentPort!.postMessage({
    error: {
      message: error.message,
      status: error.status ?? 422,
      code: error.code ?? "GENERATION_FAILED",
    },
  });
}
