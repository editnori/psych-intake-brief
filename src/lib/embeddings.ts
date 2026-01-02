import type { Chunk } from './types'

// Placeholder for future local embeddings integration.
// Returns null to signal fallback to lexical ranking.
export async function rankEvidenceSemantic(
  _query: string,
  _chunks: Chunk[],
  _limit: number = 8
): Promise<Chunk[] | null> {
  return null
}

export function isSemanticReady(): boolean {
  return false
}
