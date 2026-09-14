/** Ideas and improvements, what the team thinks could work better. */
import { requireAdminPage } from "@/lib/server/ops/context";
import { getIdeasBoard, getMyIdeaVotes, getPeople } from "@/lib/server/ops/queries";
import { IdeasClient } from "./ideas-client";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const me = await requireAdminPage();

  const [people, ideas, myVotes] = await Promise.all([
    getPeople(),
    getIdeasBoard(),
    getMyIdeaVotes(me.id),
  ]);

  return <IdeasClient me={me} people={people} ideas={ideas} myVotes={myVotes} />;
}
