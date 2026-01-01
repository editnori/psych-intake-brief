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
  const match = trimmed.match(/^(Open questions|Key highlights|Post[- ]interview notes?)(\s*\([^)]*\))?\s*:?\s*(.*)$/i)
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

function runsFromText(text: string, size: number, color: string): TextRun[] {
  const lines = text.split('\n')
  return lines.map((line, idx) => new TextRun({
    text: line,
    size,
    color,
    font: 'Courier New',
    break: idx === 0 ? 0 : 1
  }))
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
      children: [new TextRun({ text: label.toUpperCase(), size: 16, bold: true, color: '6B6356', font: 'Courier New' })],
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
          font: 'Courier New'
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
}

export async function exportDocx(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = [], options: ExportOptions = {}) {
  const visibleSections = sections.filter(s => {
    if (s.hidden) return false
    if (options.excludeClinicianOnly && s.clinicianOnly) return false
    return true
  })
  const { map, list } = buildCitationIndex(visibleSections, chat)
  const profileLine = formatProfile(profile)

  const paragraphs: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({ text: 'PSYCH INTAKE BRIEF', size: 28, bold: true, font: 'Courier New' })
      ],
      spacing: { after: 120 },
      alignment: AlignmentType.LEFT
    })
  ]

  if (profileLine) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: profileLine, color: '475569', size: 20, font: 'Courier New' })],
      spacing: { after: 120 }
    }))
  }

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}`, italics: true, color: '64748b', size: 16, font: 'Courier New' })],
    spacing: { after: 240 }
  }))

  for (const section of visibleSections) {
    const citationIds = (section.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
    const headingRuns = [
      new TextRun({ text: section.title.toUpperCase(), bold: true, font: 'Courier New' })
    ]
    if (citationIds.length > 0) {
      headingRuns.push(new TextRun({ text: ` [${citationIds.join(', ')}]`, size: 16, superScript: true, color: '64748b', font: 'Courier New' }))
    }
    paragraphs.push(new Paragraph({
      children: headingRuns,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 60 }
    }))

    const blocks = buildExportBlocks(section.output || '')
    if (blocks.length === 0) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '—', size: 20, color: '94a3b8', font: 'Courier New' })],
        spacing: { after: 140 }
      }))
      continue
    }
    for (const block of blocks) {
      if (block.type === 'callout') {
        paragraphs.push(buildCalloutTable(block.label, block.kind, block.lines))
        paragraphs.push(new Paragraph({ text: '', spacing: { after: 120 } }))
        continue
      }
      const body = block.lines.join('\n')
      const bodyRuns = runsFromText(body, 20, '0b1b34')
      paragraphs.push(new Paragraph({ children: bodyRuns, spacing: { after: 120 } }))
    }
  }

  if (chat.length > 0) {
    paragraphs.push(new Paragraph({ text: 'CHAT ADDENDA', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 } }))
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const citationIds = (msg.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
      const msgText = formatExportText(msg.text) + (citationIds.length ? ` [${citationIds.join(', ')}]` : '')
      const msgRuns = runsFromText(msgText, 20, '0b1b34')
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, font: 'Courier New' }),
          ...msgRuns
        ],
        spacing: { after: 80 }
      }))
    }
  }

  if (list.length > 0) {
    paragraphs.push(new Paragraph({ text: 'EVIDENCE APPENDIX', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 } }))
    for (const item of list) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `[${item.id}] ${item.citation.sourceName}: `, bold: true, color: '1f2937', font: 'Courier New' }),
          new TextRun({ text: item.citation.excerpt, color: '475569', font: 'Courier New' })
        ],
        spacing: { after: 80 }
      }))
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Courier New',
            size: 20
          }
        }
      }
    },
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `psych-intake-${Date.now()}.docx`)
}

export function exportPdf(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = [], options: ExportOptions = {}) {
  const visibleSections = sections.filter(s => {
    if (s.hidden) return false
    if (options.excludeClinicianOnly && s.clinicianOnly) return false
    return true
  })
  const { map, list } = buildCitationIndex(visibleSections, chat)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageHeight = doc.internal.pageSize.height
  const pageWidth = doc.internal.pageSize.width
  const margin = 40
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
    doc.setFont('courier', 'normal')
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
    doc.setFont('courier', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(titleLine, margin + paddingX, y + paddingY + 12)

    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    for (const line of bodyLines) {
      if (!line.text) {
        cursorY += blankHeight
        continue
      }
      if (line.kind === 'answer') {
        doc.setTextColor(colors.error[0], colors.error[1], colors.error[2])
        doc.setFont('courier', 'bold')
      } else if (line.kind === 'source') {
        doc.setTextColor(colors.source[0], colors.source[1], colors.source[2])
        doc.setFont('courier', 'italic')
      } else {
        doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
        doc.setFont('courier', 'normal')
      }
      doc.text(line.text, margin + paddingX, cursorY)
      cursorY += lineHeight
    }
    y += boxHeight + 12
  }

  doc.setFont('courier', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
  doc.text('PSYCH INTAKE BRIEF', margin, y)
  y += 6
  doc.setDrawColor(colors.maple[0], colors.maple[1], colors.maple[2])
  doc.setLineWidth(1)
  doc.line(margin, y, pageWidth - margin, y)
  y += 18

  const profileLine = formatProfile(profile)
  if (profileLine) {
    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(profileLine, margin, y)
    y += 14
  }

  doc.setFontSize(9)
  doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y)
  y += 18

  for (const section of visibleSections) {
    const citationIds = (section.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
    ensureSpace(20)
    doc.setFont('courier', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    const heading = citationIds.length ? `${section.title.toUpperCase()} [${citationIds.join(', ')}]` : section.title.toUpperCase()
    doc.text(heading, margin, y)
    y += 16

    const blocks = buildExportBlocks(section.output || '')
    if (blocks.length === 0) {
      renderTextBlock('—', 10, colors.muted)
      y += 8
      continue
    }
    for (const block of blocks) {
      if (block.type === 'callout') {
        renderCallout(block)
      } else {
        const text = block.lines.join('\n') || '—'
        renderTextBlock(text, 10, colors.ink)
        y += 8
      }
    }
  }

  if (chat.length > 0) {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('courier', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text('CHAT ADDENDA', margin, y)
    y += 16
    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2])
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const citationIds = (msg.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
      const cleaned = formatExportText(msg.text)
      const suffix = citationIds.length ? ` [${citationIds.join(', ')}]` : ''
      const lines = doc.splitTextToSize(`${label}: ${cleaned}${suffix}`, 520)
      for (const line of lines) {
        ensureSpace(14)
        doc.text(line, margin, y)
        y += 14
      }
      y += 6
    }
  }

  if (list.length > 0) {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('courier', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text('EVIDENCE APPENDIX', margin, y)
    y += 16
    doc.setFont('courier', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
    for (const item of list) {
      const entry = `[${item.id}] ${item.citation.sourceName}: ${item.citation.excerpt}`
      const lines = doc.splitTextToSize(entry, 520)
      for (const line of lines) {
        ensureSpace(12)
        doc.text(line, margin, y)
        y += 12
      }
      y += 6
    }
  }

  doc.save(`psych-intake-${Date.now()}.pdf`)
}
