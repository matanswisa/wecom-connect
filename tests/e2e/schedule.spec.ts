import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password = "Password123!") {
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
}

test("manager sees a complete week and every employee constraint", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "admin", "Wecom123");

  await expect(page.getByRole("heading", { name: "לוח משמרות שבועי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שישי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שבת" })).toBeVisible();
  await expect(page.locator(".availability-row")).toHaveCount(6);
  await expect(page.getByText("מעוניין לעבוד", { exact: true })).toBeVisible();

  await page.getByTitle("התראות").click();
  await expect(page.getByText("אין התראות חדשות.")).toBeVisible();
  await page.getByTitle("עובדים").click();
  await expect(page.getByTitle("עובדים")).toHaveClass(/active/);
  await page.getByLabel("חיפוש עובד").fill("עובד בדיקה");
  await expect(page.locator(".summary-item")).toHaveCount(1);
  await page.getByTitle("נקה חיפוש").click();
  await page.getByTitle("החלפות").click();
  await expect(page.getByTitle("החלפות")).toHaveClass(/active/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא טבלה" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("wecomconnect-schedule-2026-07-19.csv");

  await page.screenshot({ path: "/tmp/wecomconnect-manager.png", fullPage: true });

  const nightRow = page.locator(".shift-row").filter({ hasText: "לילה" });
  const eveningRow = page.locator(".shift-row").filter({ hasText: "ערב" });
  await nightRow.locator(".add-shift").first().click();
  await expect(page.getByText("השיבוץ נשמר.")).toBeVisible();
  try {
    await eveningRow.locator(".add-shift").nth(1).click();
    await expect(page.getByRole("heading", { name: "נדרש אישור חריגה" })).toBeVisible();
    await expect(page.getByText(/אזהרת 8-8/)).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
  } finally {
    await nightRow.locator(".employee-chip button").first().click();
  }
});

test("regular employee can use their availability controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "employee", "Wecom123");

  const ownRow = page.locator(".availability-row").filter({ hasText: "עובד בדיקה" });
  await expect(page.locator(".employee-select-control option")).toHaveCount(1);
  await expect(page.locator(".add-shift")).toHaveCount(0);
  await expect(page.locator(".employee-shift-state")).toHaveCount(21);
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
