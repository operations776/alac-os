import { after } from "next/server";
import { Topbar } from "@/components/ops/layout/topbar";
import { opsQuery } from "@/lib/server/db";
import { flushSlack } from "@/lib/server/ops/result";
import {
  getClients, getFunctions, getMe, getNotifications, getPeople, getProjects,
} from "@/lib/server/ops/queries";

/**
 * The team bar on every page, desk and board alike: find, new task, and the
 * notifications. One app means a review request reaches Adrian on Today, not
 * only once he opens the board. Loaded once per navigation by the app layout.
 */
export async function TeamBar() {
  const me = await getMe();
  if (!me) return null;

  // Vercel Hobby runs cron once a day, too slow for "due in the next hour", so
  // page loads run reminders too. After the response, never in its way; the
  // function claims its own ten minute window, so concurrent loads cannot
  // double send. The bell's poll delivers whatever this produces.
  after(async () => {
    try {
      const [row] = await opsQuery<{ sent: number | null }>(
        "select mc.run_reminders_if_due() as sent");
      if (row?.sent) await flushSlack();
    } catch (e) {
      console.error("[reminders] run_reminders_if_due failed:", (e as Error).message);
    }
  });

  const [people, projects, clients, functions, notifications] = await Promise.all([
    getPeople(), getProjects(), getClients(), getFunctions(), getNotifications(25),
  ]);

  return (
    <Topbar
      me={me}
      people={people}
      projects={projects.map((p) => ({ id: p.id, name: p.name, department: p.department }))}
      clients={clients}
      functions={functions}
      notifications={notifications}
    />
  );
}
