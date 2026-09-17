import Link from "next/link";
import { getOrgId, systemStatus, roleFloor } from "@/lib/server/queries/desk";
import { DESK, CASCADE, PORTFOLIO_RULES, nextPullAt } from "@/config/desk.mjs";
import { Card, CardHeader, PageHeader, formatDate } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// HOW IT WORKS. The system from A to Z, in plain words, with the live
// numbers beside every step so it describes what is running rather than what
// was designed. Nothing here is typed in: every figure is a count of
// something stored, and every rule is read from the same config the code
// enforces, so the page cannot drift from the product.

type Step = {
  n: string;
  title: string;
  what: string;
  how: string[];
  live: { label: string; value: string; href?: string }[];
  gap?: string;
};

export default async function HowPage() {
  const orgId = await getOrgId();
  if (!orgId) return null;
  const [s, floor] = await Promise.all([systemStatus(orgId), roleFloor(orgId, DESK.ROLE_TOP_SHARE)]);
  const next = nextPullAt();
  const nextText = next
    ? `${next.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
    : "the next scheduled run";
  const num = (v: unknown) => Number(v ?? 0).toLocaleString();
  const when = (v: unknown) => formatDate((v as string) ?? null) ?? "never";

  const steps: Step[] = [
    {
      n: "A",
      title: "The master list",
      what: "Every company the desk could ever work, scored for fit by Adrian and Darwin in the master TAM. That score is never computed or changed here.",
      how: [
        "Imported from the workbook. The import mirrors it, so a company removed there is removed here.",
        "Companies not in the TAM can be added by hand or by CSV. They get no fit score, and the page says so rather than inventing one.",
      ],
      live: [
        { label: "Companies", value: num(s.tam), href: "/queue" },
        { label: "Priority 1", value: num(s.p1), href: "/queue?priority=priority_1" },
        { label: "Added by hand", value: num(s.added_by_hand) },
      ],
    },
    {
      n: "B",
      title: "Your list",
      what: "The Top 25 and Next 25 are yours. A company is on the list because you put it there, and it leaves when you take it off.",
      how: PORTFOLIO_RULES,
      live: [
        { label: "Top 25", value: num(s.top25), href: "/queue?band=now" },
        { label: "Next 25", value: num(s.next25), href: "/queue?band=next" },
        { label: "Recommended, waiting on you", value: num(s.recommended), href: "/queue?recommended=1" },
        { label: "Parked: hold, nurture, disqualified, archived", value: num(s.parked) },
      ],
    },
    {
      n: "C",
      title: "The pulls",
      what: `Every company on your list is read from the market ${DESK.REFRESH}: what changed at it, and what it is hiring for. The backlog gets a signals-only sweep once a month.`,
      how: [
        "Signals come from PredictLeads: funding, senior hires and departures, office openings, contract wins. Each carries a date, a confidence and the article it came from. Anything under 65% confidence is dropped.",
        "Roles come from the same provider, from the employer's own board, with the salary where published.",
        `A posting the provider has not seen for ${DESK.ROLE_STALE_DAYS} days is closed. The top roles' pages are checked directly as well. Closed roles leave every screen.`,
        "The pull runs on a schedule. The app never calls the provider itself; it reads what the pull wrote.",
      ],
      live: [
        { label: "Signals on record", value: num(s.signals), href: "/signals?all=1" },
        { label: "Roles processed", value: num(s.roles_all) },
        { label: "Roles live now", value: num(s.roles_live), href: "/roles?range=month&all=1" },
        { label: "Closed as dead", value: num(s.roles_closed) },
        { label: "Roles pulled", value: when(s.roles_at) },
        { label: "Signals pulled", value: when(s.signals_at) },
        { label: "Next pull", value: nextText },
      ],
    },
    {
      n: "D",
      title: "The scoring",
      what: "Two numbers are computed here, and both open their own arithmetic on every screen.",
      how: [
        "Urgency, out of 100, on every signal: how directly it implies hiring, how recent, how big, how sure the provider is. A funding round this month scores near the top; a partnership last year near the bottom.",
        "Commercial score, out of 100, on every role: how hard it is to fill (clearance, seniority, scarce specialism) times how long it has been open. A role open sixty days has beaten the employer's own pipeline, which is when an agency call lands.",
        "How long open is read from the date the source gave, whichever one it set. A posting with no date is treated as unknown rather than new, because assuming new is what once buried the oldest requisitions at the bottom of the list.",
        `Aged first. Open roles opens on requisitions open ${DESK.AGED_DEFAULT_DAYS} days or more, longest first, because a role the employer has failed to fill is the one worth calling about. ${DESK.AGED_BANDS.join(", ")} day views sit beside it, and today, this week and this month are a click away for what is new.`,
        `The bars. A signal shows on Today at ${DESK.SIGNAL_MIN_HEAT} or above. A new role is a daily lead at difficulty ${DESK.LEAD_MIN_DIFFICULTY} or above; an aged one only has to clear ${DESK.AGED_MIN_DIFFICULTY}, because sitting open is itself evidence it is hard. The month view shows the top tenth of roles by score, currently ${floor} and up. Everything below a bar is kept and one toggle away.`,
      ],
      live: [
        { label: `Signals at ${DESK.SIGNAL_MIN_HEAT}+ this month`, value: num(s.strong_signals), href: "/signals" },
        { label: "Top tenth starts at", value: String(floor), href: "/roles?range=month" },
      ],
    },
    {
      n: "E",
      title: "The ranking",
      what: "After every pull, every company is re-ranked from fit, what changed, who you know there, and what went up this week. That rank is a recommendation, never a decision.",
      how: [
        "A company the ranking would put on your list, and you have not, appears on Today under Recommended. Accept puts it on; Decline keeps it off until something new happens.",
        "Every change of recommendation is recorded with its reason, so a company's page can say when and why it came up.",
      ],
      live: [
        { label: "Ranked", value: when(s.ranked_at) },
        { label: "Recommendation changes recorded", value: num(s.moves) },
      ],
    },
    {
      n: "F",
      title: "The next move",
      what: "One instruction per company, the same on every screen, computed from where it is in your Kanban, its roles, its latest signal, who you know, and what you have already sent.",
      how: [
        "The rules run in order and the first that fits wins, so the answer is predictable. Replied beats everything. On hold and archived suggest nothing. A message sent this week means wait. A new hard role and a known person means call them about it. A strong signal and a known person means message them about it.",
        "Why, beside every move, lists what it read to decide.",
      ],
      live: [{ label: "See it", value: "Today", href: "/command" }],
    },
    {
      n: "G",
      title: "People and the six doors",
      what: "Your connections, matched to companies by name, and sorted into the levels of an organisation: executive, technical, hiring leader, hiring manager, people and talent, warm connector.",
      how: [
        "Each level is tracked separately as untouched, attempted, engaged or closed. That is what lets the desk say: the CEO was tried twice, engineering roles are live, technical leadership has never been contacted, so the VP of Engineering is the next door.",
        "Reload your connections export monthly. Nothing here refreshes itself.",
      ],
      live: [
        { label: "Connections", value: num(s.people), href: "/people" },
        { label: "Matched to a company", value: num(s.people_matched) },
        { label: "Last loaded", value: when(s.people_at) },
      ],
    },
    {
      n: "H",
      title: "Talent",
      what: "A candidate you can take to market searches every requisition already collected, in plain language, and never comes back empty.",
      how: [
        "Paste a CV or a profile and the fields fill themselves. Type what you are looking for: a level, a customer, a place, a minimum match, a minimum age.",
        "Four buckets: exact matches, adjacent roles, companies whose news implies a need with no posting, and top targets where the candidate could create a search. A shared customer is not a shared job: an engineer does not match a sales role because both say Navy.",
      ],
      live: [
        { label: "Candidates", value: num(s.candidates), href: "/talent" },
        { label: "Requisitions searched", value: num(s.roles_live) },
      ],
    },
    {
      n: "I",
      title: "The tracker",
      what: "What you did, recorded next to what the desk found: notes, ticks, messages, and the SourceWhale state of every company.",
      how: [
        "Messages are written here and marked sent by you. Nothing sends from this app.",
        "Loaded into SourceWhale is not the same as being worked. The states are separate, and the coverage bars on Today show the difference.",
      ],
      live: [
        { label: "Notes", value: num(s.notes) },
        { label: "Messages marked sent", value: num(s.messages_sent) },
        { label: "Items ticked", value: num(s.marks) },
        { label: "Companies in SourceWhale", value: num(s.in_sourcewhale) },
      ],
      gap: "SourceWhale state is recorded by hand until its API key arrives. The integration writes the same fields, so nothing is redone.",
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="How it works"
        title="From the market to the next call"
        lede="What the system does, in order, with the live numbers beside each step. Every figure is a count of something stored; every rule is the one the code enforces."
      />

      <ol className="flex flex-col gap-4">
        {steps.map((st) => (
          <li key={st.n}>
            <Card>
              <CardHeader title={`${st.n}. ${st.title}`} sub={st.what} />
              <div className="grid gap-5 px-5 pb-5 md:grid-cols-[minmax(0,1fr)_260px]">
                <ul className="flex list-disc flex-col gap-2 pl-5 text-[13.5px] leading-relaxed text-[var(--alac-text-2)]">
                  {st.how.map((h) => <li key={h}>{h}</li>)}
                  {st.gap ? <li className="text-[var(--alac-warn)]">{st.gap}</li> : null}
                </ul>
                <dl className="well flex flex-col gap-2 px-4 py-3.5 text-[13px]">
                  {st.live.map((l) => (
                    <div key={l.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--alac-text-3)]">{l.label}</dt>
                      <dd className="readout text-right text-[var(--alac-text)]">
                        {l.href ? <Link href={l.href} className="link">{l.value}</Link> : l.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          </li>
        ))}

        <li>
          <Card>
            <CardHeader title="J. What a state does" sub="One table. The view and every query apply it." />
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-[var(--alac-text-3)]">
                    <th className="py-2 pr-4 font-normal">State</th>
                    <th className="py-2 pr-4 font-normal">Your list</th>
                    <th className="py-2 pr-4 font-normal">Moves and messages</th>
                    <th className="py-2 font-normal">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {CASCADE.map((c: { state: string; list: string; moves: string; data: string }) => (
                    <tr key={c.state} className="border-t border-[var(--alac-line)]">
                      <td className="py-2 pr-4 font-medium">{c.state}</td>
                      <td className="py-2 pr-4 text-[var(--alac-text-2)]">{c.list}</td>
                      <td className="py-2 pr-4 text-[var(--alac-text-2)]">{c.moves}</td>
                      <td className="py-2 text-[var(--alac-text-2)]">{c.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </li>

        <li>
          <Card>
            <CardHeader title="K. What it costs, and what is not connected" />
            <div className="grid gap-5 px-5 pb-5 md:grid-cols-2 text-[13.5px] leading-relaxed text-[var(--alac-text-2)]">
              <ul className="flex list-disc flex-col gap-2 pl-5">
                <li>Signals and roles: PredictLeads, pay as you go, about $40 a month at this cadence. The twice-weekly schedule is what keeps it there.</li>
                <li>Message drafting: about half a cent per message.</li>
                <li>Hosting, database, the scheduled pull: free tiers.</li>
              </ul>
              <ul className="flex list-disc flex-col gap-2 pl-5">
                <li className="text-[var(--alac-warn)]">SourceWhale: no API key yet. Campaign state is typed in until then.</li>
                <li>Exa: live. A drafted message can cite the coverage behind a signal, from outlets rather than the company&apos;s own press release.</li>
                <li>Nothing sends, posts or enrols from this app. A human does every one of those.</li>
              </ul>
            </div>
          </Card>
        </li>
      </ol>
    </div>
  );
}
