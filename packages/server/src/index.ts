import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Store } from "./store.ts";
import { createApp } from "./app.ts";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(
  here,
  import.meta.url.endsWith(".ts") ? "../../.." : "../../../../..",
);
const dbPath =
  process.env.FLUENTGRAPH_DB ?? resolve(root, "data/fluentgraph.sqlite");
const clientDirectory = resolve(root, "packages/client/dist");
const store = new Store(dbPath);
const server = createApp(
  store,
  existsSync(clientDirectory) ? clientDirectory : undefined,
).listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () => {
  console.log(
    `FluentGraph API: http://localhost:${process.env.PORT ?? 3001}\nStorage: ${dbPath}`,
  );
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
