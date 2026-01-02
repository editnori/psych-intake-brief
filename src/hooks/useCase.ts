import { useCallback } from 'react'
import type { PatientProfile, SourceDoc, TemplateSection, ChatThreads, OpenQuestion } from '../lib/types'
import { loadCase, saveCase, listCases, deleteCase } from '../lib/caseStore'
import { restoreDocs, serializeDocs } from '../lib/parser'

interface UseCaseOptions {
  onLoad?: (caseId: string) => void
  onSave?: (caseId: string, savedAt: number) => void
  onDelete?: (caseId: string) => void
}

export function useCaseOperations(options: UseCaseOptions = {}) {
  const load = useCallback((caseId?: string) => {
    const result = loadCase(caseId)
    if (result && options.onLoad) {
      options.onLoad(result.id)
    }
    return result
  }, [options.onLoad])

  const save = useCallback((
    caseId: string | null,
    profile: PatientProfile,
    docs: SourceDoc[],
    sections: TemplateSection[],
    chat: ChatThreads,
    openQuestions: OpenQuestion[],
    lastGeneratedAt?: number
  ) => {
    const result = saveCase(caseId, profile, docs, sections, chat, openQuestions, lastGeneratedAt)
    if (options.onSave) {
      options.onSave(result.id, result.savedAt)
    }
    return result
  }, [options.onSave])

  const remove = useCallback((caseId: string) => {
    deleteCase(caseId)
    if (options.onDelete) {
      options.onDelete(caseId)
    }
  }, [options.onDelete])

  const list = useCallback(() => {
    return listCases()
  }, [])

  return { load, save, remove, list }
}

