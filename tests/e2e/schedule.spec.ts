import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("Password123!");
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
}

test("manager sees a complete week and every employee constraint", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "manager@wecomconnect.local");

  await expect(page.getByRole("heading", { name: "לוח משמרות שבועי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שישי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שבת" })).toBeVisible();
  await expect(page.locator(".availability-row")).toHaveCount(5);
  await expect(page.getByText("מעוניין לעבוד", { exact: true })).toBeVisible();

  await page.screenshot({ path: "/tmp/wecomconnect-manager.png", fullPage: true });

  const nightRow = page.locator(".shift-row").filter({ hasText: "לילה" });
  const eveningRow = page.locator(".shift-row").filter({ hasText: "ערב" });
  const assignmentResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/assignments") && response.status() === 201
  );
  await nightRow.locator(".add-shift").first().click();
  const assignmentResponse = await assignmentResponsePromise;
  const { assignment } = (await assignmentResponse.json()) as { assignment: { id: string } };
  await expect(page.getByText("השיבוץ נשמר.")).toBeVisible();
  try {
    await eveningRow.locator(".add-shift").nth(1).click();
    await expect(page.getByRole("heading", { name: "נדרש אישור חריגה" })).toBeVisible();
    await expect(page.getByText(/אזהרת 8-8/)).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
  } finally {
    await page.request.delete(`/api/assignments/${assignment.id}`);
  }
});

test("employee can update only their own weekly availability", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "noa@wecomconnect.local");

  const ownRow = page.locator(".availability-row").filter({ hasText: "נועה כהן" });
  const ownSelect = ownRow.locator("select").first();
  await expect(ownSelect).toBeEnabled();
  await ownSelect.selectOption("PREFERRED");
  await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
  await expect(ownSelect).toHaveValue("PREFERRED");

  const otherRow = page.locator(".availability-row").filter({ hasText: "דניאל לוי" });
  await expect(otherRow).toHaveCount(0);
  await page.screenshot({ path: "/tmp/wecomconnect-employee-mobile.png", fullPage: true });

  await ownSelect.selectOption("AVAILABLE");
  await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
});
