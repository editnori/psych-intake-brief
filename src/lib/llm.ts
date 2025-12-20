import type { AppSettings, Chunk, Citation, TemplateSection } from './types'
import { extractOutputText, safeJsonParse } from './openaiHelpers'

export interface GeneratedSection {
  text: string
  citations: Citation[]
}

function settingsReady(settings: AppSettings): boolean {
  return Boolean(settings.openaiApiKey)
}

function buildEvidenceContext(chunks: Chunk[], maxChars: number = 5000): string {
  let total = 0
  const lines: string[] = []
  for (const chunk of chunks) {
    const entry = `[${chunk.id}] (${chunk.sourceName})\n${chunk.text.trim()}`
    total += entry.length
    if (total > maxChars) break
    lines.push(entry)
  }
  return lines.join('\n\n')
}

function extractJsonField(buffer: string, field: string, allowPartial: boolean = false): string | null {
  const key = `"${field}"`
  const idx = buffer.indexOf(key)
  if (idx < 0) return null
  const colon = buffer.indexOf(':', idx + key.length)
  if (colon < 0) return null
  let i = buffer.indexOf('"', colon)
  if (i < 0) return null
  i += 1
  let out = ''
  let escaped = false
  for (; i < buffer.length; i++) {
    const ch = buffer[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === '\\\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      return out
    }
    out += ch
  }
  return allowPartial ? out : null
}

function unescapeJsonString(input: string): string {
  return input
    .replace(/\\\\n/g, '\n')
    .replace(/\\\\t/g, '\t')
    .replace(/\\\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

async function streamResponse(
  response: Response,
  onChunk: (delta: string) => void
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.replace(/^data:\s*/, '')
      if (data === '[DONE]') return
      try {
        const event = JSON.parse(data)
        if (event?.type === 'response.output_text.delta') {
          onChunk(event.delta || '')
        }
      } catch {
        // Ignore parse errors for partial lines
      }
    }
  }
}

export async function generateSectionWithOpenAI(
  section: TemplateSection,
  evidence: Chunk[],
  settings: AppSettings,
  onDelta?: (text: string) => void
): Promise<GeneratedSection> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence)
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const instructions = `You are a clinical summarization assistant.\nReturn ONLY valid JSON.\nUse only provided evidence.\nIf evidence is insufficient, write a cautious summary and keep citations minimal.\nKeep keys ordered as: text, citations.`

  const user = `Section: ${section.title}\nGuidance: ${section.guidance}\n\nEvidence:\n${evidenceText}\n\nReturn JSON with keys:\n- text: string\n- citations: array of { chunkId, excerpt }`

  const jsonSchema = {
    type: 'json_schema',
    name: 'section_summary',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chunkId: { type: 'string' },
              excerpt: { type: 'string' }
            },
            required: ['chunkId', 'excerpt'],
            additionalProperties: false
          }
        }
      },
      required: ['text', 'citations'],
      additionalProperties: false
    }
  }

  const textFormat = model.startsWith('gpt-4o') ? jsonSchema : { type: 'json_object' }

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: {
      format: textFormat
    },
    max_output_tokens: 600,
    stream: Boolean(onDelta)
  }

  if (isGpt5) {
    if (settings.reasoningEffort !== 'none') {
      payload.reasoning = { effort: settings.reasoningEffort }
    }
    payload.text.verbosity = settings.verbosity
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`)
  }

  let content = ''
  if (onDelta) {
    let jsonBuffer = ''
    await streamResponse(response, (delta) => {
      jsonBuffer += delta
      const textFragment = extractJsonField(jsonBuffer, 'text', true)
      if (textFragment !== null) {
        onDelta(unescapeJsonString(textFragment))
      }
    })
    content = jsonBuffer
  } else {
    const data = await response.json()
    content = extractOutputText(data)
  }

  const parsed = safeJsonParse<{ text: string; citations: Array<{ chunkId: string; excerpt: string }> }>(content)

  if (!parsed) {
    throw new Error('Failed to parse model output')
  }

  const citations: Citation[] = parsed.citations.map(c => {
    const chunk = evidence.find(e => e.id === c.chunkId)
    return {
      sourceId: chunk?.sourceId || 'unknown',
      sourceName: chunk?.sourceName || 'unknown',
      chunkId: c.chunkId,
      excerpt: c.excerpt
    }
  })

  return { text: parsed.text, citations }
}

export function generateSectionLocally(section: TemplateSection, evidence: Chunk[]): GeneratedSection {
  if (evidence.length === 0) {
    return { text: section.placeholder || '', citations: [] }
  }

  const top = evidence[0]
  const excerpt = top.text.trim().slice(0, 260)
  return {
    text: `${section.placeholder ? section.placeholder + ' ' : ''}${excerpt}`.trim(),
    citations: [
      {
        sourceId: top.sourceId,
        sourceName: top.sourceName,
        chunkId: top.id,
        excerpt
      }
    ]
  }
}

export async function askWithOpenAI(
  question: string,
  evidence: Chunk[],
  settings: AppSettings
): Promise<GeneratedSection> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence)
  const model = settings.model || 'gpt-5.2'

  const instructions = `You are a clinical assistant. Answer the question using ONLY the provided evidence. Return ONLY valid JSON.`
  const user = `Question: ${question}\n\nEvidence:\n${evidenceText}\n\nReturn JSON with keys:\n- text: string\n- citations: array of { chunkId, excerpt }`

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: { format: { type: 'json_object' } },
    max_output_tokens: 400
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`)
  }

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = safeJsonParse<{ text: string; citations: Array<{ chunkId: string; excerpt: string }> }>(content)

  if (!parsed) {
    throw new Error('Failed to parse model output')
  }

  const citations: Citation[] = parsed.citations.map(c => {
    const chunk = evidence.find(e => e.id === c.chunkId)
    return {
      sourceId: chunk?.sourceId || 'unknown',
      sourceName: chunk?.sourceName || 'unknown',
      chunkId: c.chunkId,
      excerpt: c.excerpt
    }
  })

  return { text: parsed.text, citations }
}
