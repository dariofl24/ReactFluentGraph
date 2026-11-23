import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  Workflow,
  NodeColorConfiguration,
} from "../packages/shared/src/types.ts";
async function coloredCenter(page: Page, hex: string) {
  const color = [1, 3, 5].map((start) =>
    parseInt(hex.slice(start, start + 2), 16),
  );
  return page
    .getByTestId("graph-canvas")
    .locator("canvas")
    .evaluate((canvas, color) => {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = Infinity,
        minY = Infinity,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            pixels[i] === color[0] &&
            pixels[i + 1] === color[1] &&
            pixels[i + 2] === color[2] &&
            pixels[i + 3] === 255
          ) {
            minX = Math.min(x, minX);
            maxX = Math.max(x, maxX);
            minY = Math.min(y, minY);
            maxY = Math.max(y, maxY);
          }
        }
      return maxX < 0 ? null : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }, color);
}
test("configure existing and custom node types, persist settings, and update an open graph without moving it", async ({
  page,
  request,
}) => {
  test.setTimeout(45000);
  page.setDefaultTimeout(5000);
  const initial = (await (
    await request.get("/api/configuration/node-colors")
  ).json()) as NodeColorConfiguration;
  const workflows = (await (
    await request.get("/api/workflows")
  ).json()) as Workflow[];
  let fixtureId: string | undefined;
  const releaseOld = Promise.withResolvers<void>();
  const oldCompleted = Promise.withResolvers<void>();
  let delayedRead = false;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const w of workflows.filter((w) => w.enabled))
      await request.patch("/api/workflows/" + w.id, {
        data: { enabled: false },
      });
    const added = await request.post("/api/workflows/upload", {
      multipart: {
        name: "Color settings fixture",
        enabled: "true",
        file: {
          name: "colors.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              rulesets: [
                {
                  name: "Order action",
                  type: "ORDER",
                  rules: [{ props: { event: "Custom action" } }],
                },
                { name: "Custom action", type: "LOYALTY_EVENT", rules: [] },
              ],
            }),
          ),
        },
      },
    });
    expect(added.status()).toBe(201);
    fixtureId = (await added.json()).id;
    expect((await request.post("/api/generations")).status()).toBe(201);
    const beforeSnapshot = await (await request.get("/api/clusters")).json();
    await page.goto("/");
    await page
      .getByRole("link", { name: "Configuration", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Node colors", exact: true }),
    ).toBeVisible();
    const popup = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "Graph explorer", exact: true })
      .click();
    const graph = await popup;
    graph.on("pageerror", (e) => errors.push(e.message));
    await expect(
      graph.getByRole("heading", { name: "Cluster 1", exact: true }),
    ).toBeVisible();
    await graph.getByLabel("Search rulesets").fill("Custom action");
    await graph.getByRole("button", { name: /Select Custom action/ }).click();
    await graph.waitForTimeout(500);
    const before = await coloredCenter(graph, initial.fallbackColor);
    expect(before).not.toBeNull();
    const oldRead = Promise.withResolvers<void>();
    await graph.route("**/api/configuration/node-colors", async (route) => {
      if (delayedRead) {
        await route.continue();
        return;
      }
      delayedRead = true;
      const response = await route.fetch();
      oldRead.resolve();
      await releaseOld.promise;
      try {
        await route.fulfill({ response });
      } finally {
        oldCompleted.resolve();
      }
    });
    await graph.evaluate(() => window.dispatchEvent(new Event("focus")));
    await oldRead.promise;
    await page
      .getByLabel("Hex color for ORDER", { exact: true })
      .fill("#111827");
    await page
      .getByLabel("New type name", { exact: true })
      .fill(" loyalty_event ");
    await page
      .getByLabel("New type hex color", { exact: true })
      .fill("#F472B6");
    await page.getByRole("button", { name: "Add type", exact: true }).click();
    await expect(
      page.getByLabel("Hex color for LOYALTY_EVENT", { exact: true }),
    ).toHaveValue("#F472B6");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Node colors saved.", { exact: true }),
    ).toBeVisible();
    await expect.poll(() => coloredCenter(graph, "#F472B6")).not.toBeNull();
    releaseOld.resolve();
    await oldCompleted.promise;
    await graph.waitForTimeout(150);
    const after = await coloredCenter(graph, "#F472B6");
    expect(after).not.toBeNull();
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await expect(
      graph
        .getByRole("button", { name: /Select Custom action/ })
        .locator(".node-dot"),
    ).toHaveCSS("background-color", "rgb(244, 114, 182)");
    await page.reload();
    await expect(
      page.getByLabel("Hex color for ORDER", { exact: true }),
    ).toHaveValue("#111827");
    await expect(
      page.getByLabel("Hex color for LOYALTY_EVENT", { exact: true }),
    ).toHaveValue("#F472B6");
    await page.getByLabel("New type name", { exact: true }).fill("order");
    await page.getByRole("button", { name: "Add type", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("already configured");
    const snapshot = await (await request.get("/api/clusters")).json();
    expect(snapshot.snapshot.id).toBe(beforeSnapshot.snapshot.id);
    expect(snapshot.stale).toBe(false);
    expect(errors).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("link", { name: "Node color configuration", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await graph.close();
  } finally {
    releaseOld.resolve();
    if (delayedRead) await oldCompleted.promise;
    const current = await (
      await request.get("/api/configuration/node-colors")
    ).json();
    await request.put("/api/configuration/node-colors", {
      data: { ...initial, revision: current.revision },
    });
    if (fixtureId) await request.delete("/api/workflows/" + fixtureId);
    for (const w of workflows)
      await request.patch("/api/workflows/" + w.id, {
        data: { enabled: w.enabled },
      });
  }
});
