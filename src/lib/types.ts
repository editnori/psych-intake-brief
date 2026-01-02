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
  episodeId?: string
  docWeight?: number
}

export interface Chunk {
  id: string
  sourceId: string
  sourceName: string
  text: string
  start: number
  end: number
  documentType?: SourceDoc['documentType']
  episodeDate?: string
  docWeight?: number
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
  updateTags?: string[]
  lastUpdatedAt?: number
  audience?: 'all' | 'clinician-only'
  exportable?: boolean
  parentSection?: string
}

export interface PatientProfile {
  name: string
  mrn: string
  dob: string
  sex?: string
  gender?: string
  pronouns?: string
}

export type ServiceTier = 'standard' | 'flex' | 'batch' | 'priority'
export type DsmBadgeStyle = 'clinical' | 'compact'

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
  editApplyMode?: 'replace' | 'append' | 'set' | 'append-note' | 'append-note-after-questions' | 'open-question-answer' | 'update-card'
  editNoteDate?: string
  editNoteSource?: string
  editOpenQuestionId?: string
  editOpenQuestionText?: string
  editOpenQuestionRationale?: string
  reviewIssue?: string
  updateTag?: string
  updateSummary?: string
}

export interface ChatThreads {
  ask: ChatMessage[]
  edit: ChatMessage[]
}

export interface AppSettings {
  openaiApiKey: string
  model: string
  serviceTier: ServiceTier
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  verbosity: 'low' | 'medium' | 'high'
  pdfParser: 'local' | 'openai'
  pdfModel: string
  showOpenQuestions: boolean
  privacyMode: 'standard' | 'redact' | 'fragment'
  semanticSearch: boolean
  dsmBadgeStyle: DsmBadgeStyle
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
  chronologicalOrder?: number
  episodeId?: string
  docWeight?: number
}

export interface CaseState {
  id: string
  savedAt: number
  profile: PatientProfile
  docs: StoredDoc[]
  sections: Array<Pick<TemplateSection, 'id' | 'title' | 'guidance' | 'output' | 'citations' | 'hidden' | 'visibilityCondition' | 'clinicianOnly' | 'doNotCopyForward' | 'updateTags' | 'lastUpdatedAt' | 'audience' | 'exportable' | 'parentSection'>>
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
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

type PricingTier = ServiceTier
type PricingRates = { input: number; cachedInput?: number; output: number }

// Prices are USD per 1M tokens
export const MODEL_PRICING: Record<string, Partial<Record<PricingTier, PricingRates>>> = {
  'gpt-5.2': {
    batch: { input: 0.875, cachedInput: 0.0875, output: 7.0 },
    flex: { input: 0.875, cachedInput: 0.0875, output: 7.0 },
    standard: { input: 1.75, cachedInput: 0.175, output: 14.0 },
    priority: { input: 3.5, cachedInput: 0.35, output: 28.0 }
  },
  'gpt-5.1': {
    batch: { input: 0.625, cachedInput: 0.0625, output: 5.0 },
    flex: { input: 0.625, cachedInput: 0.0625, output: 5.0 },
    standard: { input: 1.25, cachedInput: 0.125, output: 10.0 },
    priority: { input: 2.5, cachedInput: 0.25, output: 20.0 }
  },
  'gpt-5': {
    batch: { input: 0.625, cachedInput: 0.0625, output: 5.0 },
    flex: { input: 0.625, cachedInput: 0.0625, output: 5.0 },
    standard: { input: 1.25, cachedInput: 0.125, output: 10.0 },
    priority: { input: 2.5, cachedInput: 0.25, output: 20.0 }
  },
  'gpt-5-mini': {
    batch: { input: 0.125, cachedInput: 0.0125, output: 1.0 },
    flex: { input: 0.125, cachedInput: 0.0125, output: 1.0 },
    standard: { input: 0.25, cachedInput: 0.025, output: 2.0 },
    priority: { input: 0.45, cachedInput: 0.045, output: 3.6 }
  },
  'gpt-5-nano': {
    batch: { input: 0.025, cachedInput: 0.0025, output: 0.2 },
    flex: { input: 0.025, cachedInput: 0.0025, output: 0.2 },
    standard: { input: 0.05, cachedInput: 0.005, output: 0.4 }
  },
  'gpt-4.1': {
    standard: { input: 2.0, cachedInput: 0.5, output: 8.0 },
    priority: { input: 3.5, cachedInput: 0.875, output: 14.0 },
    batch: { input: 1.0, output: 4.0 }
  },
  'gpt-4.1-mini': {
    standard: { input: 0.4, cachedInput: 0.1, output: 1.6 },
    priority: { input: 0.7, cachedInput: 0.175, output: 2.8 },
    batch: { input: 0.2, output: 0.8 }
  },
  'gpt-4.1-nano': {
    standard: { input: 0.1, cachedInput: 0.025, output: 0.4 },
    priority: { input: 0.2, cachedInput: 0.05, output: 0.8 },
    batch: { input: 0.05, output: 0.2 }
  },
  'gpt-4o': {
    standard: { input: 2.5, cachedInput: 1.25, output: 10.0 },
    priority: { input: 4.25, cachedInput: 2.125, output: 17.0 },
    batch: { input: 1.25, output: 5.0 }
  },
  'gpt-4o-mini': {
    standard: { input: 0.15, cachedInput: 0.075, output: 0.6 },
    priority: { input: 0.25, cachedInput: 0.125, output: 1.0 },
    batch: { input: 0.075, output: 0.3 }
  },
  'gpt-realtime': {
    standard: { input: 4.0, cachedInput: 0.4, output: 16.0 }
  },
  'gpt-realtime-mini': {
    standard: { input: 0.6, cachedInput: 0.06, output: 2.4 }
  }
} as const

export function calculateCost(
  usage: { input: number; cachedInput?: number; output: number },
  model: string = 'gpt-5.2',
  tier: ServiceTier = 'standard'
): number {
  const normalized = model.split(' ')[0].trim()
  const pricing = MODEL_PRICING[normalized] || MODEL_PRICING['gpt-5.2']
  const tierRates = pricing[tier] || pricing.standard || pricing.flex || pricing.batch || pricing.priority
  if (!tierRates) return 0
  const cached = Math.max(0, Math.min(usage.cachedInput || 0, usage.input))
  const billableInput = Math.max(0, usage.input - cached)
  const cachedRate = tierRates.cachedInput ?? tierRates.input
  const inputCost = (billableInput / 1_000_000) * tierRates.input
  const cachedCost = (cached / 1_000_000) * cachedRate
  const outputCost = (usage.output / 1_000_000) * tierRates.output
  return inputCost + cachedCost + outputCost
}
