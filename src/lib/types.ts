export interface SourceDoc {
  id: string
  name: string
  kind: 'txt' | 'docx' | 'pdf' | 'unknown'
  parser?: 'local' | 'openai'
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
  placeholder?: string
  output?: string
  citations?: Citation[]
}

export interface PatientProfile {
  name: string
  mrn: string
  dob: string
  sex?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: Citation[]
  createdAt: number
}

export interface AppSettings {
  openaiApiKey: string
  model: string
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  verbosity: 'low' | 'medium' | 'high'
  pdfParser: 'local' | 'openai'
  pdfModel: string
}

export interface StoredDoc {
  id: string
  name: string
  kind: SourceDoc['kind']
  text: string
}

export interface CaseState {
  id: string
  savedAt: number
  profile: PatientProfile
  docs: StoredDoc[]
  sections: Array<Pick<TemplateSection, 'id' | 'output' | 'citations'>>
  chat: ChatMessage[]
}

export interface CaseSummary {
  id: string
  savedAt: number
  profile: PatientProfile
}
