import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function mockApi(page: import("@playwright/test").Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ready" }),
    });
  });
  await page.route("**/api/verify", async (route) => {
    const body = route.request().postDataJSON() as { token: string };
    const accepted = body.token === "LAB-ACCEPTED";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accepted,
        message: accepted ? "Token aceptado." : "Token rechazado.",
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});

test("flujo inicial accesible y estable en escritorio", async ({ page }, testInfo) => {
  await expect(
    page.getByRole("status", { name: "Servicio conectado" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verificar credencial" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.screenshot({
    path: testInfo.outputPath("portal-desktop-ready.png"),
    fullPage: true,
  });
});

test("aceptación manual no expone el token", async ({ page }, testInfo) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Token SQRID/1").fill("LAB-ACCEPTED");
  await page.getByRole("button", { name: "Verificar" }).click();

  await expect(page.getByRole("heading", { name: "Acceso validado" })).toBeVisible();
  await expect(page.locator("#history-title-empty")).toContainText("1 lectura");
  await expect(page.getByText("LAB-ACCEPTED")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("portal-desktop-accepted.png"),
    fullPage: true,
  });
});

test("rechazo genérico y layout móvil sin desbordamiento", async ({ page }, testInfo) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Token SQRID/1").fill("LAB-REJECTED");
  await page.getByRole("button", { name: "Verificar" }).click();

  await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
  await expect(page.getByText("La credencial fue rechazada.")).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("portal-mobile-rejected.png"),
    fullPage: true,
  });
});
