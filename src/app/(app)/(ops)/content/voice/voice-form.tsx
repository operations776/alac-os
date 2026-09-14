'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button, Label, Panel, PanelHeader, Textarea } from '@/components/ops/ui/primitives'
import { updateVoice } from '@/lib/server/ops/actions'
import type { VoiceProfile } from '@/types/ops'

const FIELDS = [
  { key: 'tone' as const, label: 'How he writes',
    hint: 'Sentence length, rhythm, register. The mechanics of the voice.',
    rows: 4 },
  { key: 'beliefs' as const, label: 'What he believes',
    hint: 'Opinions that show up again and again. This is what makes a post his.',
    rows: 4 },
  { key: 'audience' as const, label: 'Who he is talking to',
    hint: 'The reader on the other end.', rows: 3 },
  { key: 'avoid' as const, label: 'Never do this',
    hint: 'Words, formats, and habits that make it sound like everyone else.',
    rows: 4 },
  { key: 'samples' as const, label: 'Real writing samples',
    hint: 'Paste posts he actually wrote. This is the strongest signal there is, ' +
          'more useful than any description.',
    rows: 10 },
]

export function VoiceForm({ voice }: { voice: VoiceProfile | null }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({
    tone: voice?.tone ?? '',
    beliefs: voice?.beliefs ?? '',
    audience: voice?.audience ?? '',
    avoid: voice?.avoid ?? '',
    samples: voice?.samples ?? '',
  })

  function save() {
    start(async () => {
      await updateVoice(values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <Link href="/content"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        Content Studio
      </Link>

      <h1 className="text-lg font-semibold tracking-tight">Voice</h1>
      <p className="mb-4 mt-0.5 text-xs text-[var(--text-muted)]">
        Everything here goes into every draft. The more specific it is, the less
        the output sounds like a language model.
      </p>

      <Panel>
        <PanelHeader title="Voice profile" />
        <div className="space-y-4 p-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <p className="mb-1 text-[10px] text-[var(--text-muted)]">{f.hint}</p>
              <Textarea
                rows={f.rows}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className={f.key === 'samples' ? 'text-[11px] leading-relaxed' : undefined}
              />
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={save}>Save voice</Button>
            {saved && <span className="text-[10px] text-emerald-600">Saved</span>}
          </div>
        </div>
      </Panel>
    </div>
  )
}
