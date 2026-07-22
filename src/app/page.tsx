import { redirect } from "next/navigation";
import { getSundayWeekStart } from "@/lib/dates";
import { getCurrentUser } from "@/server/session";
import { ScheduleDashboard } from "@/components/ScheduleDashboard";

export default function HomePage() {
  const user = getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <ScheduleDashboard currentUser={user} initialWeekStart={getSundayWeekStart()} />;
}
