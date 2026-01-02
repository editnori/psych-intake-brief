import type { Chunk, SourceDoc } from './types'

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

export function rankEvidence(query: string, chunks: Chunk[], limit: number = 6): Chunk[] {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return chunks.slice(0, limit)

  const scored = chunks.map(chunk => {
    const tokens = tokenize(chunk.text)
    let score = 0
    for (const t of tokens) {
      if (qTokens.has(t)) score += 1
    }
    return { chunk, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.chunk)
}

export function rankEvidenceDiverse(
  query: string,
  chunks: Chunk[],
  limit: number = 8,
  options?: { includeUnmatchedSources?: boolean }
): Chunk[] {
  const includeUnmatched = options?.includeUnmatchedSources ?? false
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return chunks.slice(0, limit)

  const scored = chunks.map(chunk => {
    const tokens = tokenize(chunk.text)
    let score = 0
    for (const t of tokens) {
      if (qTokens.has(t)) score += 1
    }
    return { chunk, score }
  })

  const bySource = new Map<string, Array<{ chunk: Chunk; score: number }>>()
  for (const item of scored) {
    const list = bySource.get(item.chunk.sourceId) || []
    list.push(item)
    bySource.set(item.chunk.sourceId, list)
  }

  const picks: Array<{ chunk: Chunk; score: number }> = []
  for (const list of bySource.values()) {
    list.sort((a, b) => b.score - a.score)
    const top = list[0]
    if (top.score > 0 || includeUnmatched) {
      picks.push(top)
    }
  }

  const result: Chunk[] = []
  const used = new Set<string>()
  picks.sort((a, b) => b.score - a.score)
  for (const pick of picks) {
    if (result.length >= limit) break
    result.push(pick.chunk)
    used.add(pick.chunk.id)
  }

  scored.sort((a, b) => b.score - a.score)
  for (const item of scored) {
    if (result.length >= limit) break
    if (item.score <= 0) break
    if (used.has(item.chunk.id)) continue
    result.push(item.chunk)
  }

  return result
}

const DEFAULT_DOC_WEIGHTS: Record<string, number> = {
  'discharge-summary': 1.6,
  'psych-eval': 1.45,
  'progress-note': 1.25,
  'biopsychosocial': 1.2,
  'intake': 1.1,
  'other': 1.0
}

function resolveDocWeight(docType?: SourceDoc['documentType']): number {
  if (!docType) return 1
  return DEFAULT_DOC_WEIGHTS[docType] || 1
}

function parseEpisodeDate(value?: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) return parsed
  const m = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (!m) return null
  const month = Math.max(1, Math.min(12, parseInt(m[1], 10)))
  const day = Math.max(1, Math.min(31, parseInt(m[2], 10)))
  let year = parseInt(m[3], 10)
  if (year < 100) year += year >= 70 ? 1900 : 2000
  return Date.UTC(year, month - 1, day)
}

/**
 * Rank evidence chunks with document type weighting and recency boost.
 * 
 * Weighting strategy:
 * - docWeight from chunk (if available) or inferred from documentType
 * - Recency boost: newer documents get up to 0.35 extra score
 * - HPI prioritization: discharge summaries and psych evals weighted higher
 */
export function rankEvidenceWeighted(
  query: string,
  chunks: Chunk[],
  docs: SourceDoc[],
  limit: number = 8,
  options?: { 
    includeUnmatchedSources?: boolean
    prioritizeForHPI?: boolean
  }
): Chunk[] {
  const includeUnmatched = options?.includeUnmatchedSources ?? false
  const prioritizeForHPI = options?.prioritizeForHPI ?? false
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return chunks.slice(0, limit)

  const docMap = new Map(docs.map(d => [d.id, d]))
  const dates = docs
    .map(d => parseEpisodeDate(d.episodeDate))
    .filter((v): v is number => v !== null)
  const minDate = dates.length ? Math.min(...dates) : null
  const maxDate = dates.length ? Math.max(...dates) : null

  const scored = chunks.map(chunk => {
    const tokens = tokenize(chunk.text)
    let score = 0
    for (const t of tokens) {
      if (qTokens.has(t)) score += 1
    }

    const doc = docMap.get(chunk.sourceId)
    
    // Use chunk's docWeight if available, otherwise infer from documentType
    const weight = chunk.docWeight ?? resolveDocWeight(chunk.documentType || doc?.documentType)
    
    // Apply HPI prioritization if requested (extra boost for discharge summaries, psych evals)
    let hpiBoost = 0
    if (prioritizeForHPI) {
      const docType = chunk.documentType || doc?.documentType
      if (docType === 'discharge-summary') hpiBoost = 0.5
      else if (docType === 'psych-eval') hpiBoost = 0.4
      else if (docType === 'biopsychosocial') hpiBoost = 0.3
    }
    
    let recencyBoost = 0
    if (minDate !== null && maxDate !== null && maxDate !== minDate) {
      const d = parseEpisodeDate(chunk.episodeDate || doc?.episodeDate)
      if (d !== null) {
        recencyBoost = ((d - minDate) / (maxDate - minDate)) * 0.35
      }
    }

    return { chunk, score: score * weight + recencyBoost + hpiBoost }
  })

  const bySource = new Map<string, Array<{ chunk: Chunk; score: number }>>()
  for (const item of scored) {
    const list = bySource.get(item.chunk.sourceId) || []
    list.push(item)
    bySource.set(item.chunk.sourceId, list)
  }

  const picks: Array<{ chunk: Chunk; score: number }> = []
  for (const list of bySource.values()) {
    list.sort((a, b) => b.score - a.score)
    const top = list[0]
    if (top.score > 0 || includeUnmatched) {
      picks.push(top)
    }
  }

  const result: Chunk[] = []
  const used = new Set<string>()
  picks.sort((a, b) => b.score - a.score)
  for (const pick of picks) {
    if (result.length >= limit) break
    result.push(pick.chunk)
    used.add(pick.chunk.id)
  }

  scored.sort((a, b) => b.score - a.score)
  for (const item of scored) {
    if (result.length >= limit) break
    if (item.score <= 0) break
    if (used.has(item.chunk.id)) continue
    result.push(item.chunk)
  }

  return result
}
