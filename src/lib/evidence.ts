import type { Chunk } from './types'

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
