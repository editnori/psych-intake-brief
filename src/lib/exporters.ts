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
import { stripInlineChunkIds, formatProfile } from './textUtils'

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

function stripMarkdown(text: string): string {
  let out = text || ''
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

function formatExportText(text: string): string {
  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const cleaned = stripInlineChunkIds(normalized)
  const stripped = stripMarkdown(cleaned)
  return stripped
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

function buildExportBlocks(text: string): ExportBlock[] {
  const normalized = formatExportText(text)
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

function runsFromText(text: string, size: number, color: string): TextRun[] {
  const lines = text.split('\n')
  const runs: TextRun[] = []
  
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    
    // Parse DSM badges and create colored runs
    const dsmPattern = /\[\s*(\+|-|\?|p)\s*\]/gi
    let lastEnd = 0
    let match
    const lineRuns: TextRun[] = []
    
    while ((match = dsmPattern.exec(line)) !== null) {
      // Add text before the badge
      if (match.index > lastEnd) {
        const beforeText = line.slice(lastEnd, match.index)
        if (beforeText) {
          lineRuns.push(new TextRun({
            text: beforeText,
            size,
            color,
            font: FONT_SANS,
            break: idx === 0 && lineRuns.length === 0 ? 0 : (lineRuns.length === 0 && lastEnd === 0 ? 1 : 0)
          }))
        }
      }
      
      // Add the badge with color
      const badge = match[1].toLowerCase()
      const badgeColor = badge === '+' ? DSM_COLORS.met
        : badge === '-' ? DSM_COLORS.notMet
        : badge === '?' ? DSM_COLORS.unknown
        : DSM_COLORS.partial
      
      lineRuns.push(new TextRun({
        text: `[${badge === 'p' ? 'p' : match[1]}]`,
        size,
        color: badgeColor,
        font: FONT_MONO,
        bold: true
      }))
      
      lastEnd = match.index + match[0].length
    }
    
    // Add remaining text after last badge
    if (lastEnd < line.length) {
      const afterText = line.slice(lastEnd)
      if (afterText) {
        lineRuns.push(new TextRun({
          text: afterText,
          size,
          color,
          font: FONT_SANS,
          break: idx > 0 && lineRuns.length === 0 ? 1 : 0
        }))
      }
    }
    
    // If no DSM badges found, add the whole line
    if (lineRuns.length === 0) {
      runs.push(new TextRun({
        text: line,
        size,
        color,
        font: FONT_SANS,
        break: idx === 0 ? 0 : 1
      }))
    } else {
      // Add break for new lines
      if (idx > 0 && lineRuns.length > 0) {
        // Replace first run with a version that has a line break
        const originalRun = lineRuns[0]
        const originalProps = (originalRun as any).options || {}
        lineRuns[0] = new TextRun({
          text: originalProps.text || '',
          size: originalProps.size || size,
          color: originalProps.color || color,
          font: FONT_SANS,
          bold: originalProps.bold,
          break: 1
        })
      }
      runs.push(...lineRuns)
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
      spacing: { after: 60 }
    })
  ]
  for (const line of lines) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: '', spacing: { after: 40 } }))
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
          color: isAnswer ? 'A8423F' : isSource ? 'A8A090' : '0b1b34',
          bold: isAnswer,
          italics: isSource,
          font: FONT_SANS
        })
      ],
      spacing: { after: 40 }
    }))
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            shading: { fill: style.fill, type: ShadingType.SOLID },
            borders: {
              top: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 },
              left: { style: BorderStyle.SINGLE, color: style.accent, size: 12 },
              right: { style: BorderStyle.SINGLE, color: 'E4DFD6', size: 4 }
            },
            margins: { top: 120, bottom: 120, left: 200, right: 140 }
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
  const profileLine = formatProfile(profile)

  // Font sizes in half-points (24 = 12pt, 22 = 11pt, 20 = 10pt)
  const SIZE_TITLE = 32      // 16pt
  const SIZE_HEADING = 24    // 12pt
  const SIZE_BODY = 22       // 11pt
  const SIZE_SMALL = 18      // 9pt

  const paragraphs: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({ text: 'PSYCH INTAKE BRIEF', size: SIZE_TITLE, bold: true, font: FONT_SERIF })
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

  for (const section of visibleSections) {
    // Section heading without citation numbers (cleaner look)
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: section.title.toUpperCase(), bold: true, size: SIZE_HEADING, font: FONT_SERIF })
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 }
    }))

    const blocks = buildExportBlocks(section.output || '')
    if (blocks.length === 0) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '—', size: SIZE_BODY, color: '999999', font: FONT_SANS })],
        spacing: { after: 200 }
      }))
      continue
    }
    for (const block of blocks) {
      if (block.type === 'callout') {
        paragraphs.push(buildCalloutTable(block.label, block.kind, block.lines))
        paragraphs.push(new Paragraph({ text: '', spacing: { after: 160 } }))
        continue
      }
      const body = block.lines.join('\n')
      const bodyRuns = runsFromText(body, SIZE_BODY, '222222')
      paragraphs.push(new Paragraph({ children: bodyRuns, spacing: { after: 160, line: 276 } })) // 1.15 line spacing
    }
  }

  if (chat.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: 'CHAT ADDENDA', bold: true, size: SIZE_HEADING, font: FONT_SERIF })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 }
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
      children: [new TextRun({ text: 'EVIDENCE APPENDIX', bold: true, size: SIZE_HEADING, font: FONT_SERIF })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 }
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

  const renderTextBlock = (text: string, fontSize: number = 10, color: readonly number[] = colors.ink, spacing: number = 14) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(fontSize)
    doc.setTextColor(color[0], color[1], color[2])
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2)
    for (const line of lines) {
      ensureSpace(spacing)
      doc.text(line, margin, y)
      y += spacing
    }
  }

  const renderCallout = (block: Extract<ExportBlock, { type: 'callout' }>) => {
    const accent = block.kind === 'open' ? colors.forest : colors.maple
    const fill = block.kind === 'post' ? colors.mapleTint : colors.surface
    const paddingX = 10
    const paddingY = 6
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
    const headerGap = 6
    const lineHeight = 15
    const blankHeight = 6
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
    y += boxHeight + 12
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
    ensureSpace(30)
    
    // Section heading (no citation numbers for cleaner look)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    doc.text(section.title.toUpperCase(), margin, y)
    y += 18

    const blocks = buildExportBlocks(section.output || '')
    if (blocks.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      doc.text('—', margin, y)
      y += 16
      continue
    }
    for (const block of blocks) {
      if (block.type === 'callout') {
        renderCallout(block)
      } else {
        const text = block.lines.join('\n') || '—'
        renderTextBlock(text, 10, colors.ink, 15)
        y += 10
      }
    }
  }

  if (chat.length > 0) {
    ensureSpace(40)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    doc.text('CHAT ADDENDA', margin, y)
    y += 18
    
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const cleaned = formatExportText(msg.text)
      
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
    ensureSpace(40)
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
