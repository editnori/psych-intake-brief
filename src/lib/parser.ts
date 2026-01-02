import mammoth from 'mammoth/mammoth.browser'
import type { SourceDoc, Chunk, StoredDoc, AppSettings } from './types'
import { readPdfLocally, readPdfWithOpenAI } from './pdf'

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200
const FRAGMENT_CHUNK_SIZE = 650
const FRAGMENT_CHUNK_OVERLAP = 120

// Document type detection patterns
const DOCUMENT_TYPE_PATTERNS: Array<{ type: SourceDoc['documentType']; patterns: RegExp[] }> = [
  {
    type: 'discharge-summary',
    patterns: [
      /discharge\s+summar/i,
      /discharge\s+instructions/i,
      /hospital\s+discharge/i,
      /inpatient\s+discharge/i,
      /date\s+of\s+discharge/i,
      /hospital\s+course/i,
      /disposition/i
    ]
  },
  {
    type: 'psych-eval',
    patterns: [
      /psychiatric\s+evaluation/i,
      /psychological\s+evaluation/i,
      /mental\s+status\s+exam/i,
      /psych\s+eval/i,
      /comprehensive\s+psychiatric/i,
      /diagnostic\s+evaluation/i,
      /psychiatric\s+consult/i
    ]
  },
  {
    type: 'progress-note',
    patterns: [
      /progress\s+note/i,
      /clinical\s+note/i,
      /office\s+visit/i,
      /follow[- ]?up\s+note/i,
      /outpatient\s+note/i,
      /daily\s+note/i,
      /interval\s+history/i
    ]
  },
  {
    type: 'biopsychosocial',
    patterns: [
      /biopsychosocial/i,
      /bio[- ]?psycho[- ]?social/i,
      /psychosocial\s+assessment/i,
      /comprehensive\s+assessment/i,
      /social\s+work\s+assessment/i
    ]
  },
  {
    type: 'intake',
    patterns: [
      /intake\s+assessment/i,
      /initial\s+assessment/i,
      /intake\s+evaluation/i,
      /new\s+patient\s+intake/i,
      /history\s+and\s+physical/i,
      /admission\s+note/i
    ]
  }
]

// Document weight by type (for evidence ranking)
const DOCUMENT_WEIGHTS: Record<NonNullable<SourceDoc['documentType']>, number> = {
  'discharge-summary': 1.5,
  'psych-eval': 1.3,
  'biopsychosocial': 1.2,
  'progress-note': 1.0,
  'intake': 1.0,
  'other': 0.8
}

// Episode clustering window in milliseconds (30 days)
const EPISODE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function getDocWeight(documentType: SourceDoc['documentType']): number {
  return DOCUMENT_WEIGHTS[documentType || 'other'] ?? 0.8
}

// Date extraction patterns
const DATE_PATTERNS = [
  /(?:date\s*(?:of\s+)?(?:service|visit|admission|discharge|encounter))\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(?:service\s+date|visit\s+date|encounter\s+date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(?:admission\s+date|discharge\s+date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(?:^|\n)(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+|\n)/
]

function detectDocumentType(text: string, filename: string): SourceDoc['documentType'] {
  const combined = `${filename}\n${text.slice(0, 3000)}`.toLowerCase()
  
  for (const { type, patterns } of DOCUMENT_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return type
      }
    }
  }
  return 'other'
}

function parseDateInput(value: string): string | undefined {
  const cleaned = value.trim()
  const match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (!match) return undefined
  const month = Math.max(1, Math.min(12, parseInt(match[1], 10)))
  const day = Math.max(1, Math.min(31, parseInt(match[2], 10)))
  let year = parseInt(match[3], 10)
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function extractEpisodeDate(text: string): string | undefined {
  const searchText = text.slice(0, 2000)
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(searchText)
    if (match && match[1]) {
      return parseDateInput(match[1]) || match[1]
    }
  }
  return undefined
}

function applyPrivacyRedaction(text: string): string {
  let out = text
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED SSN]')
  out = out.replace(/\b(?:MRN|Medical Record Number)\s*[:#]?\s*\w+\b/gi, 'MRN: [REDACTED]')
  out = out.replace(/\b(?:DOB|Date of Birth)\s*[:#]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi, 'DOB: [REDACTED]')
  out = out.replace(/\b\d{3}[-.)\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED PHONE]')
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]')
  out = out.replace(/\b(Name|Patient Name)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g, '$1: [REDACTED]')
  return out
}

function resolveChunkConfig(mode: AppSettings['privacyMode'] | undefined): { size: number; overlap: number } {
  if (mode === 'fragment') {
    return { size: FRAGMENT_CHUNK_SIZE, overlap: FRAGMENT_CHUNK_OVERLAP }
  }
  return { size: CHUNK_SIZE, overlap: CHUNK_OVERLAP }
}

function chunkText(
  text: string,
  sourceId: string,
  sourceName: string,
  meta?: { documentType?: SourceDoc['documentType']; episodeDate?: string; docWeight?: number },
  config?: { size: number; overlap: number }
): Chunk[] {
  const chunks: Chunk[] = []
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return chunks

  const size = config?.size || CHUNK_SIZE
  const overlap = config?.overlap || CHUNK_OVERLAP
  let start = 0
  let idx = 0
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size)
    const slice = clean.slice(start, end)
    const chunk: Chunk = {
      id: `${sourceId}_chunk_${idx}`,
      sourceId,
      sourceName,
      text: slice,
      start,
      end,
      documentType: meta?.documentType,
      episodeDate: meta?.episodeDate,
      docWeight: meta?.docWeight
    }
    chunks.push(chunk)
    idx += 1
    if (end === clean.length) break
    start = Math.max(0, end - overlap)
  }
  return chunks
}

async function readDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value || ''
}

async function readTxtText(file: File): Promise<string> {
  return await file.text()
}

export function makeDocFromText(
  name: string,
  text: string,
  kind: SourceDoc['kind'] = 'txt',
  id?: string,
  warnings?: string[],
  error?: string,
  parser?: SourceDoc['parser'],
  addedAt: number = Date.now(),
  tag: SourceDoc['tag'] = 'initial',
  documentType?: SourceDoc['documentType'],
  episodeDate?: string,
  privacyMode?: AppSettings['privacyMode']
): SourceDoc {
  const docId = id || crypto.randomUUID()
  const detectedType = documentType ?? detectDocumentType(text, name)
  const detectedDate = episodeDate ?? extractEpisodeDate(text)
  const docWeight = getDocWeight(detectedType)
  const normalizedText = privacyMode === 'redact' ? applyPrivacyRedaction(text) : text
  const chunkConfig = resolveChunkConfig(privacyMode)
  const chunks = chunkText(normalizedText, docId, name, { documentType: detectedType, episodeDate: detectedDate, docWeight }, chunkConfig)
  const chronologicalOrder = detectedDate ? new Date(detectedDate).getTime() : undefined
  return { 
    id: docId, 
    name, 
    kind, 
    text: normalizedText, 
    chunks, 
    warnings, 
    error, 
    parser, 
    addedAt, 
    tag,
    documentType: detectedType,
    episodeDate: detectedDate,
    chronologicalOrder,
    docWeight
  }
}

export async function loadFiles(files: File[], settings?: AppSettings, tag: SourceDoc['tag'] = 'initial'): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = []
  for (const file of files) {
    const name = file.name
    const ext = name.split('.').pop()?.toLowerCase() || ''

    let text = ''
    let kind: SourceDoc['kind'] = 'unknown'
    const warnings: string[] = []
    let error: string | undefined
    let parser: SourceDoc['parser']

    try {
      if (ext === 'txt' || ext === 'md' || ext === 'rtf') {
        text = await readTxtText(file)
        kind = 'txt'
      } else if (ext === 'docx') {
        text = await readDocxText(file)
        kind = 'docx'
      } else if (ext === 'pdf') {
        kind = 'pdf'
        const pdfMode = settings?.pdfParser || 'local'
        if (pdfMode === 'openai') {
          try {
            const result = await readPdfWithOpenAI(file, settings as AppSettings)
            text = result.text
            parser = 'openai'
            if (result.warnings) warnings.push(...result.warnings)
          } catch {
            warnings.push('OpenAI PDF parsing failed; used local parser')
          }
        }
        if (!text) {
          const result = await readPdfLocally(file)
          text = result.text
          parser = 'local'
          if (result.warnings) warnings.push(...result.warnings)
        }
      } else {
        text = await readTxtText(file)
        kind = 'unknown'
      }
    } catch (err: any) {
      text = ''
      error = err?.message || 'Failed to read file'
    }

    if (!text.trim()) {
      warnings.push('No text extracted')
    }

    docs.push(makeDocFromText(
      name,
      text,
      kind,
      undefined,
      warnings.length ? warnings : undefined,
      error,
      parser,
      Date.now(),
      tag,
      undefined,
      undefined,
      settings?.privacyMode
    ))
  }
  return docs
}

export function mergeDocuments(docs: SourceDoc[]): Chunk[] {
  return docs.flatMap(d => d.chunks)
}

/**
 * Cluster documents into episodes based on episodeDate proximity (30-day window).
 * Returns documents with episodeId assigned.
 */
export function clusterEpisodes(docs: SourceDoc[]): SourceDoc[] {
  // Sort by chronological order (episode date)
  const sorted = [...docs].sort((a, b) => {
    const aOrder = a.chronologicalOrder ?? Infinity
    const bOrder = b.chronologicalOrder ?? Infinity
    return aOrder - bOrder
  })
  
  let currentEpisodeId = crypto.randomUUID()
  let lastDate: number | null = null
  
  return sorted.map(doc => {
    const docDate = doc.chronologicalOrder
    
    if (docDate != null) {
      if (lastDate != null && (docDate - lastDate) > EPISODE_WINDOW_MS) {
        // New episode - more than 30 days since last document
        currentEpisodeId = crypto.randomUUID()
      }
      lastDate = docDate
    }
    
    return {
      ...doc,
      episodeId: currentEpisodeId
    }
  })
}

export function serializeDocs(docs: SourceDoc[]): StoredDoc[] {
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    text: d.text,
    tag: d.tag,
    addedAt: d.addedAt,
    documentType: d.documentType,
    episodeDate: d.episodeDate,
    chronologicalOrder: d.chronologicalOrder,
    episodeId: d.episodeId,
    docWeight: d.docWeight
  }))
}

export function restoreDocs(stored: StoredDoc[]): SourceDoc[] {
  return stored.map(s => {
    const doc = makeDocFromText(
      s.name, 
      s.text, 
      s.kind, 
      s.id, 
      undefined, 
      undefined, 
      undefined, 
      s.addedAt || Date.now(), 
      s.tag || 'initial',
      s.documentType,
      s.episodeDate
    )
    // Preserve episodeId if it was stored
    if (s.episodeId) {
      doc.episodeId = s.episodeId
    }
    return doc
  })
}
