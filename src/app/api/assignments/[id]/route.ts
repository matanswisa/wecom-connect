import { NextResponse } from "next/server";
import { isApiError, requireApiUser } from "@/server/api";
import { deleteAssignment } from "@/server/repositories";

export async function DELETE(_: Request, context: { params: { id: string } }) {
  const user = requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  await deleteAssignment(context.params.id);
  return NextResponse.json({ ok: true });
}
