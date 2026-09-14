/**
 * Turning a pasted plan into tasks.
 *
 * Planning happens in a chat window and arrives as text. Retyping fifteen
 * tasks into a form is the step where the plan stops being used, so this
 * reads the text instead, but it never saves what it read. Parsing is a
 * guess, and a guess that writes straight to the database creates work
 * nobody agreed to.
 */

export interface ParsedTask {
  title: string
  function_key?: string
  project?: string
  who?: string
  priority?: 'high' | 'normal' | 'low'
  due?: string
  notes?: string
  /** What could not be read, per row, so the fix is local. */
  problems: string[]
}

const FUNCTIONS: Record<string, string> = {
  operations: 'operations', ops: 'operations',
  marketing: 'marketing',
  'business development': 'gtm', bd: 'gtm', gtm: 'gtm',
  delivery: 'delivery', recruiting: 'delivery',
  personal: 'personal',
}

const FIELDS: Record<string, keyof ParsedTask | 'function_key'> = {
  task: 'title', title: 'title',
  function: 'function_key', fn: 'function_key',
  project: 'project',
  who: 'who', owner: 'who', assignee: 'who',
  priority: 'priority',
  due: 'due', 'due date': 'due',
  notes: 'notes', note: 'notes',
}

/** Today, tomorrow and a plain date, the three ways people write a due date. */
function parseDue(raw: string, today = new Date()): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null

  const day = (n: number) =>
    new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10)

  if (s === 'today') return day(0)
  if (s === 'tomorrow') return day(1)
  if (/^next week$/.test(s)) return day(7)
  const inDays = s.match(/^in (\d+) days?$/)
  if (inDays) return day(Number(inDays[1]))

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`

  return null
}

function parsePriority(raw: string): 'high' | 'normal' | 'low' | null {
  const s = raw.trim().toLowerCase()
  if (['high', 'urgent', 'p1'].includes(s)) return 'high'
  if (['normal', 'medium', 'p2'].includes(s)) return 'normal'
  if (['low', 'p3'].includes(s)) return 'low'
  return null
}

/**
 * Split pasted text into tasks.
 *
 * A blank line or a new "Task:" starts the next one, which covers both the
 * numbered lists and the labelled blocks people actually paste. A line with
 * no recognised label is treated as more notes rather than discarded, * losing a line silently is worse than putting it somewhere approximate.
 */
export function parseTasks(input: string, today = new Date()): ParsedTask[] {
  const blocks: string[][] = []
  let current: string[] = []

  for (const raw of input.split('\n')) {
    const line = raw.trim()
    const startsTask = /^(task|title)\s*:/i.test(line)
      || /^\d+[.)]\s+/.test(line)
      || /^[-*]\s+/.test(line)

    if (!line) {
      if (current.length) { blocks.push(current); current = [] }
      continue
    }
    if (startsTask && current.length) { blocks.push(current); current = [] }
    current.push(line)
  }
  if (current.length) blocks.push(current)

  return blocks.map((lines) => readBlock(lines, today)).filter(Boolean) as ParsedTask[]
}

function readBlock(lines: string[], today: Date): ParsedTask | null {
  const t: ParsedTask = { title: '', problems: [] }
  const extraNotes: string[] = []

  for (const line of lines) {
    // "Field: value", but only for fields we know, a colon inside a
    // sentence must not be read as a label.
    const m = line.match(/^([A-Za-z ]{2,12})\s*:\s*(.+)$/)
    const key = m ? FIELDS[m[1].trim().toLowerCase()] : undefined

    if (m && key) {
      const value = m[2].trim()
      if (key === 'title') t.title = value
      else if (key === 'function_key') {
        const f = FUNCTIONS[value.toLowerCase()]
        if (f) t.function_key = f
        else t.problems.push(`"${value}" is not a function`)
      } else if (key === 'priority') {
        const p = parsePriority(value)
        if (p) t.priority = p
        else t.problems.push(`"${value}" is not a priority`)
      } else if (key === 'due') {
        const d = parseDue(value, today)
        if (d) t.due = d
        else t.problems.push(`could not read the date "${value}"`)
      } else if (key === 'project') t.project = value
      else if (key === 'who') t.who = value
      else if (key === 'notes') t.notes = value
      continue
    }

    // A bare first line is the title; anything else joins the notes.
    const bare = line.replace(/^\d+[.)]\s+/, '').replace(/^[-*]\s+/, '')
    if (!t.title) t.title = bare
    else extraNotes.push(bare)
  }

  if (!t.title.trim()) return null
  if (extraNotes.length) {
    t.notes = [t.notes, ...extraNotes].filter(Boolean).join('\n')
  }
  return t
}
