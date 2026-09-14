/**
 * Prompt construction for content drafting.
 *
 * Kept out of the route so the exact instructions are reviewable, testable,
 * and editable without touching request handling. The voice profile is the
 * whole point: without it, output reads like a language model wrote it.
 */
import { sender } from "@/config/sender.mjs"
import type { ContentKind, Platform, VoiceProfile } from '@/types/ops'
import { PLATFORM } from './constants'

/** What each platform actually rewards, in one line each. */
const PLATFORM_RULES: Record<Platform, string> = {
  linkedin:
    'Plain paragraphs, 120–200 words. First line has to earn the "see more" click. ' +
    'No hashtag walls, two at most, or none. No one-line-paragraph broetry.',
  x:
    'Under 280 characters, or a 3–5 post thread where each post stands alone. ' +
    'Blunt. No hashtags. No thread emoji.',
  instagram:
    'Caption of 60–120 words with a strong first line. Line breaks are fine here. ' +
    'Up to five relevant hashtags at the end, on their own line.',
  youtube:
    'A spoken script, not prose. Timestamped beats. Written to be read off a ' +
    'screen in one take, so short sentences and no tongue-twisters.',
  facebook:
    'Conversational, 80–150 words. Slightly warmer than LinkedIn. No hashtags.',
  tiktok:
    'A spoken script with a hook in the first 2 seconds. 90–150 words total. ' +
    'On-screen text cues in brackets.',
  newsletter:
    'A short section, 200–350 words, with a subject line. Written to one reader.',
}

const KIND_RULES: Record<ContentKind, string> = {
  post:       'A single post.',
  short:      'A 30–60 second vertical video script. Timestamp every beat. Open with the hook in the first two seconds, no throat-clearing, no "hey guys."',
  long:       'A 5–10 minute video outline: hook, three sections with talking points, and a close.',
  carousel:   'A 6–8 slide carousel. One idea per slide, with a title line and at most two supporting lines.',
  newsletter: 'A newsletter section with a subject line.',
  article:    'A 600–900 word article with a title and subheads.',
}

export interface GenerateRequest {
  title: string
  hook?: string | null
  platform: Platform
  kind: ContentKind
  /** Existing draft, when the ask is to rewrite rather than start fresh. */
  existing?: string | null
  /** Extra steer for this one piece. */
  instruction?: string | null
}

/**
 * Build the prompt. Returns system and user parts separately so the caller can
 * use whichever shape its client expects.
 */
export function buildPrompt(req: GenerateRequest, voice: VoiceProfile | null) {
  const system = [
    `You are drafting social content for ${sender.name}, co-founder of ALAC HR Solutions,`,
    'a recruiting firm for aerospace, defense, and deep tech companies.',
    '',
    'Write in his voice. Not a generic professional voice, his.',
    '',
    voice?.tone     ? `HOW HE WRITES:\n${voice.tone}\n` : '',
    voice?.beliefs  ? `WHAT HE BELIEVES:\n${voice.beliefs}\n` : '',
    voice?.audience ? `WHO HE IS TALKING TO:\n${voice.audience}\n` : '',
    voice?.avoid    ? `NEVER DO THIS:\n${voice.avoid}\n` : '',
    voice?.samples  ? `SAMPLES OF HIS ACTUAL WRITING, match this register:\n${voice.samples}\n` : '',
    'RULES:',
    '- Return only the content. No preamble, no "Here is your post", no options.',
    '- Do not explain your choices.',
    '- If you cannot say something specific, say less rather than padding.',
  ].filter(Boolean).join('\n')

  const user = [
    `PLATFORM: ${PLATFORM[req.platform].label}`,
    `FORMAT: ${KIND_RULES[req.kind]}`,
    `PLATFORM RULES: ${PLATFORM_RULES[req.platform]}`,
    '',
    `TOPIC: ${req.title}`,
    req.hook ? `ANGLE: ${req.hook}` : '',
    req.instruction ? `ALSO: ${req.instruction}` : '',
    req.existing ? `\nREWRITE THIS DRAFT:\n${req.existing}` : '',
  ].filter(Boolean).join('\n')

  return { system, user }
}

/** Scripts go in the script column; everything else is body copy. */
export function isScriptKind(kind: ContentKind): boolean {
  return kind === 'short' || kind === 'long'
}
