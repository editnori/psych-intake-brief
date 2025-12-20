import type { AppSettings } from './types'
import { extractOutputText, safeJsonParse } from './openaiHelpers'

export interface PdfParseResult {
  text: string
  warnings?: string[]
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function readPdfLocally(file: File): Promise<PdfParseResult> {
  const warnings: string[] = []
  const buffer = await file.arrayBuffer()
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  let text = ''

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const raw = (content.items || [])
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
    const pageText = raw.replace(/\s+/g, ' ').trim()
    if (pageText) {
      text += `\n\n[Page ${pageNumber}]\n${pageText}`
    }
  }

  text = text.trim()
  if (!text) warnings.push('No text extracted (PDF may be scanned)')
  return { text, warnings: warnings.length ? warnings : undefined }
}

export async function readPdfWithOpenAI(file: File, settings: AppSettings): Promise<PdfParseResult> {
  if (!settings.openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  const warnings: string[] = []
  const buffer = await file.arrayBuffer()
  const sizeMb = buffer.byteLength / (1024 * 1024)
  if (sizeMb > 20) {
    warnings.push('Large PDF detected; extraction may be truncated')
  }

  const model = settings.pdfModel || 'gpt-4o-mini'
  const payload = {
    model,
    store: false,
    max_output_tokens: 3500,
    text: {
      format: { type: 'json_object' }
    },
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: file.name,
            file_data: bufferToBase64(buffer)
          },
          {
            type: 'input_text',
            text: 'Extract all readable text from the PDF. Return ONLY valid JSON with keys: text (string), truncated (boolean). Preserve headings and lists when possible. Add page markers like [Page 1]. If content is unreadable, return an empty string.'
          }
        ]
      }
    ]
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`OpenAI PDF parse error: ${response.status}`)
  }

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = safeJsonParse<{ text: string; truncated?: boolean }>(content)

  if (!parsed) {
    throw new Error('Failed to parse OpenAI PDF output')
  }

  const text = (parsed.text || '').trim()
  if (!text) warnings.push('No text extracted (PDF may be scanned)')
  if (parsed.truncated) warnings.push('OpenAI PDF extraction truncated; consider splitting the file')

  return { text, warnings: warnings.length ? warnings : undefined }
}
