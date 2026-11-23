import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultNodeColorConfiguration,
  DEFAULT_NODE_COLORS,
} from "../../shared/src/palette.ts";
import { ApiError } from "./errors.ts";
import type {
  Snapshot,
  Workflow,
  NodeColorConfiguration,
} from "../../shared/src/types.ts";
export interface StoredWorkflow extends Workflow {
  document: string | null;
}
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT, stale INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO state(id) VALUES(1);",
    );
  }
  nodeColors(): NodeColorConfiguration {
    const row = this.db
      .prepare("SELECT data FROM settings WHERE key='node_colors'")
      .get();
    return row
      ? JSON.parse(row.data as string)
      : defaultNodeColorConfiguration();
  }
  saveNodeColors(
    configuration: NodeColorConfiguration,
  ): NodeColorConfiguration {
    return this.transaction(() => {
      const current = this.nodeColors();
      if (current.revision !== configuration.revision)
        throw new ApiError(
          409,
          "CONFIGURATION_CONFLICT",
          "These settings changed in another tab. Reload the page before saving.",
        );
      const next = {
        colors: { ...DEFAULT_NODE_COLORS, ...configuration.colors },
        fallbackColor: configuration.fallbackColor,
        revision: current.revision + 1,
      };
      this.db
        .prepare(
          "INSERT INTO settings VALUES('node_colors',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
        )
        .run(JSON.stringify(next));
      return next;
    });
  }
  workflows(): StoredWorkflow[] {
    return this.db
      .prepare("SELECT data FROM workflows ORDER BY id")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  workflow(id: string): StoredWorkflow | undefined {
    const r = this.db.prepare("SELECT data FROM workflows WHERE id=?").get(id);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  save(workflow: StoredWorkflow) {
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO workflows VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .run(workflow.id, JSON.stringify(workflow));
      this.markStale();
    });
  }
  remove(id: string) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM workflows WHERE id=?").run(id);
      this.markStale();
    });
  }
  private markStale() {
    this.db.exec("UPDATE state SET stale=1 WHERE snapshot IS NOT NULL");
  }
  snapshot(): Snapshot | null {
    const row = this.db.prepare("SELECT snapshot FROM state WHERE id=1").get()!;
    return row.snapshot ? JSON.parse(row.snapshot as string) : null;
  }
  stale(): boolean {
    return Boolean(
      this.db.prepare("SELECT stale FROM state WHERE id=1").get()!.stale,
    );
  }
  saveSnapshot(snapshot: Snapshot, stale = false) {
    this.db
      .prepare("UPDATE state SET snapshot=?,stale=? WHERE id=1")
      .run(JSON.stringify(snapshot), Number(stale));
  }
  import(workflows: StoredWorkflow[], snapshot: Snapshot) {
    this.transaction(() => {
      for (const w of workflows)
        this.db
          .prepare("INSERT INTO workflows VALUES(?,?)")
          .run(w.id, JSON.stringify(w));
      this.saveSnapshot(snapshot, true);
    });
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
export function publicWorkflow(w: StoredWorkflow): Workflow {
  return {
    id: w.id,
    name: w.name,
    source: w.source,
    location: w.location,
    filename: w.filename,
    enabled: w.enabled,
  };
}
