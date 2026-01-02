import type { PatientProfile } from './types'

/**
 * Normalize text by converting escape sequences to actual characters
 */
export function normalizeText(text: string): string {
  let out = text || ''
  out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < 2; i += 1) {
    const next = out
      .replace(/\\\\r\\\\n/g, '\n')
      .replace(/\\\\n/g, '\n')
      .replace(/\\\\r/g, '\n')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
    if (next === out) break
    out = next
  }
  out = out.replace(/\/n(?=\s|$)/g, '\n')
  out = out.replace(/\\\n/g, '\n')
  out = out.replace(/\\\s*$/gm, '')
  out = out.replace(/\\\*/g, '*')
  out = out.replace(/\\_/g, '_')
  return out
}

/**
 * Normalize markdown formatting (bullets, lists, whitespace)
 */
export function normalizeMarkdown(text: string): string {
  let out = text || ''
  out = out.replace(/^[ \t]*[•*·–—−‒]\s+/gm, '- ')
  out = out.replace(/^[ \t]*-\s+/gm, '- ')
  out = out.replace(/^\s*(\d+)[\).]\s+/gm, (_m, n) => `${n}. `)
  out = out.replace(/[ \t]+$/gm, '')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

/**
 * Strip inline chunk IDs from text (comprehensive version)
 */
export function stripInlineChunkIds(text: string): string {
  let out = text
  // Remove chunk IDs: [uuid_chunk_0], ][uuid_chunk_0], (uuid_chunk_0), etc.
  out = out.replace(/\]?\[?[A-Za-z0-9_-]+_chunk_\d+\]?/g, '')
  // Remove truncated chunk IDs at end of lines: [459 or [abc123 (incomplete)
  out = out.replace(/\s*\[\d+\s*$/gm, '')
  out = out.replace(/\s*\[[A-Za-z0-9_-]+\s*$/gm, '')
  // Remove trailing numeric fragments in brackets: [123] where it looks like chunk remnant
  out = out.replace(/\s*\[\d{1,4}\](?=\s|$|[.,;:])/g, '')
  // Remove malformed bracket sequences like ][ or ][  ]
  out = out.replace(/\]\s*\[/g, '')
  // Clean up leftover semicolons inside parentheses: (; ) or (; ; ) → empty
  out = out.replace(/\(\s*[;\s]+\s*\)/g, '')
  // Clean up leftover semicolons inside brackets: [; ] or [; ; ] → empty
  out = out.replace(/\[\s*[;\s]+\s*\]/g, '')
  // Remove empty parentheses and brackets
  out = out.replace(/\(\s*\)/g, '')
  out = out.replace(/\[\s*\]/g, '')
  // Clean up trailing semicolons before closing paren/bracket
  out = out.replace(/;\s*\)/g, ')')
  out = out.replace(/;\s*\]/g, ']')
  // Clean up leading semicolons after opening paren/bracket
  out = out.replace(/\(\s*;/g, '(')
  out = out.replace(/\[\s*;/g, '[')
  // Remove orphaned brackets at end of sentences
  out = out.replace(/\s*\[\s*\.\s*/g, '. ')
  out = out.replace(/\s*\]\s*\.\s*/g, '. ')
  // Remove orphaned opening brackets at end of lines
  out = out.replace(/\s*\[\s*$/gm, '')
  // Remove orphaned closing brackets at start of lines
  out = out.replace(/^\s*\]\s*/gm, '')
  // Collapse multiple spaces and trailing whitespace
  out = out.replace(/[ \t]{2,}/g, ' ')
  out = out.replace(/\s+\n/g, '\n')
  // Clean up any remaining orphaned brackets
  out = out.replace(/\s+\]/g, '')
  out = out.replace(/\[\s+/g, '')
  return out
}

/**
 * Format patient profile as a display string
 */
export function formatProfile(profile: PatientProfile): string {
  const parts = [
    profile.name && `Name: ${profile.name}`,
    profile.mrn && `MRN: ${profile.mrn}`,
    profile.dob && `DOB: ${profile.dob}`,
    profile.sex && `Sex: ${profile.sex}`,
    profile.gender && `Gender: ${profile.gender}`,
    profile.pronouns && `Pronouns: ${profile.pronouns}`
  ]
  return parts.filter(Boolean).join(' • ')
}

/**
 * Normalize bold labels in text
 */
export function normalizeLabelBold(text: string): string {
  let out = text || ''
  out = out.replace(/^\s*\*\*([^*]+)\*\*\s*:\s*/gm, '$1: ')
  out = out.replace(/^\s*\*\*([^*]+)\*\*\s*$/gm, '$1')
  out = out.replace(/:\s*\*\*\s*/g, ': ')
  out = out.replace(/\s*\*\*\s*$/gm, '')
  return out
}

/**
 * Normalize list block formatting with proper spacing
 */
export function normalizeListBlocks(text: string): string {
  const lines = (text || '').split('\n')
  const out: string[] = []
  let inList = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    const isCalloutLine = /^(open questions?|key highlights|post[- ]interview notes?|updates?)(\s*[:(]|$)/i.test(trimmed)
    const isListLine = /^(-|–|—|−|‒|\d+\.)\s+/.test(trimmed)
    const isIndented = /^\s+/.test(line)
    if (isListLine) {
      inList = true
      out.push(line)
      continue
    }
    if (inList && trimmed && !isListLine && (!isIndented || isCalloutLine)) {
      out.push('')
      inList = false
    }
    if (!trimmed) {
      inList = false
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Clean display text by removing orphaned markdown markers
 */
export function cleanDisplayText(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\s*(\*\*|__|~~)\s*$/.test(line))
    .join('\n')
}

/**
 * Strip markdown formatting from text (for export)
 */
export function stripMarkdown(text: string): string {
  let out = text || ''
  out = out.replace(/^#{1,6}\s+/gm, '')
  out = out.replace(/^\s*>\s?/gm, '')
  out = out.replace(/`([^`]+)`/g, '$1')
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1')
  out = out.replace(/__([^_]+)__/g, '$1')
  out = out.replace(/\*([^*]+)\*/g, '$1')
  out = out.replace(/_([^_]+)_/g, '$1')
  out = out.replace(/^\s*-\s+/gm, '• ')
  out = out.replace(/^\s*[*•]\s+/gm, '• ')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}
