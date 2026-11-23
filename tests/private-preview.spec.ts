import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { Store } from "../packages/server/src/store.ts";
import { createApp } from "../packages/server/src/app.ts";

test("private legacy import, regeneration and 111-node visual acceptance", async ({
  page,
  request,
}) => {
  const directory = process.env.FLUENTGRAPH_LEGACY_DIR;
  test.skip(
    !directory,
    "Set FLUENTGRAPH_LEGACY_DIR to inspect the private legacy fixture.",
  );
  const dir = await mkdtemp(join(tmpdir(), "fluentgraph-preview-"));
  const store = new Store(join(dir, "preview.sqlite"));
  const app = createApp(store, resolve("packages/client/dist"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originals = await Promise.all(
    ["workflowFiles.json", "clusters.json"].map((f) =>
      readFile(join(directory!, "data", f), "utf8"),
    ),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const imported = await request.post(base + "/api/import/legacy", {
      data: { directory },
    });
    expect(imported.status()).toBe(201);
    const before = await (await request.get(base + "/api/clusters")).json();
    expect(
      before.clusters.map((c: { nodeCount: number }) => c.nodeCount),
    ).toEqual([111, 7, 4, 3, 2, 1]);
    expect(before.snapshot.imported).toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(base);
    await expect(
      page.getByRole("link", { name: /Explore Cluster 1,/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/fluentgraph-overview.png",
      fullPage: true,
    });
    const generated = await request.post(base + "/api/generations");
    expect(generated.status()).toBe(201);
    await page.reload();
    const overview = page;
    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: /Explore Cluster 1,/ }).click();
    page = await popup;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(overview).toHaveURL(base + "/");
    await expect(page.locator(".canvas-top-label")).toContainText(
      "111 rulesets",
      { timeout: 20000 },
    );
    await expect(
      page.getByTestId("graph-canvas").locator("canvas"),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /^Select AppendAttributeForRejectionIfAccepted,/,
      })
      .first()
      .click();
    await expect(page.getByTestId("json-inspector")).toContainText(
      "AppendAttributeForRejectionIfAccepted",
    );
    await expect(page.locator(".code-line").nth(1)).toBeInViewport();
    await page.getByRole("button", { name: "Fit graph to view" }).click();
    await page.screenshot({
      path: "/private/tmp/fluentgraph-graph.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    const after = await Promise.all(
      ["workflowFiles.json", "clusters.json"].map((f) =>
        readFile(join(directory!, "data", f), "utf8"),
      ),
    );
    expect(after).toEqual(originals);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
