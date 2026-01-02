import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { PatientProfile, SourceDoc, TemplateSection, ChatThreads, OpenQuestion } from '../lib/types'
import { TEMPLATE_SECTIONS } from '../lib/template'

interface CaseState {
  id: string | null
  profile: PatientProfile
  docs: SourceDoc[]
  sections: TemplateSection[]
  chat: ChatThreads
  openQuestions: OpenQuestion[]
  lastGeneratedAt: number | null
  savedAt: number | null
}

const EMPTY_PROFILE: PatientProfile = {
  name: '',
  mrn: '',
  dob: '',
  sex: '',
  gender: '',
  pronouns: ''
}

const EMPTY_CHAT: ChatThreads = {
  ask: [],
  edit: []
}

interface CaseContextValue {
  state: CaseState
  setProfile: (profile: PatientProfile) => void
  setDocs: (docs: SourceDoc[]) => void
  setSections: (sections: TemplateSection[]) => void
  updateSection: (id: string, updates: Partial<TemplateSection>) => void
  setChat: (chat: ChatThreads) => void
  addChatMessage: (thread: 'ask' | 'edit', message: import('../lib/types').ChatMessage) => void
  setOpenQuestions: (questions: OpenQuestion[]) => void
  setLastGeneratedAt: (timestamp: number | null) => void
  setCaseId: (id: string | null) => void
  reset: () => void
}

const CaseContext = createContext<CaseContextValue | null>(null)

export function CaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaseState>({
    id: null,
    profile: EMPTY_PROFILE,
    docs: [],
    sections: TEMPLATE_SECTIONS.map(s => ({ ...s })),
    chat: EMPTY_CHAT,
    openQuestions: [],
    lastGeneratedAt: null,
    savedAt: null
  })

  const setProfile = useCallback((profile: PatientProfile) => {
    setState(prev => ({ ...prev, profile }))
  }, [])

  const setDocs = useCallback((docs: SourceDoc[]) => {
    setState(prev => ({ ...prev, docs }))
  }, [])

  const setSections = useCallback((sections: TemplateSection[]) => {
    setState(prev => ({ ...prev, sections }))
  }, [])

  const updateSection = useCallback((id: string, updates: Partial<TemplateSection>) => {
    setState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, ...updates } : s)
    }))
  }, [])

  const setChat = useCallback((chat: ChatThreads) => {
    setState(prev => ({ ...prev, chat }))
  }, [])

  const addChatMessage = useCallback((thread: 'ask' | 'edit', message: import('../lib/types').ChatMessage) => {
    setState(prev => ({
      ...prev,
      chat: {
        ...prev.chat,
        [thread]: [...prev.chat[thread], message]
      }
    }))
  }, [])

  const setOpenQuestions = useCallback((openQuestions: OpenQuestion[]) => {
    setState(prev => ({ ...prev, openQuestions }))
  }, [])

  const setLastGeneratedAt = useCallback((lastGeneratedAt: number | null) => {
    setState(prev => ({ ...prev, lastGeneratedAt }))
  }, [])

  const setCaseId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, id }))
  }, [])

  const reset = useCallback(() => {
    setState({
      id: null,
      profile: EMPTY_PROFILE,
      docs: [],
      sections: TEMPLATE_SECTIONS.map(s => ({ ...s })),
      chat: EMPTY_CHAT,
      openQuestions: [],
      lastGeneratedAt: null,
      savedAt: null
    })
  }, [])

  return (
    <CaseContext.Provider value={{
      state,
      setProfile,
      setDocs,
      setSections,
      updateSection,
      setChat,
      addChatMessage,
      setOpenQuestions,
      setLastGeneratedAt,
      setCaseId,
      reset
    }}>
      {children}
    </CaseContext.Provider>
  )
}

export function useCase(): CaseContextValue {
  const context = useContext(CaseContext)
  if (!context) {
    throw new Error('useCase must be used within CaseProvider')
  }
  return context
}

