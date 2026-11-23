import { Worker } from "node:worker_threads";
import type { Cluster } from "../../shared/src/types.ts";
import type { StoredWorkflow } from "./store.ts";
import { ApiError } from "./errors.ts";
export function generate(workflows: StoredWorkflow[]): Promise<Cluster[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(
        import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js",
        import.meta.url,
      ),
      { workerData: workflows, execArgv: [] },
    );
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(
        new ApiError(
          422,
          "GENERATION_TIMEOUT",
          "Generation exceeded 60 seconds. Try fewer workflows.",
        ),
      );
    }, 60000);
    worker.once(
      "message",
      (message: {
        clusters: Cluster[];
        error?: { status: number; code: string; message: string };
      }) => {
        clearTimeout(timeout);
        if (message.error)
          reject(
            new ApiError(
              message.error.status,
              message.error.code,
              message.error.message,
            ),
          );
        else resolve(message.clusters);
      },
    );
    worker.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0)
        reject(
          new ApiError(
            500,
            "WORKER_FAILED",
            "Graph worker stopped unexpectedly.",
          ),
        );
    });
  });
}
