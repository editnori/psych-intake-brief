import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import type { PatientProfile, TemplateSection, Citation, ChatMessage } from './types'

interface CitationIndex {
  map: Map<string, number>
  list: Array<{ id: number; citation: Citation }>
}

function buildCitationIndex(sections: TemplateSection[]): CitationIndex {
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
  return { map, list }
}

function formatProfile(profile: PatientProfile): string {
  const parts = [profile.name && `Name: ${profile.name}`, profile.mrn && `MRN: ${profile.mrn}`, profile.dob && `DOB: ${profile.dob}`]
  return parts.filter(Boolean).join(' • ')
}

export async function exportDocx(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = []) {
  const { map, list } = buildCitationIndex(sections)
  const profileLine = formatProfile(profile)

  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: 'Psych Intake Summary', size: 36, bold: true })
      ],
      spacing: { after: 120 },
      alignment: AlignmentType.LEFT
    })
  ]

  if (profileLine) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: profileLine, color: '475569', size: 22 })],
      spacing: { after: 120 }
    }))
  }

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}`, italics: true, color: '64748b', size: 18 })],
    spacing: { after: 240 }
  }))

  for (const section of sections) {
    paragraphs.push(new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 60 }
    }))

    const citationIds = (section.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
    const citeText = citationIds.length ? ` [${citationIds.join(', ')}]` : ''
    const body = (section.output || section.placeholder || '').trim()

    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: body || '—', size: 22, color: body ? '0b1b34' : '94a3b8' }),
        citeText ? new TextRun({ text: citeText, superScript: true, color: '475569' }) : new TextRun({ text: '' })
      ],
      spacing: { after: 140 }
    }))
  }

  if (chat.length > 0) {
    paragraphs.push(new Paragraph({ text: 'Chat Addenda', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 } }))
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true }),
          new TextRun({ text: msg.text })
        ],
        spacing: { after: 80 }
      }))
      if (msg.citations?.length) {
        for (const c of msg.citations) {
          paragraphs.push(new Paragraph({
            children: [
              new TextRun({ text: `Evidence (${c.sourceName}): `, bold: true, color: '1d4ed8' }),
              new TextRun({ text: c.excerpt, color: '475569' })
            ],
            spacing: { after: 60 }
          }))
        }
      }
    }
  }

  if (list.length > 0) {
    paragraphs.push(new Paragraph({ text: 'Evidence Appendix', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 } }))
    for (const item of list) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `[${item.id}] ${item.citation.sourceName}: `, bold: true, color: '1f2937' }),
          new TextRun({ text: item.citation.excerpt, color: '475569' })
        ],
        spacing: { after: 80 }
      }))
    }
  }

  const doc = new Document({
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

export function exportPdf(profile: PatientProfile, sections: TemplateSection[], chat: ChatMessage[] = []) {
  const { map, list } = buildCitationIndex(sections)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageHeight = doc.internal.pageSize.height
  const pageWidth = doc.internal.pageSize.width
  const margin = 40
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(37, 99, 235)
  doc.text('Psych Intake Summary', margin, y)
  y += 6
  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(1)
  doc.line(margin, y, pageWidth - margin, y)
  y += 18

  const profileLine = formatProfile(profile)
  if (profileLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(71, 85, 105)
    doc.text(profileLine, margin, y)
    y += 14
  }

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y)
  y += 18

  for (const section of sections) {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 64, 175)
    doc.text(section.title, margin, y)
    y += 16

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    const citationIds = (section.citations || []).map(c => map.get(`${c.sourceName}::${c.excerpt}`)).filter(Boolean) as number[]
    const citeText = citationIds.length ? ` [${citationIds.join(', ')}]` : ''
    const base = (section.output || section.placeholder || '').trim() || '—'
    const body = base + citeText
    const lines = doc.splitTextToSize(body, 520)
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += 14
    }
    y += 10
  }

  if (chat.length > 0) {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 64, 175)
    doc.text('Chat Addenda', margin, y)
    y += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    for (const msg of chat) {
      const label = msg.role === 'user' ? 'Clinician' : 'Assistant'
      const lines = doc.splitTextToSize(`${label}: ${msg.text}`, 520)
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 14
      }
      if (msg.citations?.length) {
        doc.setFontSize(9)
        doc.setTextColor(100, 116, 139)
        for (const c of msg.citations) {
          const evLines = doc.splitTextToSize(`Evidence (${c.sourceName}): ${c.excerpt}`, 520)
          for (const ev of evLines) {
            if (y > pageHeight - margin) {
              doc.addPage()
              y = margin
            }
            doc.text(ev, margin, y)
            y += 12
          }
        }
        doc.setFontSize(11)
        doc.setTextColor(15, 23, 42)
      }
      y += 6
    }
  }

  if (list.length > 0) {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 64, 175)
    doc.text('Evidence Appendix', margin, y)
    y += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(71, 85, 105)
    for (const item of list) {
      const entry = `[${item.id}] ${item.citation.sourceName}: ${item.citation.excerpt}`
      const lines = doc.splitTextToSize(entry, 520)
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 12
      }
      y += 6
    }
  }

  doc.save(`psych-intake-${Date.now()}.pdf`)
}
