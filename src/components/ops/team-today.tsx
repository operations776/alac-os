import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { BoardSection } from "@/components/ui/desk";
import { getMe, getPendingReview, getTasks } from "@/lib/server/ops/queries";
import { isOverdue, isToday } from "@/lib/ops/utils";
import { atLeast } from "@/lib/ops/constants";

/**
 * The team board, on Today. The desk answers who to call; this answers what
 * the company is waiting on him for. Every number is the list it opens: the
 * task filters are My Work's own, applied to the same rows, so the count and
 * the tab cannot disagree.
 */
export async function TeamToday() {
  const me = await getMe();
  if (!me) return null;

  const [tasks, pending] = await Promise.all([
    getTasks({ assigneeId: me.id }),
    atLeast(me.role, "admin") ? getPendingReview() : Promise.resolve([]),
  ]);

  const open = tasks.filter((t) => t.status !== "done");
  const items = [
    { n: open.filter((t) => t.source_kind !== null).length, one: "task waiting on your review", many: "tasks waiting on your review", href: "/my-work?tab=now" },
    { n: open.filter((t) => isOverdue(t.due_date)).length, one: "task overdue", many: "tasks overdue", href: "/my-work?tab=overdue", warn: true },
    { n: open.filter((t) => isToday(t.due_date)).length, one: "task due today", many: "tasks due today", href: "/my-work?tab=now" },
    { n: pending.length, one: "GTM account waiting for your decision", many: "GTM accounts waiting for your decision", href: "/gtm/review" },
  ].filter((i) => i.n > 0);

  return (
    <div className="mb-7">
      <BoardSection title="Your team board" sub="Projects, tasks and approvals from the operating board" href="/ops" hrefLabel="Command center">
        <Card className="px-5 py-3">
          {items.length === 0 ? (
            <p className="text-[13px] text-[var(--alac-text-3)]">
              Nothing waiting on you: no reviews, nothing overdue or due today.{" "}
              <Link href="/my-work" className="link">My work</Link>
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-[var(--alac-text-2)]">
              {items.map((i, idx) => (
                <span key={i.href + i.one}>
                  <Link href={i.href} className={`link ${i.warn ? "text-[var(--alac-warn)]" : ""}`}>
                    {i.n} {i.n === 1 ? i.one : i.many}
                  </Link>
                  {idx < items.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
          )}
        </Card>
      </BoardSection>
    </div>
  );
}
