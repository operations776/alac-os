/**
 * The bell's poll. The signed-in person's latest 25 notifications and their
 * full unread count, so a reminder sent after the page loaded still reaches
 * them without a navigation. Own rows only, the queries filter on the session.
 */
import { NextResponse } from "next/server";
import { currentPerson } from "@/lib/server/ops/context";
import { getNotifications, getUnreadNotificationCount } from "@/lib/server/ops/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentPerson())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const [notifications, unread] = await Promise.all([
    getNotifications(25), getUnreadNotificationCount(),
  ]);
  return NextResponse.json({ notifications, unread });
}
