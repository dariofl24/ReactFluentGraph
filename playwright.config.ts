import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "fluentgraph-browser-"));
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    headless: true,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && PORT=3002 FLUENTGRAPH_DB=${dir}/test.sqlite npm start`,
    url: "http://127.0.0.1:3002/api/health",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
