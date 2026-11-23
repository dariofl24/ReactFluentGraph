import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("workflow management, generation, graph inspection, direct routes and failure recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dir = await mkdtemp(join(tmpdir(), "fluentgraph-source-"));
  try {
    const path = join(dir, "orders.json");
    await writeFile(
      path,
      JSON.stringify({
        rulesets: [
          {
            name: "Start",
            type: "ORDER",
            rules: [{ props: { event: "Finish" } }],
          },
          { name: "Finish", type: "FULFILMENT", rules: [] },
        ],
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your workflows, connected." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add workflow", exact: true })
      .first()
      .click();
    await page.getByLabel("Workflow name").fill("Order lifecycle");
    await page.getByLabel("Absolute JSON path").fill(path);
    await page.getByRole("button", { name: "Save workflow" }).click();
    await expect(
      page.getByRole("cell", { name: /^Order lifecycle / }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add workflow", exact: true })
      .first()
      .click();
    await page.getByRole("tab", { name: "Upload JSON" }).click();
    await page.getByLabel("Workflow name").fill("Uploaded returns");
    await page.getByLabel("JSON file").setInputFiles({
      name: "returns.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          rulesets: [{ name: "Return", type: "RETURN_ORDER", rules: [] }],
        }),
      ),
    });
    await page.getByRole("button", { name: "Save workflow" }).click();
    await expect(
      page.getByRole("cell", { name: /^Uploaded returns / }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Generate clusters" }).click();
    await expect(
      page.getByRole("link", { name: /Explore Cluster 1/ }),
    ).toBeVisible();
    const overview = page;
    const sidebarPopup = page.waitForEvent("popup", { timeout: 4000 });
    await page.getByRole("link", { name: "Graph explorer" }).click();
    const sidebarTab = await sidebarPopup;
    await expect(
      sidebarTab.getByRole("heading", { name: "Cluster 1", exact: true }),
    ).toBeVisible();
    await sidebarTab.close();
    const clusterPopup = page.waitForEvent("popup", { timeout: 4000 });
    await page.getByRole("link", { name: /Explore Cluster 1/ }).click();
    page = await clusterPopup;
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(overview).toHaveURL("http://127.0.0.1:3002/");
    await expect(
      overview.getByRole("heading", { name: "Your workflows, connected." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cluster 1", exact: true }),
    ).toBeVisible();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const graphArea = await page.locator(".explorer-panels").boundingBox();
    expect(graphArea!.y).toBeLessThanOrEqual(76);
    expect(graphArea!.height).toBeGreaterThanOrEqual(viewportHeight - 90);
    expect(graphArea!.y + graphArea!.height).toBeLessThanOrEqual(
      viewportHeight,
    );
    await expect(page.locator(".app-sidebar")).not.toBeVisible();
    await expect(page.locator(".ruleset-panel")).toBeVisible();
    const listBounds = await page.locator(".ruleset-panel").boundingBox();
    const jsonBounds = await page.locator(".inspector-panel").boundingBox();
    const canvasBounds = await page.locator(".graph-panel").boundingBox();
    expect(Math.abs(listBounds!.x - jsonBounds!.x)).toBeLessThanOrEqual(1);
    expect(jsonBounds!.y).toBeGreaterThan(listBounds!.y + listBounds!.height);
    expect(canvasBounds!.x).toBeGreaterThan(listBounds!.x + listBounds!.width);
    expect(canvasBounds!.width).toBeGreaterThan(listBounds!.width);

    await page.getByRole("button", { name: "Show navigation sidebar" }).click();
    await expect(page.locator(".app-sidebar")).toBeVisible();
    await page.getByRole("button", { name: "Hide navigation sidebar" }).click();
    await expect(page.locator(".app-sidebar")).not.toBeVisible();
    await page.setViewportSize({ width: 1100, height: 960 });
    const previousWidth = await page
      .locator(".ruleset-panel")
      .evaluate((el) => el.clientWidth);
    await page.getByRole("separator", { name: "Resize left panel" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() =>
        page.locator(".ruleset-panel").evaluate((el) => el.clientWidth),
      )
      .toBeLessThan(previousWidth);
    const originalListHeight = await page
      .locator(".ruleset-panel")
      .evaluate((el) => el.clientHeight);
    const originalJsonHeight = await page
      .locator(".inspector-panel")
      .evaluate((el) => el.clientHeight);
    await page
      .getByRole("separator", { name: "Resize ruleset and JSON panels" })
      .focus();
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() =>
        page.locator(".ruleset-panel").evaluate((el) => el.clientHeight),
      )
      .toBeLessThan(originalListHeight);
    await expect
      .poll(() =>
        page.locator(".inspector-panel").evaluate((el) => el.clientHeight),
      )
      .toBeGreaterThan(originalJsonHeight);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByLabel("Search rulesets").fill("start");
    await page.getByRole("button", { name: /Select Start/ }).click();
    await expect(page.getByTestId("json-inspector")).toContainText(
      '"event": "Finish"',
    );
    await expect(
      page.getByTestId("graph-canvas").locator("canvas"),
    ).toBeVisible();
    await expect(page.locator(".code-line").nth(1)).toBeInViewport();
    await expect(
      page
        .getByTestId("json-inspector")
        .locator(".json-key")
        .filter({ hasText: '"name"' })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("json-inspector")
        .locator(".json-string")
        .filter({ hasText: '"Start"' }),
    ).toBeVisible();
    const syntaxColors = await page
      .getByTestId("json-inspector")
      .evaluate((el) => ({
        key: getComputedStyle(el.querySelector(".json-key")!).color,
        string: getComputedStyle(el.querySelector(".json-string")!).color,
      }));
    expect(syntaxColors.key).not.toEqual(syntaxColors.string);

    // Measure the actual rendered Fulfilment node, so selection cannot silently reset
    // the camera. Wait for the documented 450ms focus animation and wheel zoom to settle.
    await page.waitForTimeout(500);
    await expect(
      page.locator(".graph-controls").getByRole("button"),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Fit graph to view" }),
    ).toBeVisible();
    await page.getByTestId("graph-canvas").locator("canvas").hover();
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(250);
    const nodeDot = (color: [number, number, number]) =>
      page
        .getByTestId("graph-canvas")
        .locator("canvas")
        .evaluate((canvas, color) => {
          const context = canvas.getContext("2d")!;
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          let minX = Infinity,
            minY = Infinity,
            maxX = -1,
            maxY = -1;
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              if (
                data[i] === color[0] &&
                data[i + 1] === color[1] &&
                data[i + 2] === color[2] &&
                data[i + 3] === 255
              ) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          if (maxX < 0)
            throw new Error("Expected the graph node to be visible.");
          return {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
          };
        }, color);
    const beforeClick = await nodeDot([199, 210, 254]);
    expect(beforeClick.width).toBeGreaterThan(beforeClick.height * 1.5);
    const beforeGreen = await nodeDot([186, 230, 253]);
    const canvas = page.getByTestId("graph-canvas").locator("canvas");
    const dimensions = await canvas.evaluate((el) => ({
      width: el.width,
      height: el.height,
      cssWidth: el.clientWidth,
      cssHeight: el.clientHeight,
    }));
    await canvas.click({
      position: {
        x: (beforeClick.x * dimensions.cssWidth) / dimensions.width,
        y: (beforeClick.y * dimensions.cssHeight) / dimensions.height,
      },
    });
    await expect(page.getByTestId("json-inspector")).toContainText(
      '"name": "Finish"',
    );
    await page.waitForTimeout(550);
    const afterClick = await nodeDot([199, 210, 254]);
    const afterGreen = await nodeDot([186, 230, 253]);
    expect(Math.abs(afterClick.x - beforeClick.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterClick.y - beforeClick.y)).toBeLessThanOrEqual(1);
    // Both node centers must remain fixed: selection styling can change the
    // dot radius, but pan or zoom would change their screen coordinates.
    expect(Math.abs(afterGreen.x - beforeGreen.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterGreen.y - beforeGreen.y)).toBeLessThanOrEqual(1);
    await page.getByLabel("Search rulesets").fill("finish");
    await page.getByRole("button", { name: /Select Finish/ }).click();
    await page.waitForTimeout(500);
    const afterListFocus = await nodeDot([199, 210, 254]);
    expect(
      Math.abs(afterListFocus.x - dimensions.width / 2),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(afterListFocus.y - dimensions.height / 2),
    ).toBeLessThanOrEqual(2);

    const direct = page.url();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Cluster 1", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Overview", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Edit Order lifecycle" }).click();
    await page.getByLabel("Workflow name").fill("Orders updated");
    await page.getByRole("button", { name: "Save workflow" }).click();
    await expect(page.getByText("Results need a refresh")).toBeVisible();
    await writeFile(path, "invalid");
    await page.getByRole("button", { name: "Generate clusters" }).click();
    await expect(page.getByRole("alert")).toContainText("invalid JSON");
    await page.goto(direct);
    await expect(
      page.getByRole("heading", { name: "Cluster 1", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Rulesets panel" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rulesets panel" }).click();
    await expect(page.getByLabel("Search rulesets")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page
      .getByRole("link", { name: "Overview", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Remove Uploaded returns" }).click();
    await page
      .getByRole("button", { name: "Remove workflow", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: /^Uploaded returns / }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Escape during a pending save keeps errors visible and the dialog usable", async ({
  page,
}) => {
  await page.goto("/");
  const started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  await page.route("**/api/workflows", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INVALID_INPUT",
          message: "Save rejected for recovery test.",
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Add workflow", exact: true }).click();
  await page.getByLabel("Workflow name").fill("Pending save");
  await page.getByLabel("Absolute JSON path").fill("/tmp/pending.json");
  await page.getByRole("button", { name: "Save workflow" }).click();
  await started.promise;
  try {
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Add workflow" }),
    ).toBeVisible();
  } finally {
    release.resolve();
  }
  await expect(page.getByRole("alert")).toContainText("Save rejected");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add workflow", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Add workflow" }),
  ).toBeVisible();
});
