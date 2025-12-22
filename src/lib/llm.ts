import type { AppSettings, Chunk, Citation, TemplateSection } from './types'
import { extractOutputText, safeJsonParse } from './openaiHelpers'

export interface GeneratedSection {
  text: string
  citations: Citation[]
}

export interface ReviewChange {
  sectionId: string
  revisedText: string
  issue: string
}

function settingsReady(settings: AppSettings): boolean {
  return Boolean(settings.openaiApiKey)
}

function buildEvidenceContext(chunks: Chunk[], maxChars: number = 10000): string {
  if (chunks.length === 0) return ''
  const entries = chunks.map(chunk => ({
    header: `[${chunk.id}] (${chunk.sourceName})\n`,
    text: chunk.text.trim()
  }))

  const full = entries.map(e => `${e.header}${e.text}`).join('\n\n')
  if (full.length <= maxChars) return full

  const perEntry = Math.max(200, Math.floor(maxChars / chunks.length))
  const trimmed = entries.map(e => {
    const budget = Math.max(80, perEntry - e.header.length)
    const body = e.text.length > budget ? `${e.text.slice(0, budget)}…` : e.text
    return `${e.header}${body}`
  })
  const joined = trimmed.join('\n\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) + '\n…' : joined
}

function extractJsonField(buffer: string, field: string, allowPartial: boolean = false): string | null {
  const doubleKey = `"${field}"`
  const singleKey = `'${field}'`
  let idx = buffer.indexOf(doubleKey)
  let keyLength = doubleKey.length
  if (idx < 0) {
    idx = buffer.indexOf(singleKey)
    keyLength = singleKey.length
  }
  if (idx < 0) return null
  const colon = buffer.indexOf(':', idx + keyLength)
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

function normalizeChunkId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function coerceCitationItems(raw: any): Array<{ chunkId: string; excerpt: string }> {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.flatMap((c: any) => {
    if (!c) return []
    if (typeof c === 'string') {
      const match = c.match(/([A-Za-z0-9_-]+_chunk_\d+)/)
      const chunkId = normalizeChunkId(match ? match[1] : c)
      if (!chunkId) return []
      return [{ chunkId, excerpt: '' }]
    }
    if (typeof c === 'object') {
      const chunkIdRaw =
        typeof c.chunkId === 'string'
          ? c.chunkId
          : typeof c.chunk_id === 'string'
            ? c.chunk_id
            : typeof c.id === 'string'
              ? c.id
              : typeof c.chunk === 'string'
                ? c.chunk
                : ''
      const chunkId = normalizeChunkId(chunkIdRaw || '')
      if (!chunkId) return []
      const excerpt =
        typeof c.excerpt === 'string'
          ? c.excerpt
          : typeof c.quote === 'string'
            ? c.quote
            : typeof c.text === 'string'
              ? c.text
              : ''
      return [{ chunkId, excerpt }]
    }
    return []
  })
}

function extractChunkIdsFromContent(content: string): string[] {
  const ids = new Set<string>()
  const bracketed = /\[([A-Za-z0-9_-]+_chunk_\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = bracketed.exec(content)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  if (ids.size === 0) {
    const bare = /([A-Za-z0-9_-]+_chunk_\d+)/g
    while ((match = bare.exec(content)) !== null) {
      if (match[1]) ids.add(match[1])
    }
  }
  return Array.from(ids)
}

type ModelPayload = { text: string; citations: Array<{ chunkId: string; excerpt: string }> }

function coerceModelPayload(content: string): ModelPayload {
  if (!content || !content.trim()) {
    return { text: '', citations: [] }
  }

  // Try standard JSON parse first
  const parsed = safeJsonParse<any>(content)
  if (parsed && typeof parsed === 'object') {
    const text =
      typeof parsed.text === 'string'
        ? parsed.text
        : typeof parsed.output === 'string'
          ? parsed.output
          : typeof parsed.answer === 'string'
            ? parsed.answer
            : typeof parsed.content === 'string'
              ? parsed.content
              : ''
    
    // Look for citations in multiple possible field names
    const citationSource =
      parsed.citations ??
      parsed.citation ??
      parsed.sources ??
      parsed.evidence ??
      parsed.references ??
      parsed.support ??
      []
    
    let citations = coerceCitationItems(citationSource)
    
    // Fallback: extract chunk IDs from the full content
    if (citations.length === 0) {
      const ids = extractChunkIdsFromContent(content)
      citations = ids.map(id => ({ chunkId: id, excerpt: '' }))
    }
    
    return { text: unescapeJsonString(text), citations }
  }

  // Fallback for incomplete JSON: try to extract text field
  const extracted = extractJsonField(content, 'text', true)
  if (extracted !== null) {
    const ids = extractChunkIdsFromContent(content)
    return { text: unescapeJsonString(extracted), citations: ids.map(id => ({ chunkId: id, excerpt: '' })) }
  }

  // Last resort: treat entire content as text
  const ids = extractChunkIdsFromContent(content)
  const cleanedContent = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  
  return { text: cleanedContent, citations: ids.map(id => ({ chunkId: id, excerpt: '' })) }
}

function mapCitations(
  items: Array<{ chunkId: string; excerpt: string }>,
  evidence: Chunk[]
): Citation[] {
  const seen = new Set<string>()
  const result: Citation[] = []
  
  for (const item of items) {
    const normalizedId = normalizeChunkId(item.chunkId || '')
    if (!normalizedId) continue
    
    // Find matching chunk (try exact match first, then partial match)
    let chunk = evidence.find(e => e.id === normalizedId)
    if (!chunk) {
      // Try case-insensitive match
      chunk = evidence.find(e => e.id.toLowerCase() === normalizedId.toLowerCase())
    }
    if (!chunk) {
      // Try partial match (chunk ID might be shortened)
      chunk = evidence.find(e => e.id.includes(normalizedId) || normalizedId.includes(e.id))
    }
    
    // Clean and format excerpt
    let excerpt = ''
    if (item.excerpt && item.excerpt.trim()) {
      excerpt = item.excerpt.trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .slice(0, 200) // Limit length
    } else if (chunk?.text) {
      // Generate excerpt from chunk text - take first meaningful sentence
      const sentences = chunk.text.split(/[.!?]+/)
      const firstSentence = sentences.find(s => s.trim().length > 20)
      excerpt = firstSentence
        ? firstSentence.trim().slice(0, 180) + (firstSentence.length > 180 ? '…' : '')
        : chunk.text.slice(0, 180) + (chunk.text.length > 180 ? '…' : '')
    }
    
    // Deduplicate by chunkId only (allow same chunk with different excerpts)
    if (seen.has(normalizedId)) continue
    seen.add(normalizedId)
    
    result.push({
      sourceId: chunk?.sourceId || 'unknown',
      sourceName: chunk?.sourceName || 'unknown',
      chunkId: normalizedId,
      excerpt
    })
  }
  
  return result
}

export function extractCitationsFromText(text: string, evidence: Chunk[]): Citation[] {
  if (!text || evidence.length === 0) return []
  const ids = new Set<string>()
  const bracketed = /\[([A-Za-z0-9_-]+_chunk_\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = bracketed.exec(text)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  if (ids.size === 0) {
    for (const chunk of evidence) {
      if (text.includes(chunk.id)) ids.add(chunk.id)
    }
  }
  const items = Array.from(ids).map(id => ({ chunkId: id, excerpt: '' }))
  return mapCitations(items, evidence)
}

interface StreamResult {
  content: string
  finished: boolean
}

async function streamResponse(
  response: Response,
  onTextDelta: (delta: string) => void
): Promise<StreamResult> {
  const reader = response.body?.getReader()
  if (!reader) return { content: '', finished: false }
  
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let fullContent = ''
  let finished = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.replace(/^data:\s*/, '')
        if (data === '[DONE]') {
          finished = true
          continue
        }
        
        try {
          const event = JSON.parse(data)
          // Handle different event types from the Responses API
          if (event?.type === 'response.output_text.delta') {
            const delta = event.delta || ''
            fullContent += delta
            onTextDelta(delta)
          } else if (event?.type === 'response.output_text.done') {
            // Final text - use this as authoritative content
            if (typeof event.text === 'string') {
              fullContent = event.text
            }
            finished = true
          } else if (event?.type === 'response.done') {
            finished = true
            // Extract final content from the response object if available
            if (event.response?.output_text) {
              fullContent = event.response.output_text
            }
          }
        } catch {
          // Ignore parse errors for malformed SSE data
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { content: fullContent, finished }
}

export async function generateSectionWithOpenAI(
  section: TemplateSection,
  evidence: Chunk[],
  settings: AppSettings,
  onDelta?: (text: string) => void,
  context?: string
): Promise<GeneratedSection> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence)
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const openQuestionsBlock = settings.showOpenQuestions ? `

Open questions (rare; only if essential):
Only if missing information would change diagnosis, risk level, or disposition, add at the end:

**Open questions:**
- Question? (Reason: clinical impact)

Rules for open questions:
- MAX 1 question per section
- Must be directly tied to the chief complaint/presenting problem or acute safety/risk
- Focus ONLY on: DSM-5 criteria gaps, chief-complaint clarification, or acute safety/risk data
- Skip demographics/metadata (age, DOB, gender, insurance, address)
- If documentation says "denies" or "unknown," that's an answer—don't re-ask
- Each question must specify how the answer would change assessment or plan` : ''

  const instructions = `Role: Clinical chart summarizer for psychiatric intake preparation.

Output: Valid JSON only. Keys: text, citations.

Writing style:
- Write as a psychiatrist preparing a colleague for patient interview
- Use active voice, direct statements, specific clinical terms
- Avoid: hedging phrases, meta-commentary, parallel structures, filler words
- Bad: "The patient presents with symptoms that appear to be consistent with..."
- Good: "Reports 2-week insomnia, anhedonia, passive SI without plan."
- No introductory phrases like "Based on the evidence" or "According to documentation"
- State facts directly; omit if unsupported

Section formatting:
- Do not repeat the section title
- Prefer short labeled lines (Label: content); keep labels minimal
- Use bullets only when the section guidance explicitly calls for a list
- Avoid nested lists and markdown headers (#)
- If the guidance includes \"Example:\", follow that format (do not copy verbatim)
- For symptom lists, use brief notation: "SI: passive, no plan; HI: denies"
- Dates format: MM/YYYY or "3 months ago" — avoid vague "recently"
- Medication format: Drug dose frequency (e.g., "Sertraline 100mg daily")
- Return the complete requested output only (no deltas, no commentary); if no update is warranted, return empty text and empty citations

Evidence rules:
- Every factual statement requires a citation
- Use chunkId exactly as shown in brackets (e.g., source_chunk_0)
- If no citation possible, omit the statement entirely
- Empty citations array → return empty text
- Excerpt: optional, ≤20 words, no quotes

Section boundaries:
- Do NOT repeat facts from other sections
- Follow section guidance exactly
- Each section covers distinct clinical territory${openQuestionsBlock}`

  const user = `Section: ${section.title}\nGuidance: ${section.guidance}\n\n${context ? `Other section summaries (for de-dup only; do NOT reuse or cite):\n${context}\n\n` : ''}Evidence:\n${evidenceText}\n\nReturn JSON with keys:\n- text: string\n- citations: array of { chunkId, excerpt }`

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
            required: ['chunkId'],
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
    max_output_tokens: 2000,
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
    let lastEmittedLength = 0
    
    const streamResult = await streamResponse(response, (delta) => {
      jsonBuffer += delta
      // Extract the text field from partial JSON and emit only new content
      const textFragment = extractJsonField(jsonBuffer, 'text', true)
      if (textFragment !== null) {
        const unescaped = unescapeJsonString(textFragment)
        // Only emit the new portion of text since last emit
        if (unescaped.length > lastEmittedLength) {
          const newText = unescaped.slice(lastEmittedLength)
          onDelta(newText)
          lastEmittedLength = unescaped.length
        }
      }
    })
    
    // Use final content from stream if available, otherwise use accumulated buffer
    content = streamResult.content || jsonBuffer
  } else {
    const data = await response.json()
    content = extractOutputText(data)
  }

  const parsed = coerceModelPayload(content)
  const citations = mapCitations(parsed.citations, evidence)

  return { text: parsed.text, citations }
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
  const evidenceText = buildEvidenceContext(evidence, 8000)
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const instructions = `Role: Clinical Q&A for chart review.

Rules:
- Answer using ONLY provided evidence
- Do NOT include chunk IDs in the text. Put evidence in the citations array only.
- Direct, clinical language — no hedging or filler
- Use "-" for bullets (avoid "*" or "•")
- If evidence insufficient: state "Insufficient evidence" then list 2-4 specific follow-up questions

Output: Valid JSON with keys: text, citations`
  const user = `Question: ${question}\n\nEvidence:\n${evidenceText}\n\nReturn JSON with keys: text, citations.`

  const jsonSchema = {
    type: 'json_schema',
    name: 'evidence_answer',
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
            required: ['chunkId'],
            additionalProperties: false
          }
        }
      },
      required: ['text', 'citations'],
      additionalProperties: false
    }
  }

  const textFormat = model.startsWith('gpt-4o') || model.startsWith('gpt-5')
    ? jsonSchema
    : { type: 'json_object' }

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: { format: textFormat },
    max_output_tokens: 400
  }

  if (isGpt5) {
    if (settings.reasoningEffort !== 'none') {
      payload.reasoning = { effort: settings.reasoningEffort }
    }
    payload.text.verbosity = settings.verbosity
  }

  const send = async (body: any) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify(body)
  })

  let response = await send(payload)
  if (!response.ok && response.status === 400) {
    const fallbackFormat = textFormat.type === 'json_object' ? jsonSchema : { type: 'json_object' }
    const fallbackPayload = { ...payload, text: { ...payload.text, format: fallbackFormat } }
    response = await send(fallbackPayload)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errText = await response.text()
      const parsed = safeJsonParse<any>(errText)
      detail = parsed?.error?.message || parsed?.message || errText
    } catch {
      detail = ''
    }
    const suffix = detail ? ` - ${detail}` : ''
    throw new Error(`OpenAI error: ${response.status}${suffix}`)
  }

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = coerceModelPayload(content)
  const citations = mapCitations(parsed.citations, evidence)

  return { text: parsed.text, citations }
}

export async function editWithOpenAI(
  request: string,
  targetText: string,
  context: string,
  evidence: Chunk[],
  settings: AppSettings,
  options?: { scope?: 'selection' | 'section' }
): Promise<GeneratedSection> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence, 8000)
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const scopeLine = options?.scope === 'selection'
    ? '- Return ONLY the revised excerpt (no labels, no extra sentences).'
    : '- Return the full revised target text.'

  const instructions = `Role: Clinical copy editor.

Rules:
- Revise ONLY the target text. ${scopeLine}
- Preserve meaning and structure unless the request requires change.
- Use ONLY provided evidence. Do not add new facts.
- If insufficient evidence to change, return the original target text unchanged.
- Do NOT include chunk IDs in the text. Put evidence in the citations array only.

Output: Valid JSON with keys: text, citations`

  const user = [
    `Edit request: ${request}`,
    `Target:\n"""\n${targetText}\n"""`,
    context ? `Context (for alignment only; do not rewrite):\n${context}` : '',
    `Evidence:\n${evidenceText}`,
    'Return JSON with keys: text, citations.'
  ].filter(Boolean).join('\n\n')

  const jsonSchema = {
    type: 'json_schema',
    name: 'edit_answer',
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
            required: ['chunkId'],
            additionalProperties: false
          }
        }
      },
      required: ['text', 'citations'],
      additionalProperties: false
    }
  }

  const textFormat = model.startsWith('gpt-4o') || model.startsWith('gpt-5')
    ? jsonSchema
    : { type: 'json_object' }

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: { format: textFormat },
    max_output_tokens: 400
  }

  if (isGpt5) {
    if (settings.reasoningEffort !== 'none') {
      payload.reasoning = { effort: settings.reasoningEffort }
    }
    payload.text.verbosity = settings.verbosity
  }

  const send = async (body: any) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify(body)
  })

  let response = await send(payload)
  if (!response.ok && response.status === 400) {
    const fallbackFormat = textFormat.type === 'json_object' ? jsonSchema : { type: 'json_object' }
    const fallbackPayload = { ...payload, text: { ...payload.text, format: fallbackFormat } }
    response = await send(fallbackPayload)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errText = await response.text()
      const parsed = safeJsonParse<any>(errText)
      detail = parsed?.error?.message || parsed?.message || errText
    } catch {
      detail = ''
    }
    const suffix = detail ? ` - ${detail}` : ''
    throw new Error(`OpenAI error: ${response.status}${suffix}`)
  }

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = coerceModelPayload(content)
  const citations = mapCitations(parsed.citations, evidence)

  return { text: parsed.text, citations }
}

export async function recoverCitationsWithOpenAI(
  text: string,
  evidence: Chunk[],
  settings: AppSettings
): Promise<Citation[]> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }
  if (!text.trim() || evidence.length === 0) return []

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence)
  const model = settings.model || 'gpt-5.2'

  const instructions = `Role: Citation recovery for clinical summary.

Task: Match statements in the summary to supporting evidence chunks.

Rules:
- Return chunkId for each supported statement
- Excerpt optional, ≤20 words
- Empty array if nothing can be cited

Output: Valid JSON with key: citations`
  const user = `Summary:\n${text}\n\nEvidence:\n${evidenceText}\n\nReturn JSON with key: citations.`

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: { format: { type: 'json_object' } },
    max_output_tokens: 300
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
  const parsed = coerceModelPayload(content)
  return mapCitations(parsed.citations, evidence)
}

export async function reviewSummaryWithOpenAI(
  sections: TemplateSection[],
  settings: AppSettings
): Promise<ReviewChange[]> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }

  const url = 'https://api.openai.com/v1/responses'
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const maxChars = 9000
  const body = sections
    .map(s => {
      const text = (s.output || '').trim() || '—'
      return `## ${s.id} | ${s.title}\n${text}`
    })
    .join('\n\n')
  const summary = body.length > maxChars ? body.slice(0, maxChars) + '\n…' : body

  const instructions = `Role: Attending psychiatrist reviewing intake summary for handoff.

Review for:
- Contradictions between sections
- Repeated facts or duplicate open questions
- Inconsistent risk/safety details
- Vague or hedging language that should be tightened

Edit rules:
- Minimal changes only — fix issues, don't rewrite
- Remove duplicates; keep info in the most appropriate section
- Never add new clinical facts
- Return full revised section text (not diffs)
- issue must be a 1-sentence rationale for the change (no chain-of-thought)
- Return empty array if no changes needed

Output: Valid JSON with key: changes (array of {sectionId, revisedText, issue})`

  const payload: any = {
    model,
    instructions,
    input: `Sections:\n${summary}\n\nReturn JSON now.`,
    store: false,
    text: { format: { type: 'json_object' } },
    max_output_tokens: 600
  }

  if (isGpt5) {
    payload.reasoning = { effort: 'xhigh' }
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

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = safeJsonParse<any>(content) || {}
  const changes = Array.isArray(parsed.changes)
    ? parsed.changes.filter((c: any) => c && typeof c.sectionId === 'string' && typeof c.revisedText === 'string')
    : []
  return changes.map((c: any) => ({
    sectionId: c.sectionId,
    revisedText: c.revisedText,
    issue: typeof c.issue === 'string'
      ? c.issue
      : typeof c.rationale === 'string'
        ? c.rationale
        : 'Review suggestion'
  }))
}

export interface OpenQuestionAnswerPayload {
  id: string
  text: string
  citations: Citation[]
}

export async function answerOpenQuestionsWithOpenAI(
  questions: Array<{ id: string; text: string }>,
  evidence: Chunk[],
  settings: AppSettings
): Promise<OpenQuestionAnswerPayload[]> {
  if (!settingsReady(settings)) {
    throw new Error('OpenAI API key not configured')
  }
  if (questions.length === 0) return []

  const url = 'https://api.openai.com/v1/responses'
  const evidenceText = buildEvidenceContext(evidence)
  const model = settings.model || 'gpt-5.2'
  const isGpt5 = model.startsWith('gpt-5')

  const instructions = `Role: Answer clinical questions from chart evidence.

Rules:
- Use ONLY provided evidence
- Cite each answer with chunkId
- If unsupported: "Insufficient evidence"
- Direct clinical language, no hedging

Output: Valid JSON with key: answers (array of {id, text, citations})`

  const list = questions.map(q => `- (${q.id}) ${q.text}`).join('\n')
  const user = `Questions:\n${list}\n\nEvidence:\n${evidenceText}\n\nReturn JSON now.`

  const payload: any = {
    model,
    instructions,
    input: user,
    store: false,
    text: { format: { type: 'json_object' } },
    max_output_tokens: 800
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

  const data = await response.json()
  const content = extractOutputText(data)
  const parsed = safeJsonParse<any>(content) || {}
  const answers = Array.isArray(parsed.answers) ? parsed.answers : []

  return answers
    .filter((a: any) => a && typeof a.id === 'string' && typeof a.text === 'string')
    .map((a: any) => {
      const citations = mapCitations(coerceCitationItems(a.citations), evidence)
      return { id: a.id, text: a.text, citations }
    })
}
