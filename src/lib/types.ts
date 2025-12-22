export interface SourceDoc {
  id: string
  name: string
  kind: 'txt' | 'docx' | 'pdf' | 'unknown'
  parser?: 'local' | 'openai'
  tag?: 'initial' | 'followup'
  addedAt?: number
  text: string
  chunks: Chunk[]
  warnings?: string[]
  error?: string
}

export interface Chunk {
  id: string
  sourceId: string
  sourceName: string
  text: string
  start: number
  end: number
}

export interface Citation {
  sourceId: string
  sourceName: string
  chunkId: string
  excerpt: string
}

export interface TemplateSection {
  id: string
  title: string
  guidance: string
  output?: string
  citations?: Citation[]
  hidden?: boolean
}

export interface PatientProfile {
  name: string
  mrn: string
  dob: string
  sex?: string
}

export interface OpenQuestion {
  id: string
  sectionId: string
  sectionTitle: string
  text: string
  rationale?: string
  status: 'open' | 'answered' | 'resolved'
  answer?: string
  answerSourceNote?: string
  answerCitations?: Citation[]
  createdAt: number
  answeredAt?: number
  updatedAt?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: Citation[]
  createdAt: number
  contextLabel?: string
  contextSnippet?: string
  editStatus?: 'pending' | 'applied' | 'rejected'
  editTargetText?: string
  editTargetScope?: 'selection' | 'section'
  editSelectionText?: string
  editSectionId?: string
  editSectionTitle?: string
  editApplied?: boolean
  editApplyMode?: 'replace' | 'append' | 'set' | 'append-note' | 'append-note-after-questions' | 'open-question-answer'
  editNoteDate?: string
  editNoteSource?: string
  editOpenQuestionId?: string
  editOpenQuestionText?: string
  editOpenQuestionRationale?: string
  reviewIssue?: string
}

export interface ChatThreads {
  ask: ChatMessage[]
  edit: ChatMessage[]
}

export interface AppSettings {
  openaiApiKey: string
  model: string
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  verbosity: 'low' | 'medium' | 'high'
  pdfParser: 'local' | 'openai'
  pdfModel: string
  showOpenQuestions: boolean
}

export interface StoredDoc {
  id: string
  name: string
  kind: SourceDoc['kind']
  text: string
  tag?: SourceDoc['tag']
  addedAt?: number
}

export interface CaseState {
  id: string
  savedAt: number
  profile: PatientProfile
  docs: StoredDoc[]
  sections: Array<Pick<TemplateSection, 'id' | 'title' | 'guidance' | 'output' | 'citations' | 'hidden'>>
  chat: ChatThreads
  openQuestions?: OpenQuestion[]
  lastGeneratedAt?: number
}

export interface CaseSummary {
  id: string
  savedAt: number
  profile: PatientProfile
}
