/**
 * Visual vocabulary. One definition per concept so every view agrees.
 */
import type {
  ContactStatus, ContentKind, ContentStatus, Department, DraftStatus,
  GtmOutcome, GtmStage, Health,
  NotifyKind, Platform, Priority, ProjectStatus, Recurrence, TaskStatus,
  UserRole, UserState,
} from '@/types/ops'

// --- Priority ----------------------------------------------------------------
// Three levels, not four. "High" has to mean something, so it must be rare.

// Each level carries a turnaround, so "High" is a commitment rather than a
// feeling. New tasks get a due date from it automatically.
export const PRIORITY = {
  high:   { label: 'High',   short: 'High',   turnaround: 'within 24 hours', hours: 24,
            chip: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900',
            dot: 'bg-rose-500', accent: 'border-l-rose-500', rank: 0 },
  normal: { label: 'Normal', short: 'Normal', turnaround: '3–5 days', hours: 120,
            chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            dot: 'bg-slate-400', accent: 'border-l-transparent', rank: 1 },
  low:    { label: 'Low',    short: 'Low',    turnaround: '10 days or when it fits', hours: 240,
            chip: 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400',
            dot: 'bg-slate-300', accent: 'border-l-transparent', rank: 2 },
} satisfies Record<Priority, unknown> as Record<Priority, {
  label: string; short: string; turnaround: string; hours: number
  chip: string; dot: string; accent: string; rank: number
}>

export const PRIORITIES: Priority[] = ['high', 'normal', 'low']

/**
 * Read a priority safely (§15, §45).
 *
 * A row can arrive with priority null, absent, or holding a value from an
 * older schema, from an import, an integration, or a migration in flight.
 * Indexing PRIORITY directly then yields undefined and the card crashes the
 * board on `.chip`.
 *
 * The fallback is deliberately NORMAL. Falling back to HIGH would let bad
 * data promote itself, which is exactly how a board becomes a wall of red
 * that nobody trusts.
 */
export function priorityOf(p: unknown): Priority {
  return (typeof p === 'string' && (PRIORITIES as string[]).includes(p))
    ? (p as Priority)
    : 'normal'
}

/** The display record for any value, malformed input included. */
export const priorityStyle = (p: unknown) => PRIORITY[priorityOf(p)]

// --- Task status -------------------------------------------------------------
// Four columns. Every one answers a different question:
// what's queued, what's moving, what's stuck, what's finished.

// Five stages. Review and Blocked used to be one "Waiting" column, which hid
// the difference between "someone has to look at this" and "we are stuck".
// On a marketing board Review is the QC / approval gate before publishing.
export const STATUS = {
  backlog: {
    label: 'Backlog', hint: 'Captured, not yet committed to',
    chip: 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400',
    dot: 'bg-slate-300', rank: -1,
  },
  todo: {
    label: 'To Do', hint: 'Queued and ready to start',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400', rank: 0,
  },
  doing: {
    label: 'Doing', hint: 'Being worked on right now',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
    dot: 'bg-indigo-500', rank: 1,
  },
  review: {
    label: 'Review', hint: 'Needs eyes, QC, approval, a second opinion',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    dot: 'bg-violet-500', rank: 2,
  },
  blocked: {
    label: 'Blocked', hint: 'Stuck on someone or something outside the team',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    dot: 'bg-amber-500', rank: 3,
  },
  done: {
    label: 'Done', hint: 'Shipped',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dot: 'bg-emerald-500', rank: 4,
  },
} as Record<TaskStatus, { label: string; hint: string; chip: string; dot: string; rank: number }>

// Backlog is off the default board, it is a holding pen, not a work stage.
// Boards that want it opt in via ALL_STATUSES.
export const STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'blocked', 'done']
export const ALL_STATUSES: TaskStatus[] =
  ['backlog', 'todo', 'doing', 'review', 'blocked', 'done']

// --- Project -----------------------------------------------------------------

export const PROJECT_STATUS = {
  active:   { label: 'Active',   chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  on_hold:  { label: 'On Hold',  chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  done:     { label: 'Done',     chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  archived: { label: 'Archived', chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
} as Record<ProjectStatus, { label: string; chip: string }>

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'on_hold', 'done', 'archived']

/** Health is set by hand. With five people you know which projects are sick. */
export const HEALTH = {
  on_track: { label: 'On Track', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900', dot: 'bg-emerald-500', hex: '#10B981' },
  watch:    { label: 'Watch',    chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900',      dot: 'bg-amber-500',   hex: '#F59E0B' },
  at_risk:  { label: 'At Risk',  chip: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900',            dot: 'bg-rose-500',    hex: '#E11D48' },
} as Record<Health, { label: string; chip: string; dot: string; hex: string }>

export const HEALTHS: Health[] = ['on_track', 'watch', 'at_risk']

export const RECURRENCE = {
  daily:     { label: 'Daily' },
  weekly:    { label: 'Weekly' },
  biweekly:  { label: 'Every 2 weeks' },
  monthly:   { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  custom:    { label: 'Custom' },
} as Record<Recurrence, { label: string }>

// --- Departments -------------------------------------------------------------
// The lens the company board filters by. Colors are the one place a department
// is allowed to shout, so a glance at the board reads as a glance at the org.

export const DEPARTMENT = {
  brand: {
    label: 'Brand', short: 'Brand', hex: '#7C3AED',
    chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900',
    dot: 'bg-violet-500', bar: 'bg-violet-500',
  },
  marketing: {
    label: 'Marketing', short: 'Marketing', hex: '#eb6834',
    chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900',
    dot: 'bg-orange-500', bar: 'bg-orange-500',
  },
  operations: {
    label: 'Operations', short: 'Ops', hex: '#0F766E',
    chip: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900',
    dot: 'bg-teal-500', bar: 'bg-teal-500',
  },
  delivery: {
    label: 'Delivery', short: 'Delivery', hex: '#059669',
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900',
    dot: 'bg-emerald-500', bar: 'bg-emerald-500',
  },
  admin: {
    label: 'Admin', short: 'Admin', hex: '#64748B',
    chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    dot: 'bg-slate-400', bar: 'bg-slate-400',
  },
} as Record<Department, {
  label: string; short: string; hex: string; chip: string; dot: string; bar: string
}>

export const DEPARTMENTS: Department[] = [
  'brand', 'marketing', 'operations', 'delivery', 'admin',
]

// --- Content -----------------------------------------------------------------

/**
 * Platforms, with their brand colors. The icons are inline SVG in
 * components/platform-icon.tsx, no icon font, no CDN.
 */
export const PLATFORM = {
  linkedin:   { label: 'LinkedIn',   hex: '#0A66C2', chip: 'bg-[#0A66C2]/10 text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#5CA9F5]' },
  x:          { label: 'X',          hex: '#0F1419', chip: 'bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white' },
  instagram:  { label: 'Instagram',  hex: '#E1306C', chip: 'bg-[#E1306C]/10 text-[#E1306C] dark:bg-[#E1306C]/20 dark:text-[#F585AC]' },
  youtube:    { label: 'YouTube',    hex: '#FF0000', chip: 'bg-[#FF0000]/10 text-[#CC0000] dark:bg-[#FF0000]/20 dark:text-[#FF6B6B]' },
  facebook:   { label: 'Facebook',   hex: '#1877F2', chip: 'bg-[#1877F2]/10 text-[#1877F2] dark:bg-[#1877F2]/20 dark:text-[#6BA8F5]' },
  tiktok:     { label: 'TikTok',     hex: '#010101', chip: 'bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white' },
  newsletter: { label: 'Newsletter', hex: '#475569', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
} as Record<Platform, { label: string; hex: string; chip: string }>

export const PLATFORMS: Platform[] = [
  'linkedin', 'x', 'instagram', 'youtube', 'facebook', 'tiktok', 'newsletter',
]

/** The content pipeline. Idea on the left, published on the right. */
export const CONTENT_STATUS = {
  idea:        { label: 'Ideas',       chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  in_progress: { label: 'In Progress', chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300', dot: 'bg-indigo-500' },
  review:      { label: 'Review',      chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500' },
  ready:       { label: 'Ready',       chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', dot: 'bg-sky-500' },
  published:   { label: 'Published',   chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', dot: 'bg-emerald-500' },
  blocked:     { label: 'Blocked',     chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300', dot: 'bg-rose-500' },
} as Record<ContentStatus, { label: string; chip: string; dot: string }>

// Five working stages, then Blocked. Blocked sits last because it is an
// exception, not a step, but it earns a column so stuck work stays visible.
export const CONTENT_STATUSES: ContentStatus[] = [
  'idea', 'in_progress', 'review', 'ready', 'published', 'blocked',
]
export const ALL_CONTENT_STATUSES: ContentStatus[] = CONTENT_STATUSES

export const CONTENT_KIND = {
  post:       { label: 'Post' },
  short:      { label: 'Short' },
  long:       { label: 'Long-form video' },
  carousel:   { label: 'Carousel' },
  newsletter: { label: 'Newsletter' },
  article:    { label: 'Article' },
} as Record<ContentKind, { label: string }>

export const CONTENT_KINDS: ContentKind[] = [
  'post', 'short', 'long', 'carousel', 'newsletter', 'article',
]

// --- Roles -------------------------------------------------------------------
// Ordered least- to most-privileged so a rank comparison expresses "at least".

export const ROLE = {
  owner:   { label: 'Owner',   rank: 4, hint: 'Full control, including billing and destructive actions.' },
  admin:   { label: 'Admin',   rank: 3, hint: 'Manages people, functions, and integrations.' },
  manager: { label: 'Manager', rank: 2, hint: 'Runs their function and its projects.' },
  member:  { label: 'Member',  rank: 1, hint: 'Creates and completes work.' },
  viewer:  { label: 'Viewer',  rank: 0, hint: 'Read-only.' },
} as Record<UserRole, { label: string; rank: number; hint: string }>

export const ROLES: UserRole[] = ['owner', 'admin', 'manager', 'member', 'viewer']

export function atLeast(role: UserRole | undefined, min: UserRole): boolean {
  return ROLE[role ?? 'viewer'].rank >= ROLE[min].rank
}

export const USER_STATE = {
  invited:     { label: 'Invited',     chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  active:      { label: 'Active',      chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  suspended:   { label: 'Suspended',   chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  deactivated: { label: 'Deactivated', chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
} as Record<UserState, { label: string; chip: string }>

// --- Notifications -------------------------------------------------------------
// Grouped so the preferences screen reads as choices, not a wall of switches.

export const NOTIFY = {
  task_assigned:         { label: 'Assigned to me',        group: 'My work' },
  task_review_requested: { label: 'Ready for review',      group: 'My work' },
  task_blocked:          { label: 'Something got blocked', group: 'My work' },
  task_started:          { label: 'Someone started my task', group: 'Work I asked for' },
  task_completed:        { label: 'Someone finished my task', group: 'Work I asked for' },
  comment_mention:       { label: 'Mentioned in a comment', group: 'Conversation' },
  comment_reply:         { label: 'New comment',            group: 'Conversation' },
  content_review:        { label: 'Content needs review',   group: 'Content' },
  content_published:     { label: 'Content published',      group: 'Content' },
  gtm_review:            { label: 'GTM needs review',       group: 'GTM' },
  recurring_created:     { label: 'Recurring task created', group: 'Automation' },
  // One kind for every reminder mc.run_reminders() sends. task_due_soon and
  // task_overdue are in the enum but nothing sends them, so they are not offered.
  reminder:              { label: 'Due tasks, GTM next actions, requisitions and content', group: 'Reminders' },
} as Record<NotifyKind, { label: string; group: string }>

export const NOTIFY_GROUPS = [
  'My work', 'Work I asked for', 'Conversation', 'Content', 'GTM', 'Automation', 'Reminders',
]

// --- GTM ---------------------------------------------------------------------------

export const GTM_STAGE = {
  target:           { label: 'Target',        hint: 'Decided, not yet picked up', dot: 'bg-slate-400' },
  researching:      { label: 'Researching',   hint: 'Company, signals, org chart', dot: 'bg-indigo-400' },
  contacts_found:   { label: 'Contacts Found', hint: 'We know who to approach', dot: 'bg-blue-400' },
  pending_review:   { label: 'Pending Review', hint: 'Waiting on your decision', dot: 'bg-amber-400' },
  approved_build:   { label: 'Approved, Build', hint: 'Load into SourceWhale', dot: 'bg-violet-400' },
  pending_outreach: { label: 'Ready to Launch', hint: 'Loaded. Nothing sends until you launch it', dot: 'bg-cyan-400' },
  outreach_active:  { label: 'Outreach Active', hint: 'Working the persona list', dot: 'bg-sky-400' },
  engaged:          { label: 'Engaged',       hint: 'Somebody responded', dot: 'bg-emerald-400' },
  complete:         { label: 'Complete',      hint: 'Closed with an outcome', dot: 'bg-slate-500' },
  hold:             { label: 'Hold',          hint: 'Parked', dot: 'bg-slate-600' },
} as Record<GtmStage, { label: string; hint: string; dot: string }>

/** The board, in order. Hold and Complete are reachable but off the flow. */
export const GTM_STAGES: GtmStage[] = [
  'target', 'researching', 'contacts_found', 'pending_review',
  'approved_build', 'pending_outreach', 'outreach_active',
]

/** Where a contact stands in the sequence (§51). */
export const CONTACT_SW_STATUS: Record<string, { label: string; chip: string }> = {
  research_identified: { label: 'Identified', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  approved_persona:    { label: 'Approved',   chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  loaded:              { label: 'Loaded',     chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  current_persona:     { label: 'In flight',  chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  queued:              { label: 'Queued',     chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  eligible:            { label: 'Ready',      chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  active:              { label: 'Active',     chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  engaged:             { label: 'Responded',  chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  skipped:             { label: 'Skipped',    chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  hold:                { label: 'Held',       chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

/** Copy review states (§61). */
export const COPY_STATUS: Record<string, { label: string; chip: string }> = {
  draft:               { label: 'Draft',        chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  fact_check_required: { label: 'Fact check',   chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  ready_for_review:    { label: 'For review',   chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  rework_requested:    { label: 'Rework',       chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  approved:            { label: 'Approved',     chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
}

/** Why a campaign ended. Required before an account can leave the board. */
export const GTM_OUTCOME = {
  meeting:        { label: 'Meeting / Opportunity', hint: 'Hand to BD', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  nurture:        { label: 'Future interest',       hint: 'Right company, wrong timing', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  not_interested: { label: 'Not interested',        hint: 'An explicit no', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  no_response:    { label: 'No response',           hint: 'Penetration exhausted', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  not_a_fit:      { label: 'Not a fit',             hint: 'Research says no', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
} as Record<GtmOutcome, { label: string; hint: string; chip: string }>

export const GTM_OUTCOMES: GtmOutcome[] =
  ['meeting', 'nurture', 'not_interested', 'no_response', 'not_a_fit']

/** Where one contact stands. A list inside the account, not another board. */
export const CONTACT_STATUS = {
  planned:        { label: 'Planned',      dot: 'bg-slate-300' },
  drafting:       { label: 'Drafting',     dot: 'bg-indigo-400' },
  ready:          { label: 'Ready',        dot: 'bg-blue-500' },
  contacted:      { label: 'Contacted',    dot: 'bg-cyan-500' },
  responded:      { label: 'Responded',    dot: 'bg-emerald-500' },
  no_response:    { label: 'No response',  dot: 'bg-slate-400' },
  not_interested: { label: 'Not interested', dot: 'bg-rose-400' },
} as Record<ContactStatus, { label: string; dot: string }>

export const CONTACT_STATUSES: ContactStatus[] = [
  'planned', 'drafting', 'ready', 'contacted',
  'responded', 'no_response', 'not_interested',
]

export const DRAFT_STATUS = {
  draft:              { label: 'Draft',           chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  ready_for_review:   { label: 'Ready for review', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  approved:           { label: 'Approved',        chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  needs_revision:     { label: 'Needs revision',  chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  ready_for_outbound: { label: 'Ready to send',   chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
} as Record<DraftStatus, { label: string; chip: string }>

/** Founder / CEO / President rank above other leadership. */
export const SENIORITY = [
  { value: 1, label: 'Founder / CEO / President' },
  { value: 2, label: 'Executive leadership' },
  { value: 3, label: 'Functional leader' },
  // A hiring manager is the person with the open role, so they are usually
  // the most useful conversation, but only once you know what they hire for.
  { value: 5, label: 'Hiring manager' },
  { value: 4, label: 'Other' },
]

/** The seniority value that asks what function the person hires for. */
export const HIRING_MANAGER = 5

/** Metrics we know how to display. Platforms report different subsets. */
export const METRICS = [
  { key: 'impressions',        label: 'Impressions' },
  { key: 'reach',              label: 'Reach' },
  { key: 'likes',              label: 'Likes' },
  { key: 'comments',           label: 'Comments' },
  { key: 'shares',             label: 'Shares' },
  { key: 'saves',              label: 'Saves' },
  { key: 'clicks',             label: 'Clicks' },
  { key: 'follows',            label: 'New followers' },
  { key: 'watch_time_seconds', label: 'Watch time', unit: 's' },
  { key: 'completion_rate',    label: 'Completion', unit: '%' },
]

/** How a piece actually goes out. Honest about what is not automatable. */
export const PUBLISH_METHOD = {
  manual:    { label: 'Manual',    hint: 'Posted by hand, required for trending audio on IG/TikTok.' },
  metricool: { label: 'Metricool', hint: 'Scheduled through Metricool.' },
  native:    { label: 'Native',    hint: 'Published directly via the platform API.' },
} as Record<string, { label: string; hint: string }>


// --- Requisition Intelligence (spec §12-31) ----------------------------------

/** A grade is a judgment about the opportunity, not the fee. */
export const REQ_GRADE: Record<string, { label: string; chip: string; meaning: string }> = {
  A: { label: 'A', meaning: 'Deploy aggressively',
       chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  B: { label: 'B', meaning: 'Strong search, deploy',
       chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  C: { label: 'C', meaning: 'Deploy carefully, or calibrate first',
       chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  D: { label: 'D', meaning: 'Fix the problems before sourcing',
       chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  F: { label: 'F', meaning: 'Pause, decline, or renegotiate',
       chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
}

/** How much delivery capacity this search actually needs (§30). */
export const DELIVERY_NEED: Record<string, { label: string; chip: string }> = {
  critical: { label: 'Critical', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  high:     { label: 'High',     chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  moderate: { label: 'Moderate', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  low:      { label: 'Low',      chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  none:     { label: 'None',     chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

/** What to do next. Small taxonomy on purpose (§31). */
export const REQ_ACTION: Record<string, { label: string; hint: string }> = {
  deploy:    { label: 'Deploy',    hint: 'Start the search' },
  source:    { label: 'Source',    hint: 'Needs candidates now' },
  advance:   { label: 'Advance',   hint: 'Move who is already in play' },
  calibrate: { label: 'Calibrate', hint: 'Reset expectations with the client' },
  hold:      { label: 'Hold',      hint: 'Waiting on the client' },
  pause:     { label: 'Pause',     hint: 'Stop work for now' },
  close:     { label: 'Close',     hint: 'Decline or walk away' },
}

export const SEARCH_TYPE: Record<string, string> = {
  retained: 'Retained',
  engaged: 'Engaged',
  exclusive_contingent: 'Exclusive contingent',
  non_exclusive_contingent: 'Non-exclusive contingent',
}

export const COMPETITION: Record<string, string> = {
  alac_only: 'ALAC only',
  internal_plus_alac: 'Internal recruiting + ALAC',
  one_two_agencies: 'ALAC + 1-2 agencies',
  three_plus_agencies: 'ALAC + 3 or more agencies',
  unknown: 'Unknown',
}

export const BEST_STAGE: Record<string, string> = {
  none: 'Nobody submitted',
  submitted: 'Submitted',
  interview: 'Interviewing',
  round_two_plus: 'Round 2+',
  final: 'Final',
  offer: 'Offer out',
}


// --- The next-action engine --------------------------------------------------

/** What each action actually means, in the words a person would use. */
export const ACTION_TYPE: Record<string, { label: string; verb: string }> = {
  research_persona: { label: 'Research decision makers', verb: 'Research' },
  write_first_touch: { label: 'Write first-touch email', verb: 'Write' },
  approve_copy:      { label: 'Approve outreach copy',   verb: 'Approve' },
  launch_outreach:   { label: 'Launch outreach',         verb: 'Launch' },
  follow_up:         { label: 'Follow up',               verb: 'Follow up' },
  progress_persona:  { label: 'Move to next persona',    verb: 'Progress' },
  review_response:   { label: 'Review the response',     verb: 'Review' },
  account_review:    { label: 'Approve this account',    verb: 'Review' },
  stale_check:       { label: 'Nothing scheduled',       verb: 'Check' },
}

/** Urgency, visible without reading (§10). */
export const ACTION_URGENCY: Record<string, { label: string; chip: string; dot: string }> = {
  overdue:  { label: 'Overdue',  dot: 'bg-rose-500',
              chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  today:    { label: 'Due today', dot: 'bg-amber-500',
              chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  upcoming: { label: 'Upcoming', dot: 'bg-sky-500',
              chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  waiting:  { label: 'Waiting',  dot: 'bg-slate-400',
              chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}


// --- Content media (spec §30, §43) -------------------------------------------

/** Private bucket holding uploaded content assets. */
export const MEDIA_BUCKET = 'content-media'

/**
 * Per-file cap.
 *
 * The free tier allows 1GB in total, and one uncompressed .mov would take a
 * fifth of it. Larger raw footage stays on Drive as an external link, which
 * content_assets already supports.
 */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/**
 * Where each function's source material lives.
 *
 * Mission Control runs the work; these hold the material the work draws on, * the ranked account universe, and the brand and content assets. Kept here
 * rather than hard-coded into a page so there is one place to correct when a
 * folder moves.
 */
// The GTM source is the desk itself now, in this app. The two Drive folders are
// the client's own links, so they come from the environment (this repo is
// public); unset, the link simply does not render.
export const SOURCE_LINKS = {
  gtm: {
    href: '/queue',
    label: 'Companies on the desk',
    hint: 'The account queue, signal heat and relationship cadence this board draws from',
  },
  marketing: {
    href: process.env.NEXT_PUBLIC_MARKETING_ASSETS_URL ?? '',
    label: 'Marketing & Content assets',
    hint: 'Brand, creative and content assets in Drive',
  },
  sops: {
    href: process.env.NEXT_PUBLIC_SOP_FOLDER_URL ?? '',
    label: 'SOP folder in Drive',
    hint: 'Every procedure, where they are written and edited',
  },
} as const
