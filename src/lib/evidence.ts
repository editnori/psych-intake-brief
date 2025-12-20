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
