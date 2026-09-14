/**
 * Where a work item actually lives.
 *
 * A review task is not a task to administer, it is a decision to make, and
 * the decision happens on the GTM card, not in a drawer showing status,
 * priority and a checklist. Opening the drawer means the reviewer then has to
 * close it, find the company, open it, and scroll to the outreach, which is
 * the work Command Center was supposed to remove.
 *
 * Keyed on ids rather than the title, so a renamed company still resolves and
 * two leads at one company stay distinct.
 */
import type { Task } from '@/types/ops'

export interface WorkLink {
  href: string
  /** What the destination is, for the tooltip. */
  label: string
}

/**
 * The route for a generated work item, or null when it is an ordinary task
 * that belongs in the drawer.
 */
export function workLink(task: Pick<Task, 'source_kind' | 'source_id'>): WorkLink | null {
  if (!task.source_kind || !task.source_id) return null

  switch (task.source_kind) {
    // A GTM review, whether it came from the stage or from copy going out.
    case 'gtm_account':
    case 'gtm_account_stage':
      return {
        href: `/gtm/${task.source_id}?mode=review`,
        label: 'Open the account and review its outreach',
      }

    // Darwin's side of the handoff: build the approved package, or fix what
    // came back. Same destination, different intent.
    case 'gtm_build':
      return {
        href: `/gtm/${task.source_id}?mode=build`,
        label: 'Open the approved package',
      }
    case 'gtm_changes':
      return {
        href: `/gtm/${task.source_id}?mode=changes`,
        label: 'Open the outreach that needs changes',
      }

    case 'content':
      return { href: `/content?piece=${task.source_id}`, label: 'Open the content' }
    case 'content_asset':
      return { href: `/content?asset=${task.source_id}`, label: 'Open the asset' }
    case 'requisition':
      return { href: `/requisitions?req=${task.source_id}`, label: 'Open the requisition' }

    default:
      return null
  }
}
