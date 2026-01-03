import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  LevelFormat
} from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PatientProfile, TemplateSection, Citation, ChatMessage } from './types'
import { stripInlineChunkIds, formatProfile, normalizeForRendering } from './textUtils'
import { markdownToHtml } from './markdownToHtml'

interface CitationIndex {
  map: Map<string, number>
  list: Array<{ id: number; citation: Citation }>
}

// Use standard fonts that are available on all systems
const FONT_SERIF = 'Times New Roman'
const FONT_SANS = 'Arial'
const FONT_MONO = 'Courier New'

// ============================================================================
// SHARED EXPORT CONSTANTS - Matching DOM index.css variables
// ============================================================================

// Colors matching CSS variables from index.css
const EXPORT_COLORS = {
  // Text hierarchy
  ink: '#1A1612',
  text: '#3D352C',
  textSecondary: '#5C5248',
  textTertiary: '#7A7068',
  textMuted: '#A8A090',
  
  // Backgrounds
  canvas: '#FDFAF6',
  paper: '#FAF7F2',
  surface: '#F4F0E8',
  muted: '#EFEBE4',
  
  // Borders
  border: '#E4DFD6',
  borderSubtle: '#EBE7E0',
  
  // Accents - Clinical Maple
  maple: '#C25D35',
  mapleDark: '#9A4628',
  mapleLight: '#E08860',
  mapleBg: '#FBF5F2', // Solid version of rgba(194, 93, 53, 0.06)
  
  // Secondary accents
  forest: '#3D5A47',
  azure: '#4A6FA5',
  
  // Semantic
  success: '#4A7C59',
  error: '#A8423F',
  
  // DSM badge colors
  dsmMet: '#16a34a',
  dsmMetBg: '#dcfce7', // light green bg
  dsmMetBorder: '#86efac',
  dsmNotMet: '#dc2626',
  dsmNotMetBg: '#fee2e2', // light red bg
  dsmNotMetBorder: '#fca5a5',
  dsmUnknown: '#ca8a04',
  dsmUnknownBg: '#fef9c3', // light yellow bg
  dsmUnknownBorder: '#fde047',
  dsmPartial: '#ea580c',
  dsmPartialBg: '#ffedd5', // light orange bg
  dsmPartialBorder: '#fdba74'
} as const

// DOCX hex colors (without #)
const DOCX_COLORS = {
  ink: '1A1612',
  text: '3D352C',
  textSecondary: '5C5248',
  textTertiary: '7A7068',
  textMuted: 'A8A090',
  surface: 'F4F0E8',
  muted: 'EFEBE4',
  border: 'E4DFD6',
  maple: 'C25D35',
  mapleBg: 'FBF5F2',
  forest: '3D5A47',
  forestBg: 'F0F4F1',
  error: 'A8423F',
  dsmMet: '16a34a',
  dsmMetBg: 'dcfce7',
  dsmNotMet: 'dc2626',
  dsmNotMetBg: 'fee2e2',
  dsmUnknown: 'ca8a04',
  dsmUnknownBg: 'fef9c3',
  dsmPartial: 'ea580c',
  dsmPartialBg: 'ffedd5'
} as const

// Callout style configurations matching DOM
const CALLOUT_CONFIG = {
  keyHighlights: {
    accent: DOCX_COLORS.maple,
    fill: DOCX_COLORS.surface,
    titleColor: DOCX_COLORS.textSecondary
  },
  openQuestions: {
    accent: DOCX_COLORS.forest,
    fill: DOCX_COLORS.surface,
    titleColor: DOCX_COLORS.textSecondary
  },
  postInterview: {
    accent: DOCX_COLORS.maple,
    fill: DOCX_COLORS.mapleBg,
    titleColor: DOCX_COLORS.maple
  },
  updates: {
    accent: DOCX_COLORS.maple,
    fill: DOCX_COLORS.mapleBg,
    titleColor: DOCX_COLORS.maple
  }
} as const

// Font sizes in half-points for DOCX (24 = 12pt)
const DOCX_SIZES = {
  title: 32,      // 16pt
  heading: 24,    // 12pt
  body: 22,       // 11pt
  small: 18,      // 9pt
  calloutTitle: 20, // 10pt
  badge: 18       // 9pt
} as const

function formatMarkdownTables(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  const splitRow = (line: string) => line.split('|').map(cell => cell.trim()).filter(Boolean)
  while (i < lines.length) {
    const line = lines[i]
    const next = lines[i + 1] || ''
    const isTable = line.includes('|') && /-+/.test(next) && next.includes('|')
    if (!isTable) {
      out.push(line)
      i += 1
      continue
    }
    const header = splitRow(line)
    if (header.length > 0) {
      out.push(header.join(' | '))
    }
    i += 2
    while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
      const cells = splitRow(lines[i])
      if (cells.length === 2) {
        out.push(`${cells[0]}: ${cells[1]}`)
      } else if (cells.length > 0) {
        out.push(cells.join(' | '))
      }
      i += 1
    }
  }
  return out.join('\n')
}

interface ParsedLine {
  type: 'header' | 'bullet' | 'numbered' | 'paragraph' | 'empty'
  text: string
  badge?: string
  isSubheader?: boolean
  isBold?: boolean
}

function parseLine(line: string): ParsedLine {
  const trimmed = line.trim()
  if (!trimmed) return { type: 'empty', text: '' }
  
  // Check for bold header: **Label:** or **Label:** [badge] content
  const headerMatch = trimmed.match(/^\*\*([^*]+):\*\*(.*)$/)
  if (headerMatch) {
    const headerText = headerMatch[1].trim()
    const rest = headerMatch[2].trim()
    const badgeMatch = rest.match(/^\[([+\-?p])\]\s*(.*)$/)
    const contentAfter = badgeMatch ? badgeMatch[2].trim() : rest
    return {
      type: 'header',
      text: contentAfter ? `${headerText}: ${contentAfter}` : `${headerText}:`,
      badge: badgeMatch ? badgeMatch[1] : undefined,
      isSubheader: true,
      isBold: true
    }
  }
  
  // Check for numbered list item: 1. [+] **Label**: content
  const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
  if (numberedMatch) {
    const content = numberedMatch[2]
    const badgeMatch = content.match(/^\[([+\-?p])\]\s*(.*)$/)
    const itemContent = badgeMatch ? badgeMatch[2] : content
    // Remove any remaining bold markers
    const cleanContent = itemContent.replace(/\*\*([^*]+)\*\*/g, '$1')
    return {
      type: 'numbered',
      text: `${numberedMatch[1]}. ${cleanContent}`,
      badge: badgeMatch ? badgeMatch[1] : undefined
    }
  }
  
  // Check for bullet item: - [badge] content
  const bulletMatch = trimmed.match(/^[-•*]\s+(.*)$/)
  if (bulletMatch) {
    const content = bulletMatch[1]
    const badgeMatch = content.match(/^\[([+\-?p])\]\s*(.*)$/)
    const itemContent = badgeMatch ? badgeMatch[2] : content
    // Remove any remaining bold markers
    const cleanContent = itemContent.replace(/\*\*([^*]+)\*\*/g, '$1')
    return {
      type: 'bullet',
      text: `• ${cleanContent}`,
      badge: badgeMatch ? badgeMatch[1] : undefined
    }
  }
  
  // Check for plain badge at start: [+] content
  const badgeMatch = trimmed.match(/^\[([+\-?p])\]\s*(.*)$/)
  if (badgeMatch) {
    return {
      type: 'paragraph',
      text: badgeMatch[2],
      badge: badgeMatch[1]
    }
  }
  
  // Remove remaining markdown
  let text = trimmed
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/^\s*>\s?/gm, '')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')
  
  return { type: 'paragraph', text }
}

function stripMarkdown(text: string): string {
  let out = text || ''
  out = normalizeForRendering(out)
  out = formatMarkdownTables(out)
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

function normalizePdfText(text: string): string {
  return (text || '')
    .replace(/\u2192/g, '->') // arrows not supported by built-in PDF fonts
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
}

function formatExportText(text: string, options: { forPdf?: boolean } = {}): string {
  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const cleaned = stripInlineChunkIds(normalized)
  const stripped = stripMarkdown(cleaned)
  return options.forPdf ? normalizePdfText(stripped) : stripped
}

type ExportBlock =
  | { type: 'text'; lines: string[] }
  | { type: 'callout'; label: string; kind: 'open' | 'highlights' | 'post'; lines: string[] }

function parseCalloutLabel(line: string): { label: string; kind: 'open' | 'highlights' | 'post'; trailing?: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(Open questions|Key highlights|Post[- ]interview notes?|Update(?:s)?)(\s*\([^)]*\))?\s*:?\s*(.*)$/i)
  if (!match) return null
  const label = `${match[1]}${match[2] || ''}`.trim()
  const tail = (match[3] || '').trim()
  const lower = match[1].toLowerCase()
  const kind: 'open' | 'highlights' | 'post' = lower.startsWith('open')
    ? 'open'
    : lower.startsWith('key')
      ? 'highlights'
      : 'post'
  return { label, kind, trailing: tail || undefined }
}

function buildExportBlocks(text: string, options: { forPdf?: boolean } = {}): ExportBlock[] {
  const normalized = formatExportText(text, options)
  const lines = normalized.split('\n')
  const blocks: ExportBlock[] = []
  let buffer: string[] = []

  const flushText = () => {
    const trimmed = buffer.join('\n').replace(/^\n+|\n+$/g, '')
    if (trimmed) {
      blocks.push({ type: 'text', lines: trimmed.split('\n') })
    }
    buffer = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const label = parseCalloutLabel(line)
    if (!label) {
      buffer.push(line)
      i += 1
      continue
    }
    flushText()
    const body: string[] = []
    if (label.trailing) body.push(label.trailing)
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      if (!next.trim()) {
        i += 1
        break
      }
      if (parseCalloutLabel(next)) break
      body.push(next)
      i += 1
    }
    blocks.push({ type: 'callout', label: label.label, kind: label.kind, lines: body })
  }
  flushText()
  return blocks
}

function splitParagraphs(text: string): string[] {
  return (text || '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
}

type DsmLineType = 'criteria' | 'header' | null

function isDsmCriteriaLine(line: string): boolean {
  const cleaned = line.replace(/^[•*\-–—\d.\s]+/, '').trim()
  if (!cleaned) return false
  if (/^(A[1-9]|B|C|D)(\b|[.:])/i.test(cleaned)) return true
  if (/^(Threshold|Duration|Impairment|Rule[- ]?outs?|Missing)\b/i.test(cleaned)) return true
  return false
}

function isDsmHeaderLine(line: string): boolean {
  const cleaned = line.replace(/^[•*\-–—\d.\s]+/, '').trim()
  if (!cleaned) return false
  if (/\(status\b/i.test(cleaned)) return true
  if (/^(MDD|GAD|PTSD|OCD|ADHD|BPD|SUD|AUD|OUD|BD|BIPOLAR)\b/i.test(cleaned)) return true
  if (/^(Major Depressive Disorder|Generalized Anxiety Disorder|Post[- ]?Traumatic Stress Disorder|Bipolar Disorder|Substance Use Disorder|Alcohol Use Disorder|Opioid Use Disorder|Cannabis Use Disorder|Obsessive[- ]Compulsive Disorder|Attention[- ]Deficit\/Hyperactivity Disorder)\b/i.test(cleaned)) {
    return true
  }
  return false
}

function getDsmLineType(line: string): DsmLineType {
  if (isDsmCriteriaLine(line)) return 'criteria'
  if (isDsmHeaderLine(line)) return 'header'
  return null
}

function buildCitationIndex(sections: TemplateSection[], chat: ChatMessage[] = []): CitationIndex {
  const map = new Map<string, number>()
  const list: Array<{ id: number; citation: Citation }> = []
  let counter = 1
  for (const section of sections) {
    for (const c of section.citations || []) {
      const key = `${c.sourceName}::${c.excerpt}`
      if (!map.has(key)) {
        map.set(key, counter)
        list.push({ id: counter, citation: c })
        counter += 1
      }
    }
  }
  for (const msg of chat) {
    for (const c of msg.citations || []) {
      const key = `${c.sourceName}::${c.excerpt}`
      if (!map.has(key)) {
        map.set(key, counter)
        list.push({ id: counter, citation: c })
        counter += 1
      }
    }
  }
  return { map, list }
}

// formatProfile imported from textUtils

// DSM badge colors for DOCX export (using shared constants)
const DSM_COLORS = {
  met: DOCX_COLORS.dsmMet,
  metBg: DOCX_COLORS.dsmMetBg,
  notMet: DOCX_COLORS.dsmNotMet,
  notMetBg: DOCX_COLORS.dsmNotMetBg,
  unknown: DOCX_COLORS.dsmUnknown,
  unknownBg: DOCX_COLORS.dsmUnknownBg,
  partial: DOCX_COLORS.dsmPartial,
  partialBg: DOCX_COLORS.dsmPartialBg
}


interface LineStyle {
  size?: number
  color?: string
  bold?: boolean
  indentSpaces?: number
}

type LineStyleFn = (line: string) => LineStyle | null

// Helper to create a DSM badge TextRun with proper styling (color + background)
function createDsmBadgeRun(badge: string, size: number, addBreak?: boolean): TextRun {
  const lowerBadge = badge.toLowerCase()
  let textColor: string
  let bgColor: string
  
  if (lowerBadge === '+') {
    textColor = DSM_COLORS.met
    bgColor = DSM_COLORS.metBg
  } else if (lowerBadge === '-') {
    textColor = DSM_COLORS.notMet
    bgColor = DSM_COLORS.notMetBg
  } else if (lowerBadge === '?') {
    textColor = DSM_COLORS.unknown
    bgColor = DSM_COLORS.unknownBg
  } else {
    textColor = DSM_COLORS.partial
    bgColor = DSM_COLORS.partialBg
  }
  
  return new TextRun({
    text: `[${badge}]`,
    size: size,
    color: textColor,
    font: FONT_MONO,
    bold: true,
    shading: {
      type: ShadingType.SOLID,
      color: bgColor,
      fill: bgColor
    },
    break: addBreak ? 1 : undefined
  })
}

function runsFromText(text: string, size: number, color: string, lineStyleFn?: LineStyleFn): TextRun[] {
  // Pre-normalize the text for consistent formatting
  const normalized = normalizeForRendering(text)
  const lines = normalized.split('\n')
  const runs: TextRun[] = []
  
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const parsed = parseLine(line)
    const style = lineStyleFn ? lineStyleFn(line) : null
    const lineSize = style?.size ?? size
    const lineColor = style?.color ?? color
    const lineBold = style?.bold ?? parsed.isBold ?? false
    const indentSpaces = style?.indentSpaces ?? 0
    
    // Skip empty lines but add line break
    if (parsed.type === 'empty') {
      if (idx > 0) {
        runs.push(new TextRun({ text: '', break: 1 }))
      }
      continue
    }
    
    let hasRun = false
    const pushRun = (opts: ConstructorParameters<typeof TextRun>[0]) => {
      const withBreak = !hasRun && idx > 0 ? { ...opts, break: 1 } : opts
      runs.push(new TextRun(withBreak))
      hasRun = true
    }

    if (indentSpaces > 0) {
      pushRun({
        text: ' '.repeat(indentSpaces),
        size: lineSize,
        color: lineColor,
        font: FONT_SANS,
        bold: lineBold,
        preserve: true
      })
    }
    
    // For headers (bold subheaders), render with special formatting
    if (parsed.type === 'header' && parsed.isSubheader) {
      // Add badge first if present - with background highlighting
      if (parsed.badge) {
        const badgeRun = createDsmBadgeRun(parsed.badge, lineSize, !hasRun && idx > 0)
        runs.push(badgeRun)
        hasRun = true
        // Add space after badge
        pushRun({
          text: ' ',
          size: lineSize,
          color: lineColor,
          font: FONT_SANS
        })
      }
      // Add bold header text
      pushRun({
        text: parsed.text,
        size: lineSize,
        color: lineColor,
        font: FONT_SANS,
        bold: true
      })
      continue
    }
    
    // For bullet/numbered items, add the badge first if present - with background
    if ((parsed.type === 'bullet' || parsed.type === 'numbered') && parsed.badge) {
      const badgeRun = createDsmBadgeRun(parsed.badge, lineSize, !hasRun && idx > 0)
      runs.push(badgeRun)
      hasRun = true
      // Add space after badge
      pushRun({
        text: ' ',
        size: lineSize,
        color: lineColor,
        font: FONT_SANS
      })
      // Add the bullet/number and text
      pushRun({
        text: parsed.text,
        size: lineSize,
        color: lineColor,
        font: FONT_SANS,
        bold: lineBold
      })
      continue
    }
    
    // Parse DSM badges [+], [-], [?], [p] and create colored runs
    const dsmPattern = /\[\s*(\+|-|\?|p)\s*\]/gi
    let lastEnd = 0
    let match
    
    while ((match = dsmPattern.exec(line)) !== null) {
      // Add text before the badge
      if (match.index > lastEnd) {
        const beforeText = line.slice(lastEnd, match.index)
        if (beforeText) {
          // Check for bold markers in before text
          const boldPattern = /\*\*([^*]+)\*\*/g
          let boldMatch
          let boldLastEnd = 0
          let hasBoldRun = false
          while ((boldMatch = boldPattern.exec(beforeText)) !== null) {
            // Add non-bold text before
            if (boldMatch.index > boldLastEnd) {
              const normalText = beforeText.slice(boldLastEnd, boldMatch.index)
              if (normalText) {
                pushRun({
                  text: normalText,
                  size: lineSize,
                  color: lineColor,
                  font: FONT_SANS,
                  bold: false
                })
              }
            }
            // Add bold text
            pushRun({
              text: boldMatch[1],
              size: lineSize,
              color: lineColor,
              font: FONT_SANS,
              bold: true
            })
            boldLastEnd = boldMatch.index + boldMatch[0].length
            hasBoldRun = true
          }
          // Add remaining non-bold text
          if (boldLastEnd < beforeText.length) {
            pushRun({
              text: beforeText.slice(boldLastEnd),
              size: lineSize,
              color: lineColor,
              font: FONT_SANS,
              bold: lineBold
            })
          } else if (!hasBoldRun) {
            pushRun({
              text: beforeText,
              size: lineSize,
              color: lineColor,
              font: FONT_SANS,
              bold: lineBold
            })
          }
        }
      }
      
      // Add the badge with color and background highlighting
      const badgeRun = createDsmBadgeRun(match[1], lineSize, !hasRun && idx > 0)
      runs.push(badgeRun)
      hasRun = true
      
      lastEnd = match.index + match[0].length
    }
    
    // Add remaining text after last badge
    if (lastEnd < line.length) {
      const afterText = line.slice(lastEnd)
      if (afterText) {
        // Handle bold in remaining text
        const boldPattern = /\*\*([^*]+)\*\*/g
        let boldMatch
        let boldLastEnd = 0
        let hasBoldRun = false
        while ((boldMatch = boldPattern.exec(afterText)) !== null) {
          if (boldMatch.index > boldLastEnd) {
            const normalText = afterText.slice(boldLastEnd, boldMatch.index)
            if (normalText) {
              pushRun({
                text: normalText,
                size: lineSize,
                color: lineColor,
                font: FONT_SANS,
                bold: false
              })
            }
          }
          pushRun({
            text: boldMatch[1],
            size: lineSize,
            color: lineColor,
            font: FONT_SANS,
            bold: true
          })
          boldLastEnd = boldMatch.index + boldMatch[0].length
          hasBoldRun = true
        }
        if (boldLastEnd < afterText.length) {
          pushRun({
            text: afterText.slice(boldLastEnd),
            size: lineSize,
            color: lineColor,
            font: FONT_SANS,
            bold: lineBold
          })
        } else if (!hasBoldRun) {
          pushRun({
            text: afterText,
            size: lineSize,
            color: lineColor,
            font: FONT_SANS,
            bold: lineBold
          })
        }
      }
    }
    
    // If no runs added, add the whole line
    if (!hasRun) {
      // Handle bold markers in plain line
      const boldPattern = /\*\*([^*]+)\*\*/g
      let boldMatch
      let boldLastEnd = 0
      while ((boldMatch = boldPattern.exec(line)) !== null) {
        if (boldMatch.index > boldLastEnd) {
          pushRun({
            text: line.slice(boldLastEnd, boldMatch.index),
            size: lineSize,
            color: lineColor,
            font: FONT_SANS,
            bold: false
          })
        }
        pushRun({
          text: boldMatch[1],
          size: lineSize,
          color: lineColor,
          font: FONT_SANS,
          bold: true
        })
        boldLastEnd = boldMatch.index + boldMatch[0].length
      }
      if (boldLastEnd < line.length) {
        pushRun({
          text: line.slice(boldLastEnd),
          size: lineSize,
          color: lineColor,
          font: FONT_SANS,
          bold: lineBold
        })
      } else if (boldLastEnd === 0) {
        pushRun({
          text: line,
          size: lineSize,
          color: lineColor,
          font: FONT_SANS,
          bold: lineBold
        })
      }
    }
  }
  
  return runs
}

function buildDocxParagraphsFromText(text: string, size: number, color: string, lineStyleFn?: LineStyleFn): Paragraph[] {
  const lines = (text || '').split('\n')
  const out: Paragraph[] = []

  for (const line of lines) {
    const parsed = parseLine(line)
    const style = lineStyleFn ? lineStyleFn(line) : null
    const lineSize = style?.size ?? size
    const lineColor = style?.color ?? color

    if (parsed.type === 'empty') {
      out.push(new Paragraph({ text: '', spacing: { after: 60 } }))
      continue
    }

    if (parsed.type === 'bullet') {
      const content = line.replace(/^[-•*]\s+/, '')
      // Use en-dash bullet marker instead of default bullet
      const bulletRuns = [
        new TextRun({
          text: '– ',
          size: lineSize,
          color: DOCX_COLORS.textSecondary,
          font: FONT_SANS
        }),
        ...runsFromText(content, lineSize, lineColor, lineStyleFn)
      ]
      out.push(new Paragraph({
        children: bulletRuns,
        indent: { left: 360, hanging: 180 },
        spacing: { after: 80, line: 276 }
      }))
      continue
    }

    if (parsed.type === 'numbered') {
      const content = line.replace(/^\d+\.\s+/, '')
      // Extract the number for manual formatting with maple color
      const numMatch = line.match(/^(\d+)\.\s+/)
      const num = numMatch ? numMatch[1] : '1'
      const numberedRuns = [
        new TextRun({
          text: `${num}. `,
          size: lineSize,
          color: DOCX_COLORS.maple,
          font: FONT_SANS,
          bold: true
        }),
        ...runsFromText(content, lineSize, lineColor, lineStyleFn)
      ]
      out.push(new Paragraph({
        children: numberedRuns,
        indent: { left: 360, hanging: 200 },
        spacing: { after: 100, line: 276 }
      }))
      continue
    }

    out.push(new Paragraph({
      children: runsFromText(line, lineSize, lineColor, lineStyleFn),
      spacing: { after: 180, line: 276 }
    }))
  }

  return out
}

const CALLOUT_STYLES: Record<'open' | 'highlights' | 'post', { accent: string; fill: string; titleColor: string }> = {
  open: { 
    accent: CALLOUT_CONFIG.openQuestions.accent, 
    fill: CALLOUT_CONFIG.openQuestions.fill,
    titleColor: CALLOUT_CONFIG.openQuestions.titleColor
  },
  highlights: { 
    accent: CALLOUT_CONFIG.keyHighlights.accent, 
    fill: CALLOUT_CONFIG.keyHighlights.fill,
    titleColor: CALLOUT_CONFIG.keyHighlights.titleColor
  },
  post: { 
    accent: CALLOUT_CONFIG.postInterview.accent, 
    fill: CALLOUT_CONFIG.postInterview.fill,
    titleColor: CALLOUT_CONFIG.postInterview.titleColor
  }
}

function buildCalloutTable(label: string, kind: 'open' | 'highlights' | 'post', lines: string[]): Table {
  const style = CALLOUT_STYLES[kind]
  
  // Title paragraph with proper styling matching DOM
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ 
        text: label.toUpperCase(), 
        size: DOCX_SIZES.calloutTitle, 
        bold: true, 
        color: style.titleColor, 
        font: FONT_SANS 
      })],
      spacing: { after: 100 }
    })
  ]
  
  // Process each line with proper Answer/Source detection and styling
  for (const line of lines) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: '', spacing: { after: 60 } }))
      continue
    }
    
    const trimmed = line.trim()
    
    // Check for Answer: prefix - styled in error/red color, bold
    const answerMatch = trimmed.match(/^(answer\s*:)\s*(.*)$/i)
    if (answerMatch) {
      const answerRuns: TextRun[] = [
        new TextRun({
          text: 'Answer: ',
          size: DOCX_SIZES.body,
          color: DOCX_COLORS.error,
          bold: true,
          font: FONT_SANS
        }),
        new TextRun({
          text: answerMatch[2],
          size: DOCX_SIZES.body,
          color: DOCX_COLORS.error,
          bold: true,
          font: FONT_SANS
        })
      ]
      children.push(new Paragraph({
        children: answerRuns,
        spacing: { after: 80 }
      }))
      continue
    }
    
    // Check for Source: prefix - styled in muted color, italic
    const sourceMatch = trimmed.match(/^(source\s*:)\s*(.*)$/i)
    if (sourceMatch) {
      const sourceRuns: TextRun[] = [
        new TextRun({
          text: 'Source: ',
          size: DOCX_SIZES.small,
          color: DOCX_COLORS.textMuted,
          italics: true,
          font: FONT_SANS
        }),
        new TextRun({
          text: sourceMatch[2],
          size: DOCX_SIZES.small,
          color: DOCX_COLORS.textMuted,
          italics: true,
          font: FONT_SANS
        })
      ]
      children.push(new Paragraph({
        children: sourceRuns,
        spacing: { after: 60 }
      }))
      continue
    }
    
    // Check for bullet points
    const bulletMatch = trimmed.match(/^[-•]\s*(.*)$/)
    if (bulletMatch) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: bulletMatch[1],
          size: DOCX_SIZES.body,
          color: DOCX_COLORS.ink,
          font: FONT_SANS
        })],
        bullet: { level: 0 },
        indent: { left: 360, hanging: 180 },
        spacing: { after: 60, line: 276 }
      }))
      continue
    }
    
    // Regular line - italic for open questions content
    const isOpenQuestion = kind === 'open'
    children.push(new Paragraph({
      children: [
        new TextRun({
          text: line,
          size: DOCX_SIZES.body,
          color: DOCX_COLORS.ink,
          italics: isOpenQuestion,
          font: FONT_SANS
        })
      ],
      spacing: { after: 60 }
    }))
  }
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            shading: { fill: style.fill, color: style.fill, type: ShadingType.SOLID },
            borders: {
              top: { style: BorderStyle.SINGLE, color: DOCX_COLORS.border, size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: DOCX_COLORS.border, size: 4 },
              left: { style: BorderStyle.SINGLE, color: style.accent, size: 24 }, // Thicker left accent
              right: { style: BorderStyle.SINGLE, color: DOCX_COLORS.border, size: 4 }
            },
            margins: { top: 140, bottom: 140, left: 240, right: 180 }
          })
        ]
      })
    ]
  })
}

export interface ExportOptions {
  excludeClinicianOnly?: boolean
  respectExportable?: boolean
  includeAppendix?: boolean
  includeOpenQuestions?: boolean  // Default false - open questions excluded by default
}

/**
 * Strip open questions block from section output text
 */
function stripOpenQuestionsFromText(text: string): string {
  if (!text) return text
  // Match "Open questions:" header and everything until next section/double newline
  const pattern = /(?:\*\*)?\s*open\s+questions?\s*:?\s*(?:\*\*)?[\s\S]*?(?=\n\n(?:[A-Z]|$)|\n*$)/gi
  let result = text.replace(pattern, '')
  // Clean up any trailing whitespace or multiple newlines
  result = result.replace(/\n{3,}/g, '\n\n').trim()
  return result
}

/**
 * Filter sections based on export options.
 * - hidden sections are always excluded
 * - clinicianOnly sections excluded if excludeClinicianOnly is true
 * - sections with exportable: false are excluded if respectExportable is true
 * - sections with audience: 'clinician-only' treated same as clinicianOnly
 */
function filterSectionsForExport(sections: TemplateSection[], options: ExportOptions = {}): TemplateSection[] {
  return sections.filter(s => {
    if (s.hidden) return false
    
    // Handle clinician-only sections
    const isClinicianOnly = s.clinicianOnly || s.audience === 'clinician-only'
    if (options.excludeClinicianOnly && isClinicianOnly) return false
    
    // Handle non-exportable sections
    if (options.respectExportable && s.exportable === false) return false
    
    return true
  })
}

export async function exportDocx(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = [], options: ExportOptions = {}) {
  const visibleSections = filterSectionsForExport(sections, options)
  const { list } = buildCitationIndex(visibleSections, chat)
  const profileLine = normalizePdfText(formatProfile(profile))

  // Use shared size constants
  const SIZE_TITLE = DOCX_SIZES.title
  const SIZE_HEADING = DOCX_SIZES.heading
  const SIZE_BODY = DOCX_SIZES.body
  const SIZE_SMALL = DOCX_SIZES.small

  // Use shared color constants
  const COLOR_INK = DOCX_COLORS.ink
  const HEADER_COLOR = DOCX_COLORS.ink

  const paragraphs: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({ text: 'PSYCH INTAKE BRIEF', size: SIZE_TITLE, bold: true, font: FONT_SERIF, color: COLOR_INK })
      ],
      spacing: { after: 200 },
      alignment: AlignmentType.LEFT
    })
  ]

  if (profileLine) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: profileLine, color: DOCX_COLORS.text, size: SIZE_BODY, font: FONT_SANS })],
      spacing: { after: 100 }
    }))
  }

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}`, italics: true, color: DOCX_COLORS.textTertiary, size: SIZE_SMALL, font: FONT_SANS })],
    spacing: { after: 300 }
  }))

  for (const section of visibleSections) {
    // Section heading without citation numbers (cleaner look)
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: section.title.toUpperCase(), bold: true, size: SIZE_HEADING, font: FONT_SERIF, color: HEADER_COLOR })
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 140 }
    }))

    // Optionally strip open questions from output (default: strip them)
    const sectionOutput = options.includeOpenQuestions 
      ? (section.output || '') 
      : stripOpenQuestionsFromText(section.output || '')
    
    const blocks = buildExportBlocks(sectionOutput)
    if (blocks.length === 0) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '—', size: SIZE_BODY, color: DOCX_COLORS.textMuted, font: FONT_SANS })],
        spacing: { after: 200 }
      }))
      continue
    }
    for (const block of blocks) {
      // Skip open question callouts if not including them
      if (block.type === 'callout' && block.kind === 'open' && !options.includeOpenQuestions) {
        continue
      }
      if (block.type === 'callout') {
        paragraphs.push(buildCalloutTable(block.label, block.kind, block.lines))
        paragraphs.push(new Paragraph({ text: '', spacing: { after: 180 } }))
        continue
      }
      // Render text block as paragraphs split on double newlines
      const body = block.lines.join('\n')
      const paragraphsText = splitParagraphs(body)
      if (paragraphsText.length === 0) continue
      const dsmContext = section.id === 'dsm5_analysis' || /dsm/i.test(section.title)
      const lineStyleFn: LineStyleFn | undefined = dsmContext
        ? (line: string) => {
            const type = getDsmLineType(line)
            if (type === 'criteria') {
              return { size: SIZE_BODY - 2, color: DOCX_COLORS.text, indentSpaces: 4 }
            }
            if (type === 'header') {
              return { bold: true }
            }
            return null
          }
        : undefined

      for (const paragraphText of paragraphsText) {
        const docxParagraphs = buildDocxParagraphsFromText(paragraphText, SIZE_BODY, COLOR_INK, lineStyleFn)
        for (const paragraph of docxParagraphs) {
          paragraphs.push(paragraph)
        }
      }
    }
  }

  if (chat.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: 'CHAT ADDENDA', bold: true, size: SIZE_HEADING, font: FONT_SERIF, color: HEADER_COLOR })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 140 }
    }))
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const msgText = formatExportText(msg.text)
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: SIZE_BODY, font: FONT_SANS }),
          new TextRun({ text: msgText, size: SIZE_BODY, font: FONT_SANS })
        ],
        spacing: { after: 120 }
      }))
    }
  }

  if (options.includeAppendix && list.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: 'EVIDENCE APPENDIX', bold: true, size: SIZE_HEADING, font: FONT_SERIF, color: HEADER_COLOR })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 140 }
    }))
    for (const item of list) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `[${item.id}] `, bold: true, size: SIZE_SMALL, color: DOCX_COLORS.textTertiary, font: FONT_MONO }),
          new TextRun({ text: `${item.citation.sourceName}: `, bold: true, size: SIZE_BODY, font: FONT_SANS }),
          new TextRun({ text: item.citation.excerpt, size: SIZE_BODY, color: DOCX_COLORS.textSecondary, font: FONT_SANS })
        ],
        spacing: { after: 100 }
      }))
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT_SANS,
            size: SIZE_BODY
          }
        }
      }
    },
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 180 }
                }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: paragraphs
      }
    ]
  })

  const blob = await Packer.toBlob(doc)
  const safeName = (profile.name || 'patient').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `psych-intake-${safeName}-${timestamp}.docx`
  saveAs(blob, filename)
}

export async function exportPdf(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = [], options: ExportOptions = {}) {
  // Native PDF rendering with vector text (no html2canvas bitmap rendering)
  const visibleSections = filterSectionsForExport(sections, options)
  const { list } = buildCitationIndex(visibleSections, chat)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageHeight = doc.internal.pageSize.height
  const pageWidth = doc.internal.pageSize.width
  const margin = 54  // ~0.75 inch margins
  let y = margin

  const colors = {
    ink: [44, 36, 22] as const,
    text: [74, 65, 54] as const,
    muted: [108, 99, 86] as const,
    border: [228, 223, 214] as const,
    surface: [246, 243, 237] as const,
    maple: [184, 92, 56] as const,
    forest: [61, 90, 71] as const,
    mapleTint: [247, 239, 233] as const,
    error: [168, 66, 63] as const,
    source: [168, 160, 144] as const
  }

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  type PdfLineStyle = { size?: number; color?: readonly number[]; bold?: boolean; indent?: number }

  const renderLineWithBadges = (
    line: string,
    x: number,
    yPos: number,
    fontSize: number,
    color: readonly number[],
    bold: boolean
  ) => {
    const badgePattern = /\[\s*(\+|-|\?|p)\s*\]/gi
    const boldPattern = /\*\*([^*]+)\*\*/g
    let xPos = x

    const baseFont = bold ? 'bold' : 'normal'

    // Reset font for accurate measurements
    doc.setFont('helvetica', baseFont)
    doc.setFontSize(fontSize)
    doc.setTextColor(color[0], color[1], color[2])
    
    // First check if this is a bold header line: **Label:** [badge] content
    const headerMatch = line.match(/^\*\*([^*]+):\*\*(.*)$/)
    if (headerMatch) {
      const headerText = headerMatch[1].trim() + ':'
      const rest = headerMatch[2].trim()
      
      // Check for badge in rest
      const badgeMatch = rest.match(/^\[([+\-?p])\]\s*(.*)$/)
      
      if (badgeMatch) {
        // Render badge first
        const badge = badgeMatch[1].toLowerCase()
        const badgeRgb = badge === '+' ? [22, 163, 74]
          : badge === '-' ? [220, 38, 38]
          : badge === '?' ? [202, 138, 4]
          : [234, 88, 12]
        doc.setFont('courier', 'bold')
        doc.setTextColor(badgeRgb[0], badgeRgb[1], badgeRgb[2])
        const badgeText = `[${badgeMatch[1]}] `
        doc.text(badgeText, xPos, yPos)
        xPos += doc.getTextWidth(badgeText)
      }
      
      // Render bold header
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(headerText, xPos, yPos)
      xPos += doc.getTextWidth(headerText)
      
      // Render remaining content
      const contentAfter = badgeMatch ? badgeMatch[2].trim() : rest
      if (contentAfter) {
        doc.setFont('helvetica', 'normal')
        doc.text(' ' + contentAfter, xPos, yPos)
      }
      return
    }

    // Check for bullet with badge: • [+] content or - [+] content
    const bulletMatch = line.match(/^([•\-]\s*)\[([+\-?p])\]\s*(.*)$/)
    if (bulletMatch) {
      // Render bullet
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(bulletMatch[1], xPos, yPos)
      xPos += doc.getTextWidth(bulletMatch[1])
      
      // Render badge
      const badge = bulletMatch[2].toLowerCase()
      const badgeRgb = badge === '+' ? [22, 163, 74]
        : badge === '-' ? [220, 38, 38]
        : badge === '?' ? [202, 138, 4]
        : [234, 88, 12]
      doc.setFont('courier', 'bold')
      doc.setTextColor(badgeRgb[0], badgeRgb[1], badgeRgb[2])
      const badgeText = `[${bulletMatch[2]}] `
      doc.text(badgeText, xPos, yPos)
      xPos += doc.getTextWidth(badgeText)
      
      // Render content (handle bold within)
      const content = bulletMatch[3]
      renderTextWithBold(content, xPos, yPos, fontSize, color)
      return
    }
    
    // Check for numbered list with badge: 1. [+] content
    const numberedMatch = line.match(/^(\d+\.\s*)\[([+\-?p])\]\s*(.*)$/)
    if (numberedMatch) {
      // Render number
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(numberedMatch[1], xPos, yPos)
      xPos += doc.getTextWidth(numberedMatch[1])
      
      // Render badge
      const badge = numberedMatch[2].toLowerCase()
      const badgeRgb = badge === '+' ? [22, 163, 74]
        : badge === '-' ? [220, 38, 38]
        : badge === '?' ? [202, 138, 4]
        : [234, 88, 12]
      doc.setFont('courier', 'bold')
      doc.setTextColor(badgeRgb[0], badgeRgb[1], badgeRgb[2])
      const badgeText = `[${numberedMatch[2]}] `
      doc.text(badgeText, xPos, yPos)
      xPos += doc.getTextWidth(badgeText)
      
      // Render content (handle bold within)
      const content = numberedMatch[3]
      renderTextWithBold(content, xPos, yPos, fontSize, color)
      return
    }

    // Standard line processing with badges
    let lastEnd = 0
    let match
    let hasBadges = false

    while ((match = badgePattern.exec(line)) !== null) {
      hasBadges = true
      // Render text before badge
      if (match.index > lastEnd) {
        const beforeText = line.slice(lastEnd, match.index)
        renderTextWithBold(beforeText, xPos, yPos, fontSize, color)
        doc.setFont('helvetica', baseFont)
        xPos += doc.getTextWidth(beforeText.replace(/\*\*/g, ''))
      }

      // Render badge with color
      const badge = match[1].toLowerCase()
      const badgeRgb = badge === '+' ? [22, 163, 74]
        : badge === '-' ? [220, 38, 38]
        : badge === '?' ? [202, 138, 4]
        : [234, 88, 12]

      doc.setFont('courier', 'bold')
      doc.setFontSize(fontSize)
      doc.setTextColor(badgeRgb[0], badgeRgb[1], badgeRgb[2])
      const badgeText = `[${match[1]}]`
      doc.text(badgeText, xPos, yPos)
      xPos += doc.getTextWidth(badgeText)

      lastEnd = match.index + match[0].length
    }

    // Render remaining text after last badge, or whole line if no badges
    if (hasBadges && lastEnd < line.length) {
      const afterText = line.slice(lastEnd)
      renderTextWithBold(afterText, xPos, yPos, fontSize, color)
    } else if (!hasBadges) {
      renderTextWithBold(line, x, yPos, fontSize, color)
    }
  }
  
  // Helper to render text with inline bold markers
  const renderTextWithBold = (
    text: string,
    startX: number,
    yPos: number,
    fontSize: number,
    color: readonly number[]
  ) => {
    const boldPattern = /\*\*([^*]+)\*\*/g
    let xPos = startX
    let lastEnd = 0
    let match
    
    doc.setFontSize(fontSize)
    
    while ((match = boldPattern.exec(text)) !== null) {
      // Render non-bold text before
      if (match.index > lastEnd) {
        const normalText = text.slice(lastEnd, match.index)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(color[0], color[1], color[2])
        doc.text(normalText, xPos, yPos)
        xPos += doc.getTextWidth(normalText)
      }
      
      // Render bold text
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(match[1], xPos, yPos)
      xPos += doc.getTextWidth(match[1])
      
      lastEnd = match.index + match[0].length
    }
    
    // Render remaining text
    if (lastEnd < text.length) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(text.slice(lastEnd), xPos, yPos)
    } else if (lastEnd === 0) {
      // No bold markers, render whole text
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(text, startX, yPos)
    }
  }

  const renderTextBlock = (
    text: string,
    fontSize: number = 10,
    color: readonly number[] = colors.ink,
    spacing: number = 15,
    lineStyleFn?: (line: string) => PdfLineStyle | null
  ) => {
    const paragraphs = splitParagraphs(text)
    const paragraphGap = 8

    for (let p = 0; p < paragraphs.length; p += 1) {
      const paragraph = paragraphs[p]
      const lines = paragraph.split('\n')

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          ensureSpace(spacing)
          y += spacing
          continue
        }

        const style = lineStyleFn ? lineStyleFn(rawLine) : null
        const lineSize = style?.size ?? fontSize
        const lineColor = style?.color ?? color
        const bold = style?.bold ?? false
        const indent = style?.indent ?? 0
        const lineSpacing = Math.max(12, spacing + (lineSize - fontSize))

        const availableWidth = pageWidth - margin * 2 - indent
        const wrappedLines = doc.splitTextToSize(line, availableWidth)

        for (const wrappedLine of wrappedLines) {
          ensureSpace(lineSpacing)
          renderLineWithBadges(wrappedLine, margin + indent, y, lineSize, lineColor, bold)
          y += lineSpacing
        }
      }

      if (p < paragraphs.length - 1) {
        y += paragraphGap
      }
    }
  }

  const renderCallout = (block: Extract<ExportBlock, { type: 'callout' }>) => {
    const accent = block.kind === 'open' ? colors.forest : colors.maple
    const fill = block.kind === 'post' ? colors.mapleTint : colors.surface
    const paddingX = 10
    const paddingY = 8
    const textWidth = pageWidth - margin * 2 - paddingX * 2
    const titleLine = block.label.toUpperCase()
    const bodyLines: Array<{ text: string; kind: 'answer' | 'source' | 'normal' | 'blank' }> = []
    for (const raw of block.lines) {
      if (!raw.trim()) {
        bodyLines.push({ text: '', kind: 'blank' })
        continue
      }
      const trimmed = raw.trim()
      const kind = /^answer\s*:/i.test(trimmed)
        ? 'answer'
        : /^source\s*:/i.test(trimmed)
          ? 'source'
          : 'normal'
      const wrapped = doc.splitTextToSize(raw, textWidth)
      for (const line of wrapped) {
        bodyLines.push({ text: line, kind })
      }
    }

    const titleHeight = 18
    const headerGap = 8
    const lineHeight = 16
    const blankHeight = 8
    const contentHeight = bodyLines.reduce((sum, line) => sum + (line.text ? lineHeight : blankHeight), 0)
    const boxHeight = paddingY * 2 + titleHeight + headerGap + contentHeight
    ensureSpace(boxHeight)

    const boxWidth = pageWidth - margin * 2
    doc.setFillColor(fill[0], fill[1], fill[2])
    doc.rect(margin, y, boxWidth, boxHeight, 'F')
    doc.setDrawColor(accent[0], accent[1], accent[2])
    doc.setLineWidth(2)
    doc.line(margin, y, margin, y + boxHeight)
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2])
    doc.setLineWidth(0.5)
    doc.rect(margin, y, boxWidth, boxHeight)

    let cursorY = y + paddingY + titleHeight + headerGap
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(titleLine, margin + paddingX, y + paddingY + 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const line of bodyLines) {
      if (!line.text) {
        cursorY += blankHeight
        continue
      }
      if (line.kind === 'answer') {
        doc.setTextColor(colors.error[0], colors.error[1], colors.error[2])
        doc.setFont('helvetica', 'bold')
      } else if (line.kind === 'source') {
        doc.setTextColor(colors.source[0], colors.source[1], colors.source[2])
        doc.setFont('helvetica', 'italic')
      } else {
        doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
        doc.setFont('helvetica', 'normal')
      }
      doc.text(line.text, margin + paddingX, cursorY)
      cursorY += lineHeight
    }
    y += boxHeight + 16
  }

  // Title with underline
  doc.setFont('times', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
  doc.text('PSYCH INTAKE BRIEF', margin, y)
  y += 8
  doc.setDrawColor(colors.maple[0], colors.maple[1], colors.maple[2])
  doc.setLineWidth(1.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

  // Patient profile
  const profileLine = formatProfile(profile)
  if (profileLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(profileLine, margin, y)
    y += 16
  }

  // Generated timestamp
  doc.setFontSize(9)
  doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y)
  y += 24

  // Sections
  for (const section of visibleSections) {
    ensureSpace(48)
    
    // Section heading (no citation numbers for cleaner look)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    doc.text(section.title.toUpperCase(), margin, y)
    y += 22

    // Optionally strip open questions from output (default: strip them)
    const sectionOutput = options.includeOpenQuestions 
      ? (section.output || '') 
      : stripOpenQuestionsFromText(section.output || '')
    
    const blocks = buildExportBlocks(sectionOutput, { forPdf: true })
    if (blocks.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      doc.text('—', margin, y)
      y += 18
      continue
    }
    const dsmContext = section.id === 'dsm5_analysis' || /dsm/i.test(section.title)
    const lineStyleFn = dsmContext
      ? (line: string): PdfLineStyle | null => {
          const type = getDsmLineType(line)
          if (type === 'criteria') {
            return { size: 9, color: colors.text, indent: 20 }
          }
          if (type === 'header') {
            return { bold: true }
          }
          return null
        }
      : undefined

    for (const block of blocks) {
      // Skip open question callouts if not including them
      if (block.type === 'callout' && block.kind === 'open' && !options.includeOpenQuestions) {
        continue
      }
      if (block.type === 'callout') {
        renderCallout(block)
      } else {
        const text = block.lines.join('\n') || '—'
        renderTextBlock(text, 10, colors.ink, 15, lineStyleFn)
        y += 10
      }
    }
  }

  if (chat.length > 0) {
    ensureSpace(48)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    doc.text('CHAT ADDENDA', margin, y)
    y += 20
    
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const cleaned = formatExportText(msg.text, { forPdf: true })
      
      // Label in bold
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
      const labelWidth = doc.getTextWidth(`${label}: `)
      doc.text(`${label}: `, margin, y)
      
      // Message content
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
      const contentWidth = pageWidth - margin * 2 - labelWidth
      const lines = doc.splitTextToSize(cleaned, contentWidth)
      
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          doc.text(lines[i], margin + labelWidth, y)
        } else {
          ensureSpace(14)
          doc.text(lines[i], margin, y)
        }
        y += 14
      }
      y += 8
    }
  }

  if (options.includeAppendix && list.length > 0) {
    ensureSpace(48)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    doc.text('EVIDENCE APPENDIX', margin, y)
    y += 18
    
    doc.setFontSize(9)
    const textWidth = pageWidth - margin * 2
    for (const item of list) {
      // Citation number
      doc.setFont('courier', 'normal')
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      const numStr = `[${item.id}] `
      const numWidth = doc.getTextWidth(numStr)
      doc.text(numStr, margin, y)
      
      // Source name
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
      const sourceStr = `${item.citation.sourceName}: `
      doc.text(sourceStr, margin + numWidth, y)
      const sourceWidth = doc.getTextWidth(sourceStr)
      
      // Excerpt
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      const excerptWidth = textWidth - numWidth - sourceWidth
      const excerptLines = doc.splitTextToSize(item.citation.excerpt, excerptWidth)
      
      for (let i = 0; i < excerptLines.length; i++) {
        if (i === 0) {
          doc.text(excerptLines[i], margin + numWidth + sourceWidth, y)
        } else {
          y += 12
          ensureSpace(12)
          doc.text(excerptLines[i], margin + numWidth, y)
        }
      }
      y += 16
    }
  }

  const safeName = (profile.name || 'patient').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `psych-intake-${safeName}-${timestamp}.pdf`
  doc.save(filename)
}

async function exportPdfFromHtml(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[], options: ExportOptions) {
  const visibleSections = filterSectionsForExport(sections, options)
  const html = buildExportHtml(profile, visibleSections, chat, options)

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.width
  const margin = 54

  ;(window as any).html2canvas = html2canvas

  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = `${pageWidth - margin * 2}px`
  host.style.padding = '0'
  host.style.margin = '0'
  host.style.background = '#ffffff'
  host.style.zIndex = '-1'
  host.innerHTML = html
  document.body.appendChild(host)

  await new Promise<void>(resolve => {
    doc.html(host, {
      x: margin,
      y: margin,
      width: pageWidth - margin * 2,
      windowWidth: host.scrollWidth || pageWidth - margin * 2,
      autoPaging: 'text',
      html2canvas: { scale: 0.9, backgroundColor: '#ffffff' },
      callback: () => resolve()
    })
  })

  document.body.removeChild(host)

  const safeName = (profile.name || 'patient').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `psych-intake-${safeName}-${timestamp}.pdf`
  doc.save(filename)
}

function buildExportHtml(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[], options: ExportOptions): string {
  const { list } = buildCitationIndex(sections, chat)
  const profileLine = normalizePdfText(formatProfile(profile))

  // CSS for PDF export - ALL VALUES INLINED (no CSS variables) for html2canvas compatibility
  // html2canvas does NOT support: CSS variables, ::before/::after pseudo-elements, ::marker
  const css = `
    * { box-sizing: border-box; }
    
    body { 
      margin: 0; 
      padding: 0; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: ${EXPORT_COLORS.ink};
      background: white;
    }
    
    .export-root { 
      color: ${EXPORT_COLORS.ink}; 
      max-width: 100%;
    }
    
    /* Title styling */
    .export-title { 
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 18px; 
      font-weight: 700; 
      letter-spacing: -0.02em;
      margin: 0 0 8px 0; 
      color: ${EXPORT_COLORS.ink};
    }
    
    .export-meta { 
      font-size: 11px; 
      color: ${EXPORT_COLORS.textMuted}; 
      margin: 0 0 16px 0; 
      font-style: italic;
    }
    
    .export-profile { 
      font-size: 12px; 
      color: ${EXPORT_COLORS.text}; 
      margin: 0 0 6px 0; 
    }
    
    /* Section styling */
    .export-section { 
      margin: 14px 0; 
      page-break-inside: avoid;
    }
    
    .export-section-title { 
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 12px; 
      font-weight: 700; 
      letter-spacing: 0.08em; 
      text-transform: uppercase; 
      margin: 0 0 8px 0; 
      color: ${EXPORT_COLORS.ink};
      border-bottom: 1px solid ${EXPORT_COLORS.borderSubtle};
      padding-bottom: 4px;
    }

    /* ============ MARKDOWN BASE ============ */
    .markdown { 
      font-size: 12px; 
      line-height: 1.55; 
      color: ${EXPORT_COLORS.ink}; 
    }
    
    .markdown p { 
      margin: 0 0 0.6em 0; 
    }
    
    .markdown p:last-child { 
      margin-bottom: 0; 
    }
    
    .markdown strong { 
      font-weight: 600; 
      color: ${EXPORT_COLORS.ink}; 
    }
    
    .markdown em { 
      font-style: italic; 
      color: ${EXPORT_COLORS.textSecondary}; 
    }
    
    /* Lists - simple styling that html2canvas supports */
    .markdown ul, .markdown ol { 
      margin: 0.2em 0 0.6em 0; 
      padding-left: 1.5em; 
    }
    
    .markdown li { 
      margin: 0.25em 0; 
    }
    
    .markdown ul { 
      list-style-type: disc;
    }
    
    .markdown ol { 
      list-style-type: decimal; 
    }
    
    .markdown ol > li { 
      margin: 0.5em 0; 
    }
    
    /* Headers */
    .markdown h1, .markdown h2, .markdown h3 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${EXPORT_COLORS.textSecondary};
      margin: 1em 0 0.5em 0;
    }
    
    .markdown h1:first-child, 
    .markdown h2:first-child, 
    .markdown h3:first-child { 
      margin-top: 0; 
    }
    
    /* Blockquotes */
    .markdown blockquote { 
      border-left: 2px solid ${EXPORT_COLORS.border}; 
      padding-left: 0.8em; 
      margin: 0.5em 0;
      color: ${EXPORT_COLORS.textSecondary}; 
    }
    
    /* Tables */
    .markdown table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 11px; 
      margin: 0.5em 0 0.8em; 
    }
    
    .markdown th, .markdown td { 
      border: 1px solid ${EXPORT_COLORS.border}; 
      padding: 4px 8px; 
      text-align: left; 
      vertical-align: top;
    }
    
    .markdown th { 
      background: ${EXPORT_COLORS.surface}; 
      color: ${EXPORT_COLORS.textSecondary}; 
      font-weight: 600; 
      text-transform: uppercase; 
      font-size: 10px; 
      letter-spacing: 0.05em; 
    }
    
    .markdown td:first-child {
      font-weight: 500;
      color: ${EXPORT_COLORS.ink};
    }
    
    /* Code */
    .markdown code { 
      font-family: "Courier New", Consolas, Monaco, monospace;
      background: ${EXPORT_COLORS.surface}; 
      padding: 1px 4px; 
      border-radius: 3px; 
      font-size: 0.9em;
    }
    
    /* Subheader paragraphs (bold labels) */
    .markdown p.md-subheader { 
      margin-top: 1.25em; 
      margin-bottom: 0.25em; 
      line-height: 1.4; 
    }
    
    .markdown p.md-subheader:first-child { 
      margin-top: 0; 
    }
    
    .markdown p.md-subheader + ul,
    .markdown p.md-subheader + ol { 
      margin-top: 0; 
      margin-bottom: 0.75em; 
    }
    
    .markdown ul + p.md-subheader,
    .markdown ol + p.md-subheader { 
      margin-top: 1.5em; 
    }
    
    .markdown p.md-subheader + p.md-subheader { 
      margin-top: 1em; 
    }
    
    .markdown ul ul, 
    .markdown ol ul, 
    .markdown ul ol, 
    .markdown ol ol { 
      margin-top: 0.15em; 
      margin-bottom: 0.15em; 
    }

    /* ============ NOTE MARKDOWN (Section Content) ============ */
    /* Uses same simple list styling - no pseudo-elements */
    .note-markdown { 
      color: ${EXPORT_COLORS.ink}; 
    }
    
    .note-markdown strong { 
      color: ${EXPORT_COLORS.ink}; 
      font-weight: 600; 
    }
    
    .note-markdown ul, .note-markdown ol { 
      margin: 0.2em 0 0.6em 0; 
      padding-left: 1.5em; 
    }
    
    .note-markdown ul {
      list-style-type: disc;
    }
    
    .note-markdown ol {
      list-style-type: decimal;
    }
    
    .note-markdown table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 11px; 
      margin: 0.6em 0; 
    }
    
    .note-markdown th, .note-markdown td { 
      border: 1px solid ${EXPORT_COLORS.border}; 
      padding: 4px 8px; 
      text-align: left; 
    }
    
    .note-markdown th { 
      background: ${EXPORT_COLORS.surface}; 
      color: ${EXPORT_COLORS.textSecondary}; 
      font-weight: 600; 
      text-transform: uppercase; 
      font-size: 10px; 
      letter-spacing: 0.05em; 
    }
    
    .note-markdown td:first-child {
      font-weight: 500;
      color: ${EXPORT_COLORS.ink};
    }

    /* ============ CALLOUT BOXES ============ */
    .key-highlights, 
    .open-questions, 
    .post-interview, 
    .update-notes {
      margin: 10px 0;
      padding: 10px 14px;
      border: 1px solid ${EXPORT_COLORS.border};
      border-left: 3px solid ${EXPORT_COLORS.maple};
      background: ${EXPORT_COLORS.surface};
      page-break-inside: avoid;
    }
    
    /* Key Highlights - maple accent */
    .key-highlights {
      border-left-color: ${EXPORT_COLORS.maple};
    }
    
    /* Open Questions - forest accent */
    .open-questions { 
      border-left-color: ${EXPORT_COLORS.forest}; 
    }
    
    /* Post-Interview & Updates - maple accent with tinted bg */
    .post-interview, 
    .update-notes { 
      border-left-color: ${EXPORT_COLORS.maple}; 
      background: ${EXPORT_COLORS.mapleBg}; 
    }
    
    /* Callout titles */
    .kh-title, 
    .oq-title, 
    .pi-title { 
      font-size: 10px; 
      font-weight: 700; 
      letter-spacing: 0.08em; 
      text-transform: uppercase; 
      color: ${EXPORT_COLORS.textSecondary}; 
      margin: 0 0 6px 0; 
    }
    
    .post-interview .pi-title, 
    .update-notes .pi-title { 
      color: ${EXPORT_COLORS.maple}; 
    }
    
    /* Callout content */
    .key-highlights ul,
    .open-questions ul,
    .post-interview ul,
    .update-notes ul {
      margin: 0.2em 0 0 1.1em;
      list-style-type: disc;
    }
    
    .open-questions p, 
    .post-interview p, 
    .update-notes p { 
      margin: 0.3em 0; 
      font-style: italic;
      color: inherit;
    }
    
    .open-questions p:last-child,
    .post-interview p:last-child,
    .update-notes p:last-child {
      margin-bottom: 0;
    }
    
    /* Answer styling in open questions - red bold */
    .open-questions .oq-answer { 
      display: block; 
      margin-top: 4px; 
      color: ${EXPORT_COLORS.error}; 
      font-weight: 700; 
      font-style: normal; 
    }

    /* ============ DSM BADGES ============ */
    /* IMPORTANT: html2canvas compatible - no CSS variables, inline display, tight sizing */
    .dsm-badge { 
      display: inline;
      font-family: "Courier New", Consolas, Monaco, monospace;
      font-size: 11px; 
      font-weight: 700; 
      padding: 0 3px; 
      border-radius: 2px; 
      margin: 0 1px;
      line-height: 1;
      white-space: nowrap;
    }
    
    .dsm-met { 
      background-color: rgba(34, 197, 94, 0.15); 
      color: #16a34a; 
      border: 1px solid rgba(34, 197, 94, 0.3); 
    }
    
    .dsm-not-met { 
      background-color: rgba(239, 68, 68, 0.1); 
      color: #dc2626; 
      border: 1px solid rgba(239, 68, 68, 0.25); 
    }
    
    .dsm-unknown { 
      background-color: rgba(234, 179, 8, 0.15); 
      color: #ca8a04; 
      border: 1px solid rgba(234, 179, 8, 0.3); 
    }
    
    .dsm-partial { 
      background-color: rgba(249, 115, 22, 0.12); 
      color: #ea580c; 
      border: 1px solid rgba(249, 115, 22, 0.25); 
    }

    /* ============ CHAT ADDENDA ============ */
    .export-chat-title, 
    .export-appendix-title { 
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 12px; 
      font-weight: 700; 
      letter-spacing: 0.08em; 
      text-transform: uppercase; 
      margin: 18px 0 10px 0;
      border-bottom: 1px solid ${EXPORT_COLORS.borderSubtle};
      padding-bottom: 4px;
    }
    
    .export-chat-item { 
      margin: 0.5em 0;
      padding: 6px 0;
      border-bottom: 1px solid ${EXPORT_COLORS.borderSubtle};
    }
    
    .export-chat-item:last-child {
      border-bottom: none;
    }
    
    .export-chat-label { 
      font-weight: 700; 
      color: ${EXPORT_COLORS.textSecondary};
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
      display: block;
    }
    
    .export-chat-item .note-markdown {
      font-size: 11px;
    }

    /* ============ EVIDENCE APPENDIX ============ */
    .export-appendix-item { 
      margin: 0.5em 0; 
      font-size: 10px; 
      color: ${EXPORT_COLORS.text};
      padding: 6px 8px;
      background: ${EXPORT_COLORS.surface};
      border-left: 2px solid ${EXPORT_COLORS.border};
    }
    
    .export-appendix-num { 
      font-family: "Courier New", Consolas, Monaco, monospace;
      color: ${EXPORT_COLORS.textMuted}; 
      font-weight: 700;
      margin-right: 6px;
    }
    
    .export-appendix-source {
      font-weight: 600;
      color: ${EXPORT_COLORS.text};
    }
    
    .export-appendix-excerpt {
      color: ${EXPORT_COLORS.textSecondary};
      font-style: italic;
    }
  `

  const sectionHtml = sections.map(section => {
    const sectionOutput = options.includeOpenQuestions ? (section.output || '') : stripOpenQuestionsFromText(section.output || '')
    const cleaned = stripInlineChunkIds(sectionOutput)
    const sectionBody = cleaned ? markdownToHtml(cleaned) : '<p>—</p>'
    return `
      <div class="export-section">
        <div class="export-section-title">${escapeHtml(section.title.toUpperCase())}</div>
        <div class="note-markdown markdown">${sectionBody}</div>
      </div>
    `.trim()
  }).join('\n')

  const chatHtml = chat.length > 0
    ? `
      <div class="export-chat-title">CHAT ADDENDA</div>
      ${chat.map(msg => {
        const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
        const msgHtml = markdownToHtml(stripInlineChunkIds(msg.text || ''))
        return `<div class="export-chat-item"><span class="export-chat-label">${escapeHtml(label)}</span><div class="note-markdown markdown">${msgHtml}</div></div>`
      }).join('')}
    `.trim()
    : ''

  const appendixHtml = options.includeAppendix && list.length > 0
    ? `
      <div class="export-appendix-title">EVIDENCE APPENDIX</div>
      ${list.map(item => {
        const excerpt = escapeHtml(item.citation.excerpt || '')
        const source = escapeHtml(item.citation.sourceName || '')
        return `<div class="export-appendix-item"><span class="export-appendix-num">[${item.id}]</span><span class="export-appendix-source">${source}:</span> <span class="export-appendix-excerpt">${excerpt}</span></div>`
      }).join('')}
    `.trim()
    : ''

  return `
    <style>${css}</style>
    <div class="export-root">
      <div class="export-title">PSYCH INTAKE BRIEF</div>
      ${profileLine ? `<div class="export-profile">${escapeHtml(profileLine)}</div>` : ''}
      <div class="export-meta">Generated ${escapeHtml(new Date().toLocaleString())}</div>
      ${sectionHtml}
      ${chatHtml}
      ${appendixHtml}
    </div>
  `.trim()
}

function escapeHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
