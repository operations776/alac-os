'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  Button, Input, Label, Panel, PanelHeader, Select, Textarea,
} from '@/components/ops/ui/primitives'
import { createProject } from '@/lib/server/ops/actions'
import { DEPARTMENT, DEPARTMENTS } from '@/lib/ops/constants'
import { addDays, toDateString } from '@/lib/ops/utils'
import type { Department, Person } from '@/types/ops'

export function NewProjectForm({
  people, me,
}: {
  people: Person[]
  me: Person
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dept, setDept] = useState<Department>('operations')
  const [owner, setOwner] = useState(me.id)
  const [due, setDue] = useState('')
  const [searchRole, setSearchRole] = useState('')

  // A recruiting project gets the delivery tracker; nothing else does.
  const isSearch = dept === 'delivery'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Give it a name'); return }
    setError(null)

    start(async () => {
      const r = await createProject({
        name,
        description: description || null,
        department: dept,
        owner_id: owner,
        due_date: due || null,
        searchRole: isSearch && searchRole ? searchRole : null,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/projects/${r.data!.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <Link href="/projects"
            className="mb-3 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" />
        Projects
      </Link>

      <h1 className="mb-4 text-lg font-semibold tracking-tight">New project</h1>

      <form onSubmit={submit}>
        <Panel>
          <PanelHeader title="Details" />
          <div className="space-y-3 p-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" autoFocus required value={name}
                     onChange={(e) => setName(e.target.value)}
                     placeholder="Company, role being searched" />
            </div>

            <div>
              <Label>What is it?</Label>
              <Textarea rows={2} value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="One or two lines so the team knows what this is." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select className="w-full" value={dept}
                        onChange={(e) => setDept(e.target.value as Department)}>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{DEPARTMENT[d].label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select className="w-full" value={owner}
                        onChange={(e) => setOwner(e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Due</Label>
                <div className="flex gap-1">
                  <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                  <Button type="button" size="sm" variant="subtle"
                          onClick={() => setDue(toDateString(addDays(new Date(), 30)))}>
                    +30d
                  </Button>
                </div>
              </div>
            </div>

            {isSearch && (
              <div className="rounded border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/30">
                <Label>Role being filled (optional)</Label>
                <Input value={searchRole} onChange={(e) => setSearchRole(e.target.value)}
                       placeholder="Director of Business Development" />
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  Adds search delivery tracking, days elapsed against candidates submitted.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-rose-600">{error}</p>}
          </div>
        </Panel>

        <div className="mt-3 flex justify-end gap-2">
          <Link href="/projects">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </div>
  )
}
