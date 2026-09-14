import { Topbar } from "@/components/ops/layout/topbar";
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
