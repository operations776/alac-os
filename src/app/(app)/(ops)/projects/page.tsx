/**
 * The old projects list, now a redirect.
 *
 * Projects live inside the Company Board rather than beside it: a project
 * groups tasks that already exist there, and two places to manage the same
 * work is how the two fall out of step. Redirecting rather than deleting
 * keeps existing bookmarks and internal links working.
 *
 * /projects/[id] still resolves, the detail view is where a project is
 * actually worked, and the board links straight to it.
 */
import { redirect } from 'next/navigation'

export default function ProjectsPage() {
  redirect('/board?view=project')
}
