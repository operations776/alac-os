/** Notification preferences, per kind, per channel. */
import { redirect } from 'next/navigation'
import { getMe, getNotificationPreferences } from '@/lib/server/ops/queries'
import { NotificationSettings } from './notifications-client'

export default async function NotificationsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const prefs = await getNotificationPreferences()
  return <NotificationSettings prefs={prefs} />
}
