import type { CaseState, PatientProfile, SourceDoc, TemplateSection, ChatMessage, CaseSummary } from './types'
import { serializeDocs, restoreDocs } from './parser'

const CASES_KEY = 'psych_intake_cases'
const LAST_CASE_KEY = 'psych_intake_last_case'

function readCases(): CaseState[] {
  try {
    const raw = localStorage.getItem(CASES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CaseState[]
  } catch {
    return []
  }
}

function writeCases(cases: CaseState[]): void {
  try {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases))
  } catch {
    // ignore storage failures
  }
}

export function listCases(): CaseSummary[] {
  return readCases()
    .map(c => ({
      id: c.id,
      savedAt: c.savedAt,
      profile: c.profile || { name: '', mrn: '', dob: '' }
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export function loadCase(caseId?: string): { id: string; profile: PatientProfile; docs: SourceDoc[]; sections: Array<Pick<TemplateSection, 'id' | 'output' | 'citations'>>; chat: ChatMessage[]; savedAt?: number } | null {
  try {
    const cases = readCases()
    if (cases.length === 0) return null
    const targetId = caseId || localStorage.getItem(LAST_CASE_KEY) || cases[0].id
    const parsed = cases.find(c => c.id === targetId)
    if (!parsed) return null
    const docs = restoreDocs(parsed.docs || [])
    return {
      id: parsed.id,
      profile: parsed.profile || { name: '', mrn: '', dob: '' },
      docs,
      sections: parsed.sections || [],
      chat: parsed.chat || [],
      savedAt: parsed.savedAt
    }
  } catch {
    return null
  }
}

export function saveCase(caseId: string | null, profile: PatientProfile, docs: SourceDoc[], sections: TemplateSection[], chat: ChatMessage[]): { savedAt: number; id: string } {
  const savedAt = Date.now()
  const id = caseId || crypto.randomUUID()
  const state: CaseState = {
    id,
    savedAt,
    profile,
    docs: serializeDocs(docs),
    sections: sections.map(s => ({ id: s.id, output: s.output, citations: s.citations })),
    chat
  }
  const cases = readCases()
  const idx = cases.findIndex(c => c.id === id)
  if (idx >= 0) cases[idx] = state
  else cases.push(state)
  writeCases(cases)
  try {
    localStorage.setItem(LAST_CASE_KEY, id)
  } catch {
    // ignore
  }
  return { savedAt, id }
}

export function deleteCase(caseId: string): void {
  const cases = readCases().filter(c => c.id !== caseId)
  writeCases(cases)
  try {
    const last = localStorage.getItem(LAST_CASE_KEY)
    if (last === caseId) {
      localStorage.removeItem(LAST_CASE_KEY)
    }
  } catch {
    // ignore
  }
}

export function clearAllCases(): void {
  try {
    localStorage.removeItem(CASES_KEY)
    localStorage.removeItem(LAST_CASE_KEY)
  } catch {
    // ignore
  }
}
