import { NextResponse } from "next/server";
import { hashPassword } from "@/server/password";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { handleEmployeeWriteError, parseEmployeeInput } from "@/server/employeeValidation";
import { deleteManagedEmployee, updateManagedEmployee } from "@/server/repositories";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const user = requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const input = parseEmployeeInput(body);
  const password = String(body.password ?? "");
  if (!input || (password.length > 0 && password.length < 8)) {
    return jsonError("יש להזין פרטי משתמש תקינים. סיסמה חדשה חייבת להכיל לפחות 8 תווים.");
  }

  try {
    const employee = await updateManagedEmployee({
      id: context.params.id,
      ...input,
      passwordHash: password ? await hashPassword(password) : null
    });
    return employee
      ? NextResponse.json({ employee })
      : jsonError("העובד לא נמצא.", 404);
  } catch (error) {
    return handleEmployeeWriteError(error);
  }
}

export async function DELETE(_: Request, context: { params: { id: string } }) {
  const user = requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  return (await deleteManagedEmployee(context.params.id))
    ? NextResponse.json({ ok: true })
    : jsonError("העובד לא נמצא.", 404);
}
