/** Calendar, task due dates and real Outlook events, side by side. */
import { redirect } from 'next/navigation'
import {
  getCalendars, getEvents, getMe, getPeople, getProjects, getTasks,
} from '@/lib/server/ops/queries'
import { CalendarClient } from './calendar-client'

export default async function CalendarPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  // A generous window so paging a month either way needs no refetch.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()

  const [tasks, projects, people, calendars, events] = await Promise.all([
    getTasks(), getProjects(), getPeople(), getCalendars(), getEvents(from, to),
  ])

  return (
    <CalendarClient
      me={me}
      tasks={tasks}
      projects={projects}
      people={people}
      calendars={calendars}
      events={events}
    />
  )
}
