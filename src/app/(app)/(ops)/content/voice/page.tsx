/** Voice profile, what makes drafts sound like Adrian. */
import { redirect } from 'next/navigation'
import { getMe, getVoice } from '@/lib/server/ops/queries'
import { VoiceForm } from './voice-form'

export default async function VoicePage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const voice = await getVoice()
  return <VoiceForm voice={voice} />
}
