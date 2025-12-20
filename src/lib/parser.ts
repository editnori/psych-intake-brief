import mammoth from 'mammoth/mammoth.browser'
import type { SourceDoc, Chunk, StoredDoc, AppSettings } from './types'
import { readPdfLocally, readPdfWithOpenAI } from './pdf'

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

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
  parser?: SourceDoc['parser']
): SourceDoc {
  const docId = id || crypto.randomUUID()
  const chunks = chunkText(text, docId, name)
  return { id: docId, name, kind, text, chunks, warnings, error, parser }
}

export async function loadFiles(files: File[], settings?: AppSettings): Promise<SourceDoc[]> {
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
          } catch (err: any) {
            warnings.push(err?.message || 'OpenAI PDF parsing failed, using local parser')
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

    docs.push(makeDocFromText(name, text, kind, undefined, warnings.length ? warnings : undefined, error, parser))
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
    text: d.text
  }))
}

export function restoreDocs(stored: StoredDoc[]): SourceDoc[] {
  return stored.map(s => makeDocFromText(s.name, s.text, s.kind, s.id))
}
