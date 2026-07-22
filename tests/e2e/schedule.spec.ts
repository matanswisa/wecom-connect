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
  await expect(page.locator(".availability-row").first()).toBeVisible();
  expect(await page.locator(".availability-row").count()).toBe(
    await page.locator(".summary-item").count()
  );
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

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF / שיתוף" }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("wecomconnect-schedule-2026-07-19.pdf");
  await pdfDownload.saveAs("/tmp/wecomconnect-schedule.pdf");
  await expect(page.getByText("קובץ ה-PDF הורד בהצלחה.")).toBeVisible();

  await page.screenshot({ path: "/tmp/wecomconnect-manager.png", fullPage: true });

  const suffix = Date.now();
  const createResult = await page.evaluate(
    async (payload) => {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return {
        ok: response.ok,
        body: (await response.json()) as { employee?: { id: string }; error?: string }
      };
    },
    {
      name: `עובד אזהרה ${suffix}`,
      email: `warning-${suffix}@wecomconnect.local`,
      roleTitle: "בדיקת 8-8",
      weeklyMinShifts: 1,
      weeklyMaxShifts: 6,
      password: "Temporary123!"
    }
  );
  expect(createResult.ok, createResult.body.error).toBe(true);
  const createdEmployeeId = createResult.body.employee?.id;
  expect(createdEmployeeId).toBeTruthy();
  try {
    await page.reload();
    let assignmentPostCount = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/assignments")) {
        assignmentPostCount += 1;
      }
    });
    const nightRow = page.locator(".shift-row").filter({ hasText: "לילה" });
    const eveningRow = page.locator(".shift-row").filter({ hasText: "ערב" });
    const nightCell = nightRow.locator(".shift-cell").first();
    await nightCell.locator(".add-shift").click();
    const nightPicker = nightCell.locator(".shift-worker-picker");
    await expect(nightPicker.getByRole("button", { name: "שמור" })).toBeDisabled();
    await nightPicker.getByRole("combobox").selectOption(createdEmployeeId!);
    await expect(nightPicker.getByRole("button", { name: "שמור" })).toBeEnabled();
    expect(assignmentPostCount).toBe(0);
    await page.screenshot({ path: "/tmp/wecomconnect-worker-picker.png", fullPage: true });
    await nightPicker.getByRole("button", { name: "שמור" }).click();
    await expect(page.getByText("השיבוץ נשמר.")).toBeVisible();
    expect(assignmentPostCount).toBe(1);
    const eveningCell = eveningRow.locator(".shift-cell").nth(1);
    await eveningCell.locator(".add-shift").click();
    const eveningPicker = eveningCell.locator(".shift-worker-picker");
    await eveningPicker.getByRole("combobox").selectOption(createdEmployeeId!);
    await eveningPicker.getByRole("button", { name: "שמור" }).click();
    await expect(page.getByRole("heading", { name: "נדרש אישור חריגה" })).toBeVisible();
    await expect(page.getByText(/אזהרת 8-8/)).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
  } finally {
    if (createdEmployeeId) {
      await page.evaluate(async (employeeId) => {
        await fetch(`/api/employees/${employeeId}`, { method: "DELETE" });
      }, createdEmployeeId);
    }
  }
});

test("manager can add, edit, constrain, and delete an employee", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "admin", "Wecom123");

  const suffix = Date.now();
  const originalName = `עובד זמני ${suffix}`;
  const updatedName = `עובד מעודכן ${suffix}`;
  let createdEmployeeId = "";

  try {
    await page.getByTitle("הוספת עובד").click();
    const dialog = page.getByRole("dialog", { name: "הוספת עובד" });
    await dialog.getByLabel("שם מלא").fill(originalName);
    await dialog.getByLabel("אימייל").fill(`temporary-${suffix}@wecomconnect.local`);
    await dialog.getByLabel("תפקיד").fill("נוקיסט בדיקה");
    await dialog.getByLabel("מינימום משמרות").fill("2");
    await dialog.getByLabel("מקסימום משמרות").fill("5");
    await dialog.getByLabel("סיסמה").fill("Temporary123!");
    const createResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/employees") && response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "שמירה" }).click();
    const createResponse = await createResponsePromise;
    createdEmployeeId = ((await createResponse.json()) as { employee: { id: string } }).employee.id;
    await expect(page.getByText("העובד נוסף למערכת.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: originalName })).toBeVisible();

    const availabilityRow = page.locator(".availability-row").filter({ hasText: originalName });
    const firstConstraint = availabilityRow.locator("select").first();
    await expect(firstConstraint).toBeEnabled();
    await firstConstraint.selectOption("UNAVAILABLE");
    await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
    await expect(firstConstraint).toHaveValue("UNAVAILABLE");

    await page.getByTitle(`עריכת ${originalName}`).click();
    const editDialog = page.getByRole("dialog", { name: "עריכת עובד" });
    await editDialog.getByLabel("שם מלא").fill(updatedName);
    await editDialog.getByLabel("תפקיד").fill("אחראי לילה");
    await editDialog.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("פרטי העובד עודכנו.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: updatedName })).toBeVisible();

    await page.getByTitle(`מחיקת ${updatedName}`).click();
    await expect(page.getByRole("heading", { name: `מחיקת ${updatedName}` })).toBeVisible();
    await page.getByRole("button", { name: "מחיקת עובד", exact: true }).click();
    await expect(page.getByText("העובד נמחק מהמערכת.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: updatedName })).toHaveCount(0);
    createdEmployeeId = "";
  } finally {
    if (createdEmployeeId) {
      await page.context().request.delete(`/api/employees/${createdEmployeeId}`);
    }
  }
});

test("regular employee can use their availability controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "employee", "Wecom123");

  const ownRow = page.locator(".availability-row").filter({ hasText: "עובד בדיקה" });
  await expect(page.locator(".add-shift")).toHaveCount(0);
  await expect(page.locator(".shift-worker-picker")).toHaveCount(0);
  await expect(page.getByTitle("הוספת עובד")).toHaveCount(0);
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
