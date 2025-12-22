import type { TemplateSection } from './types'

export interface DsmEntry {
  id: string
  title: string
  text: string
  keywords: string[]
}

// Clinical term synonyms/variants for better matching
const CLINICAL_SYNONYMS: Record<string, string[]> = {
  depression: ['mdd', 'major depressive', 'depressed', 'depressive episode', 'melancholic'],
  anxiety: ['gad', 'generalized anxiety', 'anxious', 'worry', 'panic'],
  bipolar: ['manic', 'mania', 'hypomanic', 'hypomania', 'bipolar i', 'bipolar ii', 'mood cycling'],
  psychosis: ['psychotic', 'hallucinations', 'delusions', 'paranoia', 'thought disorder'],
  ptsd: ['trauma', 'post-traumatic', 'posttraumatic', 'traumatic stress'],
  ocd: ['obsessive', 'compulsive', 'obsessions', 'compulsions', 'rituals'],
  adhd: ['attention deficit', 'hyperactivity', 'inattention', 'hyperactive'],
  autism: ['asd', 'autistic', 'spectrum', 'asperger'],
  schizophrenia: ['schizophrenic', 'schizoaffective', 'schizophreniform'],
  borderline: ['bpd', 'personality', 'emotional dysregulation', 'unstable'],
  substance: ['sud', 'addiction', 'dependence', 'use disorder', 'withdrawal', 'intoxication'],
  eating: ['anorexia', 'bulimia', 'binge', 'restricting', 'purging'],
  sleep: ['insomnia', 'hypersomnia', 'sleep disorder', 'circadian'],
  suicide: ['suicidal', 'si', 'self-harm', 'self-injury', 'suicidality'],
}

function stripHtml(line: string): string {
  return line.replace(/<[^>]+>/g, '')
}

function normalizeLine(line: string): string {
  return stripHtml(line).replace(/\s+/g, ' ').trim()
}

function looksLikeHeading(line: string): boolean {
  if (!line) return false
  if (line.length > 90) return false
  if (/diagnostic criteria/i.test(line)) return false
  if (/^[A-Z0-9\s&(),.\-]+$/.test(line) && line.length > 32) return false
  return /[A-Z]/.test(line) && /[a-z]/.test(line)
}

function findHeading(lines: string[], idx: number): string | null {
  for (let i = idx - 1; i >= 0 && idx - i <= 8; i -= 1) {
    const candidate = normalizeLine(lines[i] || '')
    if (looksLikeHeading(candidate)) return candidate
  }
  return null
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function extractClinicalKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  const keywords: string[] = []
  
  // Add tokens from the text
  keywords.push(...tokenize(text))
  
  // Add synonym expansions
  for (const [base, synonyms] of Object.entries(CLINICAL_SYNONYMS)) {
    if (lower.includes(base) || synonyms.some(s => lower.includes(s))) {
      keywords.push(base, ...synonyms)
    }
  }
  
  return [...new Set(keywords)]
}

export function buildDsmIndex(raw: string): DsmEntry[] {
  const lines = raw.split(/\r?\n/)
  const entries: DsmEntry[] = []
  const seen = new Set<string>()

  const stopRe = /^(Diagnostic Features|Associated Features|Prevalence|Development|Course|Risk and Prognostic|Culture-Related|Gender-Related|Differential Diagnosis|Comorbidity|Coding and Recording|Specifiers|Functional Consequences)/i

  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i] || '')
    if (!/diagnostic criteria/i.test(line)) continue

    const title = findHeading(lines, i)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue

    let buffer = ''
    let blanks = 0
    for (let j = i + 1; j < lines.length; j += 1) {
      const rawLine = normalizeLine(lines[j] || '')
      if (!rawLine) {
        blanks += 1
        if (blanks >= 2 && buffer.length > 0) break
        continue
      }
      blanks = 0
      if (stopRe.test(rawLine)) break
      if (looksLikeHeading(rawLine) && buffer.length > 0) break
      buffer += (buffer ? '\n' : '') + rawLine
      if (buffer.length > 2400) break
    }

    if (buffer.trim().length === 0) continue
    
    const keywords = extractClinicalKeywords(`${title} ${buffer}`)
    
    entries.push({
      id: `dsm_${entries.length + 1}`,
      title,
      text: buffer.trim(),
      keywords
    })
    seen.add(key)
  }

  return entries
}

export function rankDsmEntries(query: string, entries: DsmEntry[], limit: number = 6): DsmEntry[] {
  const queryLower = query.toLowerCase()
  const qTokens = new Set(tokenize(query))
  
  // Expand query with synonyms
  for (const [base, synonyms] of Object.entries(CLINICAL_SYNONYMS)) {
    if (queryLower.includes(base) || synonyms.some(s => queryLower.includes(s))) {
      qTokens.add(base)
      synonyms.forEach(s => {
        tokenize(s).forEach(t => qTokens.add(t))
      })
    }
  }
  
  if (qTokens.size === 0) return entries.slice(0, limit)

  const scored = entries.map(entry => {
    let score = 0
    const titleLower = entry.title.toLowerCase()
    const titleTokens = new Set(tokenize(entry.title))
    
    // Title matches weighted 3x
    for (const t of titleTokens) {
      if (qTokens.has(t)) score += 3
    }
    
    // Exact title substring match bonus
    for (const qt of qTokens) {
      if (titleLower.includes(qt)) score += 5
    }
    
    // Keyword/content matches
    for (const k of entry.keywords) {
      if (qTokens.has(k)) score += 1
    }
    
    // Boost for specific disorder mentions
    const disorderTerms = ['disorder', 'episode', 'syndrome', 'type']
    for (const dt of disorderTerms) {
      if (titleLower.includes(dt) && queryLower.includes(dt.slice(0, 4))) {
        score += 2
      }
    }
    
    return { entry, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.entry)
}

export function formatDsmEntries(entries: DsmEntry[]): string {
  return entries
    .map(e => `## ${e.title}\n\n**Diagnostic Criteria:**\n${e.text}`)
    .join('\n\n---\n\n')
}

export function buildDsmQuery(sections: TemplateSection[], limit: number = 2500): string {
  // Priority order for extracting diagnostic-relevant content
  const priorityIds = ['assessment', 'problem_list', 'dsm5_analysis', 'psych_ros', 'hpi', 'psychiatric_history']
  
  const ordered = [
    ...sections.filter(s => !s.hidden && priorityIds.includes(s.id)),
    ...sections.filter(s => !s.hidden && !priorityIds.includes(s.id))
  ]
  
  const parts = ordered
    .map(s => {
      const body = (s.output || '').trim()
      if (!body) return ''
      // Extract key clinical terms more aggressively
      const condensed = body
        .replace(/(?:\*\*)?\s*Open questions?\s*:?\s*(?:\*\*)?[\s\S]*$/i, '') // Remove open questions
        .replace(/(?:\*\*)?\s*Key highlights:\s*(?:\*\*)?[\s\S]*?\n\n/i, '') // Remove highlights header
        .trim()
      return condensed ? `${s.title}: ${condensed}` : ''
    })
    .filter(Boolean)
  
  const joined = parts.join('\n\n')
  return joined.length > limit ? joined.slice(0, limit) + '\n…' : joined
}
