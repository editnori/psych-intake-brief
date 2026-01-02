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
  ShadingType
} from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import type { PatientProfile, TemplateSection, Citation, ChatMessage } from './types'
import { stripInlineChunkIds, formatProfile, normalizeForRendering } from './textUtils'

interface CitationIndex {
  map: Map<string, number>
  list: Array<{ id: number; citation: Citation }>
}

// Use standard fonts that are available on all systems
const FONT_SERIF = 'Times New Roman'
const FONT_SANS = 'Arial'
const FONT_MONO = 'Courier New'

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

// DSM badge colors for DOCX export
const DSM_COLORS = {
  met: '16a34a',      // green
  notMet: 'dc2626',   // red
  unknown: 'ca8a04',  // amber
  partial: 'ea580c'   // orange
}


interface LineStyle {
  size?: number
  color?: string
  bold?: boolean
  indentSpaces?: number
}

type LineStyleFn = (line: string) => LineStyle | null

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
      // Add badge first if present
      if (parsed.badge) {
        const badgeColor = parsed.badge === '+' ? DSM_COLORS.met
          : parsed.badge === '-' ? DSM_COLORS.notMet
          : parsed.badge === '?' ? DSM_COLORS.unknown
          : DSM_COLORS.partial
        pushRun({
          text: `[${parsed.badge}] `,
          size: lineSize,
          color: badgeColor,
          font: FONT_MONO,
          bold: true
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
    
    // For bullet/numbered items, add the badge first if present
    if ((parsed.type === 'bullet' || parsed.type === 'numbered') && parsed.badge) {
      const badgeColor = parsed.badge === '+' ? DSM_COLORS.met
        : parsed.badge === '-' ? DSM_COLORS.notMet
        : parsed.badge === '?' ? DSM_COLORS.unknown
        : DSM_COLORS.partial
      pushRun({
        text: `[${parsed.badge}] `,
        size: lineSize,
        color: badgeColor,
        font: FONT_MONO,
        bold: true
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
      
      // Add the badge with color
      const badge = match[1].toLowerCase()
      const badgeColor = badge === '+' ? DSM_COLORS.met
        : badge === '-' ? DSM_COLORS.notMet
        : badge === '?' ? DSM_COLORS.unknown
        : DSM_COLORS.partial
      
      pushRun({
        text: `[${match[1]}]`,
        size: lineSize,
        color: badgeColor,
        font: FONT_MONO,
        bold: true
      })
      
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

const CALLOUT_STYLES: Record<'open' | 'highlights' | 'post', { accent: string; fill: string }> = {
  open: { accent: '3D5A47', fill: 'F6F3ED' },
  highlights: { accent: 'B85C38', fill: 'F6F3ED' },
  post: { accent: 'B85C38', fill: 'F7EFE9' }
}

function buildCalloutTable(label: string, kind: 'open' | 'highlights' | 'post', lines: string[]): Table {
  const style = CALLOUT_STYLES[kind]
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: label.toUpperCase(), size: 16, bold: true, color: '6B6356', font: FONT_SANS })],
      spacing: { after: 80 }
    })
  ]
  for (const line of lines) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: '', spacing: { after: 60 } }))
      continue
    }
    const trimmed = line.trim()
    const isAnswer = /^answer\s*:/i.test(trimmed)
    const isSource = /^source\s*:/i.test(trimmed)
    children.push(new Paragraph({
      children: [
        new TextRun({
          text: line,
          size: 20,
          color: isAnswer ? 'A8423F' : isSource ? 'A8A090' : '2C2416',
          bold: isAnswer,
          italics: isSource,
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
              top: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 },
              left: { style: BorderStyle.SINGLE, color: style.accent, size: 16 },
              right: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 }
            },
            margins: { top: 140, bottom: 140, left: 220, right: 160 }
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

  // Font sizes in half-points (24 = 12pt, 22 = 11pt, 20 = 10pt)
  const SIZE_TITLE = 32      // 16pt
  const SIZE_HEADING = 24    // 12pt
  const SIZE_BODY = 22       // 11pt
  const SIZE_SMALL = 18      // 9pt

  // Consistent color scheme
  const COLOR_INK = '2C2416'

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
      children: [new TextRun({ text: profileLine, color: '333333', size: SIZE_BODY, font: FONT_SANS })],
      spacing: { after: 100 }
    }))
  }

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}`, italics: true, color: '666666', size: SIZE_SMALL, font: FONT_SANS })],
    spacing: { after: 300 }
  }))

  // Standard header color for consistent look
  const HEADER_COLOR = '2C2416'

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
        children: [new TextRun({ text: '—', size: SIZE_BODY, color: '999999', font: FONT_SANS })],
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
              return { size: SIZE_BODY - 2, color: '4A4136', indentSpaces: 4 }
            }
            if (type === 'header') {
              return { bold: true }
            }
            return null
          }
        : undefined

      for (const paragraphText of paragraphsText) {
        const bodyRuns = runsFromText(paragraphText, SIZE_BODY, COLOR_INK, lineStyleFn)
        paragraphs.push(new Paragraph({
          children: bodyRuns,
          spacing: { after: 180, line: 276 } // 1.15 line spacing
        }))
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
          new TextRun({ text: `[${item.id}] `, bold: true, size: SIZE_SMALL, color: '666666', font: FONT_MONO }),
          new TextRun({ text: `${item.citation.sourceName}: `, bold: true, size: SIZE_BODY, font: FONT_SANS }),
          new TextRun({ text: item.citation.excerpt, size: SIZE_BODY, color: '444444', font: FONT_SANS })
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

export function exportPdf(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = [], options: ExportOptions = {}) {
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
