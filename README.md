# FluentGraph

A local workbench for exploring Fluent Commerce workflow relationships. Built with React, TypeScript, Node.js 24, Express, SQLite and vis-network.

## Run

Requires **Node.js 24.x** and npm. With nvm: `nvm use`.

```sh
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs at `http://localhost:3001`. Both listen only on the local loopback interface. Fonts and graph assets are bundled locally; the running app requires no internet connection.

For production on this machine:

```sh
npm run build
npm start
```

Open [http://localhost:3001](http://localhost:3001). Express serves the built UI and supports direct cluster URLs. `PORT` overrides the API/production port. Development Vite proxies `/api` to port 3001.

## Use

1. **Add workflow**: enter a display name and an absolute JSON path, or upload a JSON file. Each file must contain a root `rulesets` array and be no larger than 25 MiB.
2. Enable the workflows to include, then **Generate clusters**. Path-based files are reread every time; uploads are stored in the application database.
3. Open a cluster in a new browser tab, keeping the overview available. The navigation sidebar starts hidden in the explorer; use its top-left toggle to show it. Select a graph node to inspect its JSON without changing the zoom or position. Selecting a ruleset from the list focuses its node. Drag to pan, scroll to zoom, and use the fit control to show the full graph. The left column stacks the ruleset list above the JSON viewer, with the graph on the right. Drag its vertical divider to resize the column, or its horizontal divider to change the list/JSON height split. Focus a divider and use the matching arrow keys for keyboard resizing. On smaller screens, switch between Rulesets, Graph and Inspector.
4. Changes to registrations mark the last analysis stale. External edits to a path-based file are discovered on the next generation. A failed generation leaves previous results available. New successful generations replace cluster URLs.

JSON definitions are read-only, with syntax highlighting for keys, strings, numbers, booleans, null and punctuation. The copy action preserves the original formatted JSON. To update an uploaded workflow, remove it and upload the replacement. Removing a path registration never changes its source file.

## Import legacy FluentGraph

A fresh workspace shows **Import existing data**. Enter the absolute path to the legacy application directory, which must contain `data/workflowFiles.json` and `data/clusters.json`.

Import copies registrations and generated clusters into this application's database in a single transaction. It skips JSONDB schema headers, checks node/content/edge references, and preserves cluster timestamps and ruleset JSON. It does not write to the old application or its data. Import requires empty storage; it never merges into an existing workspace.

Legacy clusters lack workflow provenance, so imported nodes explicitly show it as unavailable. Regenerate using the imported path registrations to restore provenance. Imported results are marked as needing a refresh. Missing source paths can be edited before regenerating.

## Configure node colors

Open **Configuration** in the navigation sidebar (or the settings icon on a small screen). Edit the current type colors with the color picker or hex input. To add a type, enter its name and color, click **Add type**, then **Save changes**. Names match workflow entity types case-insensitively. Adding a type configures its display color; workflow JSON still defines the rulesets.

The page also configures the fallback for unconfigured types. Custom entries can be removed; default types remain available. Changes persist in the local database and update existing graphs, list markers without regeneration or camera movement. Labels automatically use dark or white text for contrast. **Discard changes** restores the saved draft baseline. If another settings tab saved newer changes, reload before saving to avoid overwriting them.

## Data and backups

Default database: `data/fluentgraph.sqlite` at the project root. Uploaded JSON and generated snapshots are stored in SQLite; path-based workflow contents remain in their original files. Set `FLUENTGRAPH_DB` to an absolute database path for a separate workspace.

To back up safely, stop the server, then copy the entire `data` directory, including any SQLite `-wal` and `-shm` files. Restore while the server is stopped. For a separate empty workspace, start with a new `FLUENTGRAPH_DB` path. Do not run multiple server processes against the same database: operation locking is per application process.

## Analysis compatibility

Each ruleset is a distinct node, identified by workflow ID and its array index. References come from exact, case-sensitive string matches in `rules[].props`: direct values, strings in arrays, and recursively nested objects. Objects inside arrays are not traversed, matching the legacy engine. Every ruleset with a matching name receives an edge, including duplicate names and self-references. Edges are deduplicated by source and target. Clusters are weakly connected components and include isolated nodes.

Cluster ordering is deterministic and largest-first. Ruleset names appear inside oval nodes. Node fills and list markers use a coordinated pastel entity-type palette, matched case-insensitively, with slate gray (#E2E8F0) for unknown types. Labels use dark text (#1F2937); selected nodes retain their fill and gain a thicker dark border. Existing snapshots use the updated palette immediately without regeneration. This tool shows name-based relationships, so repeated names can yield ambiguous connections; use the displayed workflow, type, subtype and raw JSON when interpreting them.

## API

All endpoints are under `/api`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Request |
|---|---|---|
| GET | `/workflows` | List public registrations |
| POST | `/workflows` | JSON `{name, location, enabled?}` |
| PATCH | `/workflows/:id` | JSON `{name?, location?, enabled?}` |
| DELETE | `/workflows/:id` | Remove registration |
| POST | `/workflows/upload` | Multipart `file`, optional `name`, `enabled` as `true`/`false` |
| POST | `/generations` | Generate from enabled registrations |
| GET | `/clusters` | Snapshot metadata, stale state, cluster summaries |
| GET | `/clusters/:id` | Nodes, edges and original ruleset objects |
| POST | `/import/legacy` | JSON `{directory}` |
| GET | `/configuration/node-colors` | Current `{colors, fallbackColor, revision}` |
| PUT | `/configuration/node-colors` | Save `{colors, fallbackColor, revision}`; six-digit hex colors |
| GET | `/health` | Readiness |

Validation uses 400 for malformed requests, 422 for invalid workflow/import data, 413 for oversized files, 404 for missing resources and 409 for conflicts or concurrent generation/import writes. Reads remain available during generation. A generation exceeding 60 seconds is stopped without replacing the previous snapshot.

## Development and verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Browser tests use an isolated temporary database, production build, and installed Google Chrome. To use a Playwright-managed Chromium instead, remove `channel: "chrome"` in `playwright.config.ts` and run `npx playwright install chromium`.

Optional private acceptance checks (contents are read from disk, never copied into source):

```sh
FLUENTGRAPH_LEGACY_DIR=/path/to/FluentGraph npm test
FLUENTGRAPH_LEGACY_DIR=/path/to/FluentGraph npm run test:e2e
```

The API/domain suite covers graph semantics, malformed inputs, upload boundaries, source rereads, persistence, atomic import and generation failure. The private graph check compares normalized nodes, edges and component membership with the legacy snapshot and checks the current fixture's 128 rulesets, 146 connections and six clusters. Browser tests cover management → generation → graph/JSON inspection → reload, responsive panels and failure recovery.
