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
  documentType?: 'discharge-summary' | 'psych-eval' | 'progress-note' | 'biopsychosocial' | 'intake' | 'other'
  episodeDate?: string
  chronologicalOrder?: number
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
  visibilityCondition?: 'always' | 'has-interview-notes' | 'clinician-only'
  clinicianOnly?: boolean
  doNotCopyForward?: boolean
}

export interface PatientProfile {
  name: string
  mrn: string
  dob: string
  sex?: string
  gender?: string
  pronouns?: string
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
  documentType?: SourceDoc['documentType']
  episodeDate?: string
}

export interface CaseState {
  id: string
  savedAt: number
  profile: PatientProfile
  docs: StoredDoc[]
  sections: Array<Pick<TemplateSection, 'id' | 'title' | 'guidance' | 'output' | 'citations' | 'hidden' | 'visibilityCondition' | 'clinicianOnly' | 'doNotCopyForward'>>
  chat: ChatThreads
  openQuestions?: OpenQuestion[]
  lastGeneratedAt?: number
}

export interface CaseSummary {
  id: string
  savedAt: number
  profile: PatientProfile
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

// GPT-5.2 pricing (estimated)
export const MODEL_PRICING = {
  'gpt-5.2': { input: 0.00001, output: 0.00003 }, // $0.01/1K input, $0.03/1K output
  'gpt-4o': { input: 0.0000025, output: 0.00001 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 }
} as const

export function calculateCost(usage: { prompt: number; completion: number }, model: string = 'gpt-5.2'): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || MODEL_PRICING['gpt-5.2']
  return (usage.prompt * pricing.input) + (usage.completion * pricing.output)
}
