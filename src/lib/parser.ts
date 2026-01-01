import mammoth from 'mammoth/mammoth.browser'
import type { SourceDoc, Chunk, StoredDoc, AppSettings } from './types'
import { readPdfLocally, readPdfWithOpenAI } from './pdf'

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

// Document type detection patterns
const DOCUMENT_TYPE_PATTERNS: Array<{ type: SourceDoc['documentType']; patterns: RegExp[] }> = [
  {
    type: 'discharge-summary',
    patterns: [
      /discharge\s+summar/i,
      /discharge\s+instructions/i,
      /hospital\s+discharge/i,
      /inpatient\s+discharge/i,
      /date\s+of\s+discharge/i
    ]
  },
  {
    type: 'psych-eval',
    patterns: [
      /psychiatric\s+evaluation/i,
      /psychological\s+evaluation/i,
      /mental\s+status\s+exam/i,
      /psych\s+eval/i,
      /comprehensive\s+psychiatric/i
    ]
  },
  {
    type: 'progress-note',
    patterns: [
      /progress\s+note/i,
      /clinical\s+note/i,
      /office\s+visit/i,
      /follow[- ]?up\s+note/i,
      /outpatient\s+note/i
    ]
  },
  {
    type: 'biopsychosocial',
    patterns: [
      /biopsychosocial/i,
      /bio[- ]?psycho[- ]?social/i,
      /psychosocial\s+assessment/i,
      /comprehensive\s+assessment/i
    ]
  },
  {
    type: 'intake',
    patterns: [
      /intake\s+assessment/i,
      /initial\s+assessment/i,
      /intake\s+evaluation/i,
      /new\s+patient\s+intake/i
    ]
  }
]

// Date extraction patterns
const DATE_PATTERNS = [
  /(?:date\s*(?:of\s+)?(?:service|visit|admission|discharge|encounter))\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(?:service\s+date|visit\s+date|encounter\s+date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
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

function extractEpisodeDate(text: string): string | undefined {
  const searchText = text.slice(0, 2000)
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(searchText)
    if (match && match[1]) {
      return match[1]
    }
  }
  return undefined
}

function chunkText(text: string, sourceId: string, sourceName: string): Chunk[] {
  const chunks: Chunk[] = []
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return chunks

  let start = 0
  let idx = 0
  while (start < clean.length) {
    const end = Math.min(clean.length, start + CHUNK_SIZE)
    const slice = clean.slice(start, end)
    const chunk: Chunk = {
      id: `${sourceId}_chunk_${idx}`,
      sourceId,
      sourceName,
      text: slice,
      start,
      end
    }
    chunks.push(chunk)
    idx += 1
    if (end === clean.length) break
    start = Math.max(0, end - CHUNK_OVERLAP)
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
  episodeDate?: string
): SourceDoc {
  const docId = id || crypto.randomUUID()
  const chunks = chunkText(text, docId, name)
  const detectedType = documentType ?? detectDocumentType(text, name)
  const detectedDate = episodeDate ?? extractEpisodeDate(text)
  return { 
    id: docId, 
    name, 
    kind, 
    text, 
    chunks, 
    warnings, 
    error, 
    parser, 
    addedAt, 
    tag,
    documentType: detectedType,
    episodeDate: detectedDate
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

    docs.push(makeDocFromText(name, text, kind, undefined, warnings.length ? warnings : undefined, error, parser, Date.now(), tag))
  }
  return docs
}

export function mergeDocuments(docs: SourceDoc[]): Chunk[] {
  return docs.flatMap(d => d.chunks)
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
    episodeDate: d.episodeDate
  }))
}

export function restoreDocs(stored: StoredDoc[]): SourceDoc[] {
  return stored.map(s => makeDocFromText(
    s.name, 
    s.text, 
    s.kind, 
    s.id, 
    undefined, 
    undefined, 
    undefined, 
    s.addedAt || Date.now(), 
    s.tag || 'initial',
    (s as any).documentType,
    (s as any).episodeDate
  ))
}
