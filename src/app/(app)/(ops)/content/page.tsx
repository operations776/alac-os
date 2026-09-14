/** Content Studio, the pipeline from idea to published. */
import { redirect } from 'next/navigation'
import { getContent, getMe, getPeople, getPillars, getVoice } from '@/lib/server/ops/queries'
import { ContentClient } from './content-client'

export default async function ContentPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [content, people, voice, pillars] = await Promise.all([
    getContent(), getPeople(), getVoice(), getPillars(),
  ])

  return (
    <ContentClient
      me={me}
      content={content}
      people={people}
      voice={voice}
      pillars={pillars}
    />
  )
}
