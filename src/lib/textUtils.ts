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
  // Prefer colon separators over em/en dashes in list items for consistent rendering
  out = out
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!/^(-|\d+\.)\s+/.test(trimmed)) return line
      return line.replace(/\s[—–]\s+/g, ': ')
    })
    .join('\n')
  out = out.replace(/[ \t]+$/gm, '')
  out = mergeWrappedListItems(out)
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
  const lines = (text || '').split('\n')
  const out = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line
    const isListLine = /^(-|\d+\.)\s+/.test(trimmed)
    const isTableLine = trimmed.startsWith('|')
    if (isListLine || isTableLine) return line
    const boldOnly = trimmed.match(/^\*\*([^*]+?)\*\*\s*:?\s*$/)
    if (boldOnly) {
      const label = boldOnly[1].replace(/:\s*$/, '').trim()
      if (!label) return line
      return `**${label}:**`
    }
    const plainHeader = trimmed.match(/^([^:]+):\s*$/)
    if (plainHeader) {
      const label = plainHeader[1].trim()
      if (!label) return line
      return `**${label}:**`
    }
    return line
  })
  return out.join('\n')
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

/**
 * Normalize text for consistent LLM output formatting
 * Used before markdown rendering to fix common formatting issues
 */
export function normalizeForRendering(text: string): string {
  let out = text || ''
  
  // 1. Add blank line before any **Label:** pattern that doesn't already have one
  out = out.replace(/([^\n])\n(\*\*[A-Za-z][^*]*:\*\*)/g, '$1\n\n$2')
  
  // 2. Fix cases where **Label:** appears inline after text (no newline at all)
  out = out.replace(/([^\n\*])(\*\*[A-Za-z][A-Za-z0-9\s\-\/]+:\*\*)/g, '$1\n\n$2')
  
  // 3. Add blank line before **Label:** that follows a list item ending
  out = out.replace(/(^- [^\n]+)\n(\*\*[A-Za-z])/gm, '$1\n\n$2')
  
  // 4. Handle cases where there's text immediately followed by **Label: on same line
  out = out.replace(/([a-z])\*\*([A-Z][A-Za-z\s\/\-]+:)\*\*/g, '$1\n\n**$2**')
  
  // 5. Handle cases where badge is followed immediately by header
  out = out.replace(/(\])\*\*([A-Z])/g, '$1\n\n**$2')
  
  // 6. Handle colon followed immediately by bold header
  out = out.replace(/\n([A-Z][A-Za-z\/\-\s]+:)\s*\[/g, '\n\n**$1** [')
  
  // 7. Normalize multiple blank lines to just two
  out = mergeWrappedListItems(out)
  out = out.replace(/\n{3,}/g, '\n\n')
  
  return out
}

const LIST_LINE_RE = /^\s*(?:[-*•]|\d+\.)\s+/

function isCalloutHeaderLine(trimmed: string): boolean {
  return /^(open questions?|key highlights|post[- ]interview notes?|updates?)(\s*[:(]|$)/i.test(trimmed)
}

function isHeaderLikeLine(trimmed: string): boolean {
  if (!trimmed) return false
  if (/^#{1,6}\s+/.test(trimmed)) return true
  if (/^\*\*[^*]+:\*\*\s*$/.test(trimmed)) return true
  if (/^[A-Z][A-Za-z0-9\s\/\-]+:\s*$/.test(trimmed)) return true
  return false
}

function shouldJoinListContinuation(prevLine: string, nextLine: string): boolean {
  const nextTrim = nextLine.trim()
  if (!nextTrim) return false
  if (LIST_LINE_RE.test(nextLine)) return false
  if (isCalloutHeaderLine(nextTrim) || isHeaderLikeLine(nextTrim)) return false

  const prevTrim = prevLine.trimEnd()
  const prevEndsParen = /\($/.test(prevTrim)
  const prevEndsContinuation = /[,:;(\[]$/.test(prevTrim)
  const nextStartsContinuation = /^[a-z0-9("'“\[]/.test(nextTrim) ||
    /^(e\.g\.|i\.e\.|etc\.|and|or|but|with|without|by|for|to|of|in|on|at|as|vs\.?)\b/i.test(nextTrim)
  const nextIsIndented = /^\s+/.test(nextLine)

  if (nextIsIndented || nextStartsContinuation || prevEndsParen) return true
  if (prevEndsContinuation && !/^[A-Z]/.test(nextTrim)) return true
  return false
}

function mergeWrappedListItems(text: string): string {
  const lines = (text || '').split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!LIST_LINE_RE.test(line)) {
      out.push(line)
      continue
    }

    let current = line
    while (i + 1 < lines.length && shouldJoinListContinuation(current, lines[i + 1])) {
      const nextTrim = lines[i + 1].trim()
      current = `${current.trimEnd()} ${nextTrim}`
      i += 1
    }
    out.push(current)
  }

  return out.join('\n')
}

/**
 * Parse markdown-like text into structured blocks for rich export rendering
 * Preserves bold headers, bulleted lists, and proper hierarchy
 */
export interface ExportTextBlock {
  type: 'header' | 'bullet' | 'numbered' | 'paragraph' | 'callout'
  text: string
  badge?: string // [+], [-], [?], [p]
  indent?: number
  calloutKind?: 'open' | 'highlights' | 'post'
  children?: ExportTextBlock[]
}

export function parseTextForExport(text: string): ExportTextBlock[] {
  const normalized = normalizeForRendering(text || '')
  const lines = normalized.split('\n')
  const blocks: ExportTextBlock[] = []
  let currentHeader: ExportTextBlock | null = null
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      currentHeader = null
      continue
    }
    
    // Check for bold header: **Label:** or **Label:** [badge] content
    const headerMatch = trimmed.match(/^\*\*([^*]+):\*\*(.*)$/)
    if (headerMatch) {
      const headerText = headerMatch[1].trim()
      const rest = headerMatch[2].trim()
      
      // Check for badge and content after header
      const badgeMatch = rest.match(/^\[([+\-?p])\]\s*(.*)$/)
      
      const block: ExportTextBlock = {
        type: 'header',
        text: headerText,
        badge: badgeMatch ? badgeMatch[1] : undefined,
        children: []
      }
      
      // If there's content after the badge, add it as a child paragraph
      const contentAfter = badgeMatch ? badgeMatch[2].trim() : rest
      if (contentAfter) {
        block.children!.push({
          type: 'paragraph',
          text: contentAfter
        })
      }
      
      currentHeader = block
      blocks.push(block)
      continue
    }
    
    // Check for callout headers
    const calloutMatch = trimmed.match(/^(Open questions?|Key highlights|Post[- ]interview notes?|Updates?)\s*:?\s*$/i)
    if (calloutMatch) {
      const kind = calloutMatch[1].toLowerCase().startsWith('open') ? 'open'
        : calloutMatch[1].toLowerCase().startsWith('key') ? 'highlights'
        : 'post'
      currentHeader = {
        type: 'callout',
        text: calloutMatch[1],
        calloutKind: kind,
        children: []
      }
      blocks.push(currentHeader)
      continue
    }
    
    // Check for numbered list item
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (numberedMatch) {
      const content = numberedMatch[2]
      // Check for badge at start
      const badgeMatch = content.match(/^\[([+\-?p])\]\s*(.*)$/)
      
      const block: ExportTextBlock = {
        type: 'numbered',
        text: badgeMatch ? badgeMatch[2] : content,
        badge: badgeMatch ? badgeMatch[1] : undefined,
        indent: 0
      }
      
      if (currentHeader && currentHeader.children) {
        currentHeader.children.push(block)
      } else {
        blocks.push(block)
      }
      continue
    }
    
    // Check for bullet item
    const bulletMatch = trimmed.match(/^[-•*]\s+(.*)$/)
    if (bulletMatch) {
      const content = bulletMatch[1]
      // Check for badge at start
      const badgeMatch = content.match(/^\[([+\-?p])\]\s*(.*)$/)
      // Check indent level
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0
      
      const block: ExportTextBlock = {
        type: 'bullet',
        text: badgeMatch ? badgeMatch[2] : content,
        badge: badgeMatch ? badgeMatch[1] : undefined,
        indent: Math.floor(indent / 2)
      }
      
      if (currentHeader && currentHeader.children) {
        currentHeader.children.push(block)
      } else {
        blocks.push(block)
      }
      continue
    }
    
    // Plain paragraph (possibly with badge at start)
    const badgeMatch = trimmed.match(/^\[([+\-?p])\]\s*(.*)$/)
    const block: ExportTextBlock = {
      type: 'paragraph',
      text: badgeMatch ? badgeMatch[2] : trimmed,
      badge: badgeMatch ? badgeMatch[1] : undefined
    }
    
    if (currentHeader && currentHeader.children) {
      currentHeader.children.push(block)
    } else {
      blocks.push(block)
    }
  }
  
  return blocks
}
