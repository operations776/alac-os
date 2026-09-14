/**
 * Drawer payload for one task. Loaded on demand so a board of 100 cards does
 * not ship 100 comment threads.
 */
import { NextResponse } from "next/server";
import { currentPerson } from "@/lib/server/ops/context";
import { getTaskDrawer } from "@/lib/server/ops/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentPerson())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  return NextResponse.json(await getTaskDrawer(id));
}
