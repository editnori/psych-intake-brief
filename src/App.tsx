import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Sparkles, RefreshCw, FileDown, Loader2, Plus, FolderOpen, Settings, Upload, ChevronRight, Quote, ArrowUp, MoreHorizontal, X, File, MessageSquare, Layers, BookOpen, Clock, ChevronUp, ChevronDown, Eye, EyeOff, Pencil, Lock, ClipboardCheck, AlertTriangle, BarChart3, Tag } from 'lucide-react'
import { TEMPLATE_SECTIONS } from './lib/template'
import type { AppSettings, SourceDoc, TemplateSection, PatientProfile, ChatMessage, ChatThreads, Chunk, OpenQuestion, Citation } from './lib/types'
import { loadFiles, mergeDocuments, makeDocFromText } from './lib/parser'
import { normalizeText, normalizeMarkdown, stripInlineChunkIds, formatProfile, normalizeLabelBold, normalizeListBlocks, cleanDisplayText } from './lib/textUtils'
import { rankEvidenceDiverse, rankEvidenceWeighted } from './lib/evidence'
import { rankEvidenceSemantic, isSemanticReady } from './lib/embeddings'
import { generateSectionWithOpenAI, askWithOpenAI, editWithOpenAI, reviewSummaryWithOpenAI, answerOpenQuestionsWithOpenAI, recoverCitationsWithOpenAI, extractCitationsFromText, onTokenUsage, reviewForAttending, AttendingReviewIssue } from './lib/llm'
import { calculateCost } from './lib/types'
import { buildDsmIndex, rankDsmEntries, formatDsmEntries, buildDsmQuery } from './lib/dsm'
import { loadSettings, saveSettings } from './lib/storage'
import { loadCase, saveCase, deleteCase, listCases } from './lib/caseStore'
import { createEmptyThreads } from './lib/chatStore'
import { exportDocx, exportPdf } from './lib/exporters'
import { SettingsModal } from './components/SettingsModal'
import { FilePreviewModal } from './components/FilePreviewModal'
import { Markdown } from './components/Markdown'
import { DiffView } from './components/DiffView'
import { UsagePanel } from './components/UsagePanel'
import { IssuesPanel } from './components/IssuesPanel'
import { ToastContainer, useToast } from './components/Toast'

const MAX_OPEN_QUESTIONS_PER_SECTION = 1
const DEMOGRAPHIC_QUESTION_PATTERNS = [
  /\bdate of birth\b/i,
  /\bdob\b/i,
  /\bbirth\s?date\b/i,
  /\bmrn\b/i,
  /\bssn\b/i,
  /\binsurance\b/i,
  /\baddress\b/i,
  /\bphone\b/i,
  /\bemail\b/i,
  /\bemergency contact\b/i,
  /\bgender\b/i,
  /\bsex\b/i,
  /\brace\b/i,
  /\bethnicity\b/i,
  /\bmarital status\b/i,
  /\bhow old\b/i,
  /\bcurrent age\b/i
]

export function App() {
  type DisplayMessage = ChatMessage & { mode: 'ask' | 'edit'; isTyping?: boolean }

  const [docs, setDocs] = useState<SourceDoc[]>([])
  const [sections, setSections] = useState<TemplateSection[]>(TEMPLATE_SECTIONS)
  const [selectedId, setSelectedId] = useState<string>(TEMPLATE_SECTIONS[0]?.id || '')
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [profile, setProfile] = useState<PatientProfile>({ name: '', mrn: '', dob: '' })
  const [chatThreads, setChatThreads] = useState<ChatThreads>(() => createEmptyThreads())
  const [chatMode, setChatMode] = useState<'auto' | 'ask' | 'edit'>('auto')
  const [activePanel, setActivePanel] = useState<'evidence' | 'chat' | 'template' | 'followup' | 'usage' | 'issues'>('chat')
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [includeChatInExport, setIncludeChatInExport] = useState(false)
  const [includeClinicianOnly, setIncludeClinicianOnly] = useState(true)
  const [includeAppendix, setIncludeAppendix] = useState(false)
  const [includeOpenQuestions, setIncludeOpenQuestions] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [cases, setCases] = useState<Array<{ id: string; savedAt: number; profile: PatientProfile }>>([])
  const [actionsOpen, setActionsOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [selectionSnippet, setSelectionSnippet] = useState<{ text: string; sectionId: string } | null>(null)
  const [evidenceContext, setEvidenceContext] = useState<{ sourceName: string; excerpt: string } | null>(null)
  const [previewDoc, setPreviewDoc] = useState<SourceDoc | null>(null)
  const { toasts, addToast, dismissToast } = useToast()
  const documentRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<TemplateSection[]>(sections)
  const dsmIndexRef = useRef<ReturnType<typeof buildDsmIndex> | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const lastFollowupLabelRef = useRef('')
  const [chatLoading, setChatLoading] = useState(false)
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({})
  const [reviewingSummary, setReviewingSummary] = useState(false)
  const [openQuestions, setOpenQuestions] = useState<OpenQuestion[]>([])
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null)
  const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({})
  const [streamingPreviews, setStreamingPreviews] = useState<Record<string, string>>({})
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [followupAnswerDrafts, setFollowupAnswerDrafts] = useState<Record<string, string>>({})
  const [followupSourceDrafts, setFollowupSourceDrafts] = useState<Record<string, string>>({})
  const [manualFollowupSources, setManualFollowupSources] = useState<Record<string, boolean>>({})
  const [postInterviewManualSource, setPostInterviewManualSource] = useState(false)
  const [postInterviewDraft, setPostInterviewDraft] = useState(() => ({
    sectionId: TEMPLATE_SECTIONS[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    text: '',
    source: ''
  }))
  const [postInterviewBusy, setPostInterviewBusy] = useState(false)
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)
  const [tokenUsage, setTokenUsage] = useState({ input: 0, cached: 0, output: 0, cost: 0 })
  const [usageEvents, setUsageEvents] = useState<Array<{
    id: string
    label: string
    rawLabel?: string
    input: number
    cached: number
    output: number
    total: number
    model: string
    tier: AppSettings['serviceTier']
    cost: number
    createdAt: number
  }>>([])
  const [editScope, setEditScope] = useState<'section' | 'selection'>('section')
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [attendingReviewIssues, setAttendingReviewIssues] = useState<AttendingReviewIssue[]>([])
  const hasAttendingIssues = attendingReviewIssues.length > 0
  const [runningAttendingReview, setRunningAttendingReview] = useState(false)

  const OPEN_QUESTION_RULES =
    'Open questions are optional and rare. Only ask if missing information would change diagnosis, risk, or disposition, and the question must directly relate to the chief complaint/presenting problem. Limit to 1 question per section. Avoid demographics/metadata (age, DOB, gender, insurance, address). Format exactly:\n**Open questions:**\n- Question? (Reason: ...)'

  useEffect(() => {
    setModeMenuOpen(false)
  }, [chatMode, activePanel])

  // Track token usage from API calls
  useEffect(() => {
    const unsubscribe = onTokenUsage((usage) => {
      const input = usage.promptTokens || 0
      const cached = usage.cachedPromptTokens || 0
      const output = usage.completionTokens || 0
      const total = usage.totalTokens || input + output
      const tier = usage.tier || 'standard'
      const eventCost = calculateCost({ input, cachedInput: cached, output }, usage.model, tier)
      const label = formatUsageLabel(usage.label)
      setTokenUsage(prev => ({
        input: prev.input + input,
        cached: prev.cached + cached,
        output: prev.output + output,
        cost: prev.cost + eventCost
      }))
      setUsageEvents(prev => [
        {
          id: crypto.randomUUID(),
          label,
          rawLabel: usage.label,
          input,
          cached,
          output,
          total,
          model: usage.model,
          tier,
          cost: eventCost,
          createdAt: Date.now()
        },
        ...prev
      ].slice(0, 75))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    setExpandedCitations({})
  }, [selectedId])

  useEffect(() => {
    setEditingSectionId(null)
  }, [selectedId])

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  useEffect(() => {
    if (selectionSnippet) {
      setEditScope('section')
    }
  }, [selectionSnippet?.text, selectionSnippet?.sectionId])

  useEffect(() => {
    const el = chatInputRef.current
    if (!el) return
    const maxHeight = 360
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [chatInput])

  useEffect(() => {
    if (!hydrated) return
    if (!settings.showOpenQuestions) return
    if (Object.keys(generatingIds).length > 0) return
    const extracted = extractOpenQuestionsFromSections(sections)
    setOpenQuestions(prev => mergeOpenQuestions(prev, extracted))
  }, [sections, hydrated, generatingIds, settings.showOpenQuestions])


  const allChunks = useMemo(() => mergeDocuments(docs), [docs])
  const hasCaseContent = useMemo(() => {
    if (docs.length > 0) return true
    if (chatThreads.ask.length > 0 || chatThreads.edit.length > 0) return true
    if (profile.name || profile.mrn || profile.dob || profile.sex || profile.gender || profile.pronouns) return true
    if (openQuestions.length > 0) return true
    return sections.some(s => Boolean(s.output && s.output.trim()))
  }, [docs.length, chatThreads.ask.length, chatThreads.edit.length, profile, openQuestions.length, sections])

  const selectedSection = useMemo(
    () => sections.find(s => s.id === selectedId) || null,
    [sections, selectedId]
  )

  const hasInterviewNotes = useMemo(() => docs.some(d => d.tag === 'followup'), [docs])
  
  const visibleSections = useMemo(
    () => sections.filter(s => {
      if (s.hidden) return false
      if (s.visibilityCondition === 'has-interview-notes' && !hasInterviewNotes) return false
      return true
    }),
    [sections, hasInterviewNotes]
  )

  useEffect(() => {
    if (!postInterviewDraft.sectionId) {
      setPostInterviewDraft(prev => ({ ...prev, sectionId: visibleSections[0]?.id || '' }))
      return
    }
    const exists = visibleSections.some(section => section.id === postInterviewDraft.sectionId)
    if (!exists) {
      setPostInterviewDraft(prev => ({ ...prev, sectionId: visibleSections[0]?.id || '' }))
    }
  }, [postInterviewDraft.sectionId, visibleSections])

  const sourceCount = useMemo(() => {
    const ids = new Set(allChunks.map(c => c.sourceId))
    return ids.size
  }, [allChunks])

  const completedSections = useMemo(
    () => visibleSections.filter(s => s.output && s.output.trim()).length,
    [visibleSections]
  )

  const hasNewDocs = useMemo(() => {
    if (docs.length === 0) return false
    if (!lastGeneratedAt) return true
    return docs.some(d => (d.addedAt || 0) > lastGeneratedAt)
  }, [docs, lastGeneratedAt])

  const followupDocs = useMemo(() => docs.filter(d => d.tag === 'followup'), [docs])
  const followupDocIds = useMemo(() => new Set(followupDocs.map(doc => doc.id)), [followupDocs])
  const followupSourceLabel = useMemo(
    () => followupDocs.map(doc => doc.name).filter(Boolean).join(', '),
    [followupDocs]
  )
  const followupSourceNote = useMemo(
    () => (followupSourceLabel ? followupSourceLabel : ''),
    [followupSourceLabel]
  )

  const openQuestionCounts = useMemo(() => {
    const open = openQuestions.filter(q => q.status === 'open').length
    const answered = openQuestions.filter(q => q.status === 'answered').length
    return { open, answered }
  }, [openQuestions])

  const pendingFollowupEdits = useMemo(
    () => chatThreads.edit.filter(msg =>
      msg.editStatus === 'pending'
      && (msg.editApplyMode === 'append-note' || msg.editApplyMode === 'open-question-answer' || msg.editApplyMode === 'update-card')
    ),
    [chatThreads.edit]
  )
  const pendingFollowupCount = pendingFollowupEdits.length

  const orderedOpenQuestions = useMemo(() => {
    const order = { open: 0, answered: 1, resolved: 2 } as const
    return openQuestions.filter(q => q.status !== 'resolved').sort((a, b) => {
      const rank = (order[a.status] ?? 3) - (order[b.status] ?? 3)
      if (rank !== 0) return rank
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    })
  }, [openQuestions])

  useEffect(() => {
    if (selectedSection?.hidden && visibleSections.length > 0) {
      setSelectedId(visibleSections[0].id)
    }
  }, [selectedSection?.hidden, visibleSections])

  useEffect(() => {
    const prevLabel = lastFollowupLabelRef.current
    lastFollowupLabelRef.current = followupSourceLabel
    if (!followupSourceLabel || postInterviewManualSource) return
    setPostInterviewDraft(prev => {
      const current = prev.source.trim()
      if (!current || current === prevLabel) {
        return { ...prev, source: followupSourceLabel }
      }
      return prev
    })
  }, [followupSourceLabel, postInterviewManualSource])
  const profileLine = useMemo(() => formatProfile(profile), [profile])
  const sectionDisplayMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of sections) {
      const streamingPreview = streamingPreviews[section.id]
      const rawText = typeof streamingPreview === 'string' ? streamingPreview : (section.output || '')
      map.set(section.id, formatSectionDisplayText(rawText, section.id))
    }
    return map
  }, [sections, streamingPreviews])

  const allChatMessages = useMemo(() => {
    const merged = [...chatThreads.ask, ...chatThreads.edit]
    return merged.sort((a, b) => a.createdAt - b.createdAt)
  }, [chatThreads])

  const displayMessages = useMemo<DisplayMessage[]>(() => {
    const merged = [
      ...chatThreads.ask.map(msg => ({ ...msg, mode: 'ask' as const })),
      ...chatThreads.edit.map(msg => ({ ...msg, mode: 'edit' as const }))
    ]
    return merged.sort((a, b) => a.createdAt - b.createdAt)
  }, [chatThreads])

  const messagesToRender = useMemo<DisplayMessage[]>(() => {
    if (!chatLoading) return displayMessages
    return [
      ...displayMessages,
      {
        id: 'typing',
        role: 'assistant',
        text: '',
        citations: [],
        createdAt: Date.now(),
        mode: chatMode === 'auto' ? 'ask' : chatMode,
        isTyping: true
      }
    ]
  }, [displayMessages, chatLoading, chatMode])

  const pendingEditsBySection = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const msg of chatThreads.edit) {
      if (msg.editStatus !== 'pending' || !msg.editSectionId) continue
      const existing = map.get(msg.editSectionId)
      if (!existing || msg.createdAt > existing.createdAt) {
        map.set(msg.editSectionId, msg)
      }
    }
    return map
  }, [chatThreads.edit])

  const canSend = Boolean(chatInput.trim()) && !chatLoading && !(chatMode === 'edit' && !selectedSection && !selectionSnippet)


  // Text utilities imported from lib/textUtils

  function isDemographicQuestion(text: string): boolean {
    return DEMOGRAPHIC_QUESTION_PATTERNS.some(pattern => pattern.test(text))
  }

  type OpenQuestionBlockItem = { text: string; rationale?: string; answer?: string }

  function allowOpenQuestionsForSection(sectionId: string): boolean {
    if (!sectionId) return false
    return settings.showOpenQuestions
  }

  function normalizeQuestionKey(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  }

  function parseOpenQuestionsBlock(text: string): { before: string; items: OpenQuestionBlockItem[]; rest: string } | null {
    if (!text) return null
    const match = text.match(/(?:\*\*)?\s*open\s+questions?\s*:?\s*(?:\*\*)?/i)
    if (!match || match.index == null) return null
    const idx = match.index
    const before = text.slice(0, idx).trimEnd()
    const after = text.slice(idx + match[0].length)
    const parts = after.split(/\n\s*\n/)
    const block = parts[0] || ''
    const rest = parts.slice(1).join('\n\n')
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    const items: OpenQuestionBlockItem[] = []
    let current: OpenQuestionBlockItem | null = null
    for (const line of lines) {
      const cleaned = line.replace(/^[-*•–—−‒\d\).]+\s*/, '').trim()
      if (!cleaned) continue
      const answerMatch = cleaned.match(/^answer\s*:\s*(.+)$/i)
      if (answerMatch) {
        if (current) {
          current.answer = answerMatch[1].trim()
        }
        continue
      }
      const standaloneRationale = cleaned.match(/^\(?\s*(reason|rationale):\s*([^)]+?)\s*\)?$/i)
      if (standaloneRationale && current) {
        current.rationale = standaloneRationale[2].trim()
        continue
      }
      const rationaleMatch = cleaned.match(/\(?\s*(reason|rationale):\s*([^)]+?)\s*\)?\s*$/i)
      const rawQuestion = rationaleMatch ? cleaned.replace(rationaleMatch[0], '') : cleaned
      const question = rawQuestion.replace(/^[*_]+|[*_]+$/g, '').trim()
      if (!question) continue
      const rationale = rationaleMatch ? rationaleMatch[2].trim() : undefined
      current = { text: question, rationale }
      items.push(current)
    }
    return { before, items, rest }
  }

  function normalizeOpenQuestionsBlock(text: string): string {
    if (!text) return text
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed) return text
    const { before, items, rest } = parsed
    if (items.length === 0) return text
    const normalized = formatOpenQuestionsBlock(items)
    return [before, normalized, rest.trim()].filter(Boolean).join('\n\n')
  }

  function moveOpenQuestionsToEnd(text: string): string {
    if (!/open\s+questions?\s*:?/i.test(text)) return text
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return text
    const base = stripOpenQuestionsBlock(text)
    const block = formatOpenQuestionsBlock(parsed.items)
    const postInterviewMatch = base.match(/(?:^|\n)\s*(?:\*\*)?\s*(?:post[- ]interview notes?|updates?)(?:\s*\([^)]*\))?:?(?:\*\*)?/i)
    if (!postInterviewMatch || postInterviewMatch.index == null) {
      return [base.trim(), block].filter(Boolean).join('\n\n')
    }
    const idx = postInterviewMatch.index
    const before = base.slice(0, idx).trimEnd()
    const after = base.slice(idx).trimStart()
    return [before, block, after].filter(Boolean).join('\n\n')
  }

  function stripOpenQuestionsBlock(text: string): string {
    if (!text) return text
    const match = text.match(/(?:\*\*)?\s*open\s+questions?\s*:?\s*(?:\*\*)?/i)
    if (!match || match.index == null) return text
    const idx = match.index
    const before = text.slice(0, idx).trimEnd()
    const after = text.slice(idx + match[0].length)
    const parts = after.split(/\n\s*\n/)
    const rest = parts.slice(1).join('\n\n').trim()
    return [before, rest].filter(Boolean).join('\n\n')
  }

  function replaceOpenQuestionsBlock(text: string, block: string): string {
    if (!text) return text
    const match = text.match(/(?:\*\*)?\s*open\s+questions?\s*:?\s*(?:\*\*)?/i)
    if (!match || match.index == null) return text
    const idx = match.index
    const before = text.slice(0, idx).trimEnd()
    const after = text.slice(idx + match[0].length)
    const parts = after.split(/\n\s*\n/)
    const rest = parts.slice(1).join('\n\n').trim()
    return [before, block, rest].filter(Boolean).join('\n\n')
  }

  function normalizeAnswerText(answer: string): string {
    const cleaned = normalizeText(answer).replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''
    return cleaned.replace(/^answer\s*:\s*/i, '').trim()
  }

  function normalizeSelectionReplacement(text: string, target: string): string {
    let out = (text || '').trim()
    if (!out) return ''
    out = out.replace(/^["'“”]+/, '').replace(/["'“”]+$/, '')
    out = out.replace(/^\s*[-*•]\s+/gm, '')
    if (!/\n/.test(target)) {
      out = out.replace(/\s*\n\s*/g, ' ')
    }
    out = out.replace(/\s{2,}/g, ' ')
    return out.trim()
  }

  function formatOpenQuestionsBlock(items: OpenQuestionBlockItem[]): string {
    if (items.length === 0) return ''
    const lines = items.map(item => {
      const rationale = item.rationale ? ` (Reason: ${item.rationale})` : ''
      const answer = item.answer ? `\n  Answer: ${item.answer}` : ''
      return `- ${item.text}${rationale}${answer}`
    })
    return ['**Open questions:**', ...lines].join('\n')
  }

  function formatPostInterviewNoteBlock(note: string, date: string, sourceNote?: string): string {
    const cleaned = note.trim()
    if (!cleaned) return ''
    const safeDate = date || new Date().toISOString().slice(0, 10)
    const lines = cleaned
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
    const body = lines.length > 0
      ? lines.map(line => `- ${line}`)
      : [`- ${cleaned}`]
    if (sourceNote) {
      body.push(`- Source: ${sourceNote}`)
    }
    return [`**Update (${safeDate}):**`, ...body].join('\n')
  }

  function applyOpenQuestionAnswerToText(text: string, questionText: string, answerText: string): string {
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return text
    const target = normalizeQuestionKey(questionText)
    const cleanedAnswer = normalizeAnswerText(answerText)
    if (!cleanedAnswer) return text
    const updated = parsed.items.map(item => (
      normalizeQuestionKey(item.text) === target
        ? { ...item, answer: cleanedAnswer }
        : item
    ))
    const rebuilt = formatOpenQuestionsBlock(updated)
    return replaceOpenQuestionsBlock(text, rebuilt)
  }

  function clearOpenQuestionAnswerInText(text: string, questionText: string): string {
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return text
    const target = normalizeQuestionKey(questionText)
    let changed = false
    const updated = parsed.items.map(item => {
      if (normalizeQuestionKey(item.text) !== target) return item
      if (!item.answer) return item
      changed = true
      return { ...item, answer: undefined }
    })
    if (!changed) return text
    const rebuilt = formatOpenQuestionsBlock(updated)
    return replaceOpenQuestionsBlock(text, rebuilt)
  }

  function removeOpenQuestionFromText(text: string, questionText: string): string {
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return text
    const target = normalizeQuestionKey(questionText)
    const remaining = parsed.items.filter(item => normalizeQuestionKey(item.text) !== target)
    if (remaining.length === parsed.items.length) return text
    if (remaining.length === 0) return stripOpenQuestionsBlock(text)
    const rebuilt = formatOpenQuestionsBlock(remaining)
    return replaceOpenQuestionsBlock(text, rebuilt)
  }

  function buildOpenQuestionsPreview(text: string): string | null {
    if (!/open\s+questions?\s*:?/i.test(text)) return null
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return null
    return formatOpenQuestionsBlock(parsed.items)
  }

  function buildOpenQuestionAnswerBlock(
    questionText: string,
    rationale?: string,
    answer?: string
  ): string {
    if (!questionText.trim()) return ''
    const item: OpenQuestionBlockItem = {
      text: questionText.trim(),
      rationale: rationale?.trim() || undefined,
      answer: answer ? normalizeAnswerText(answer) : undefined
    }
    return formatOpenQuestionsBlock([item])
  }

  function appendPostInterviewNoteAtEnd(text: string, noteBlock: string): string {
    const cleaned = text.trim()
    if (!cleaned) return noteBlock
    const spacer = cleaned.endsWith('\n\n')
      ? ''
      : cleaned.endsWith('\n')
        ? '\n'
        : '\n\n'
    return `${cleaned}${spacer}${noteBlock}`
  }

  function insertBeforeOpenQuestionsBlock(text: string, insert: string, sectionId: string): string {
    const hasHeader = /open\s+questions?\s*:?/i.test(text)
    const parsed = parseOpenQuestionsBlock(text)
    const extracted = parsed?.items || []
    const base = hasHeader && extracted.length > 0 ? stripOpenQuestionsBlock(text) : text
    const merged = [base, insert].map(part => (part || '').trim()).filter(Boolean).join('\n\n')
    const withOpen = hasHeader && extracted.length > 0
      ? [merged, formatOpenQuestionsBlock(extracted)].filter(Boolean).join('\n\n')
      : merged
    return formatSectionText(withOpen, sectionId)
  }

  function normalizeHighlightsBlock(text: string): string {
    if (!text) return text
    const match = text.match(/(?:\*\*)?\s*key highlights?:\s*(?:\*\*)?/i)
    if (!match || match.index == null) return text
    const idx = match.index
    const before = text.slice(0, idx).trimEnd()
    const after = text.slice(idx + match[0].length)
    const parts = after.split(/\n\s*\n/)
    const block = parts[0] || ''
    const rest = parts.slice(1).join('\n\n')
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    const hasExplicitList = lines.some(line => /^[-*•\d]/.test(line))
    if (!hasExplicitList) {
      return text
    }
    const items = lines
      .map(line => line.replace(/^[-*•\d\).]+\s*/, '').trim())
      .filter(Boolean)
    if (items.length === 0) return text
    const normalized = ['**Key highlights:**', ...items.map(item => `- ${item}`)].join('\n')
    return [before, normalized, rest.trim()].filter(Boolean).join('\n\n')
  }

  function dedupeLines(text: string): string {
    const lines = text.split('\n')
    const seen = new Set<string>()
    const result: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        result.push(line)
        continue
      }
      const key = trimmed.toLowerCase()
      if (trimmed.length > 12 && seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push(line)
    }
    return result.join('\n')
  }

  function normalizeForCompare(text: string): string {
    return normalizeText(stripInlineChunkIds(text || '')).toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
  }

  function isSubstantiveRevision(current: string, next: string): boolean {
    const currentClean = normalizeText(stripInlineChunkIds(current || '')).trim()
    const nextClean = normalizeText(stripInlineChunkIds(next || '')).trim()
    if (!nextClean) return false
    if (!currentClean) return true
    if (normalizeForCompare(currentClean) === normalizeForCompare(nextClean)) return false
    const diffRatio = Math.abs(nextClean.length - currentClean.length) / Math.max(1, currentClean.length)
    if (diffRatio < 0.04 && currentClean.includes(nextClean)) return false
    return true
  }

  function inferUpdateTag(text: string): string {
    const lower = text.toLowerCase()
    if (/suicid|hi\b|homicid|safety|protective|risk/.test(lower)) return 'Safety update'
    if (/med|medication|dose|mg|titrate|increase|decrease|sertraline|fluoxetine|trazodone/.test(lower)) return 'Medication update'
    if (/diagnos|dsm|criteria|meets|rule[- ]out/.test(lower)) return 'Dx clarification'
    if (/substance|alcohol|cannabis|opioid|stimulant|nicotine/.test(lower)) return 'Substance update'
    if (/labs?|ts h|tsh|uds|cbc|bmp|vit|a1c/.test(lower)) return 'Labs update'
    if (/social|housing|support|employment|legal|family/.test(lower)) return 'Social update'
    return 'New information'
  }

  function extractUpdateSummary(text: string): string {
    const cleaned = normalizeText(stripInlineChunkIds(text || '')).trim()
    if (!cleaned) return ''
    const firstLine = cleaned.split('\n').find(line => line.trim()) || ''
    return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine
  }

  function formatUsageLabel(raw?: string): string {
    if (!raw) return 'Model call'
    if (raw.startsWith('section:')) {
      const id = raw.split(':')[1] || ''
      const current = sectionsRef.current.find(s => s.id === id)?.title
      const fallback = TEMPLATE_SECTIONS.find(s => s.id === id)?.title
      return `Generate · ${current || fallback || id}`
    }
    if (raw.startsWith('edit:')) {
      const scope = raw.split(':')[1] || 'section'
      return `Edit · ${scope === 'selection' ? 'Selection' : 'Section'}`
    }
    if (raw === 'ask') return 'Ask (Q&A)'
    if (raw === 'citations-recover') return 'Recover citations'
    if (raw === 'review-summary') return 'Review summary'
    if (raw === 'attending-review') return 'Attending review'
    if (raw === 'open-questions') return 'Answer open questions'
    if (raw === 'pdf-parse') return 'PDF parse'
    return raw.replace(/[-_]/g, ' ')
  }

  function getSectionTitle(sectionId: string): string | null {
    const current = sections.find(s => s.id === sectionId)?.title
    if (current) return current
    const fallback = TEMPLATE_SECTIONS.find(s => s.id === sectionId)?.title
    return fallback || null
  }

  function stripRedundantSectionHeader(text: string, sectionId: string): string {
    if (!text) return text
    const title = getSectionTitle(sectionId)
    if (!title) return text
    const lines = text.split('\n')
    const stripCitations = (value: string) => value.replace(/\[[^\]]+\]/g, '').trim()
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const firstIdx = lines.findIndex(line => line.trim().length > 0)
    if (firstIdx >= 0) {
      const first = stripCitations(lines[firstIdx]).trim().replace(/[:\s]+$/, '')
      if (normalize(first) === normalize(title)) {
        lines.splice(firstIdx, 1)
      }
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!lines[i].trim()) continue
      const last = stripCitations(lines[i]).trim().replace(/[:\s]+$/, '')
      if (normalize(last) === normalize(title)) {
        lines.splice(i, 1)
      }
      break
    }
    return lines.join('\n').trimStart()
  }

  function formatSectionText(raw: string, sectionId: string, options?: { stripChunkIds?: boolean }): string {
    let out = normalizeText(raw || '')
    out = normalizeMarkdown(out)
    out = normalizeLabelBold(out)
    out = stripRedundantSectionHeader(out, sectionId)
    out = normalizeHighlightsBlock(out)
    out = normalizeOpenQuestionsBlock(out)
    out = sanitizeOpenQuestionsBlock(out, sectionId)
    out = moveOpenQuestionsToEnd(out)
    out = normalizeListBlocks(out)
    out = dedupeLines(out)
    if (options?.stripChunkIds !== false) {
      out = stripInlineChunkIds(out)
    }
    out = out.replace(/\n{3,}/g, '\n\n').trim()
    return out
  }

  function formatSectionDisplayText(raw: string, sectionId: string): string {
    const formatted = formatSectionText(raw, sectionId)
    return cleanDisplayText(formatted)
  }

  function extractOpenQuestionsFromText(text: string): Array<{ text: string; rationale?: string }> {
    const parsed = parseOpenQuestionsBlock(text)
    if (!parsed || parsed.items.length === 0) return []
    return parsed.items.map(item => ({ text: item.text, rationale: item.rationale }))
  }

  function filterOpenQuestions(items: OpenQuestionBlockItem[]): OpenQuestionBlockItem[] {
    const filtered = items.filter(item => {
      const text = item.text.trim()
      if (!text) return false
      if (isDemographicQuestion(text)) return false
      if (!/\?/.test(text)) return false
      return true
    })
    return filtered.slice(0, MAX_OPEN_QUESTIONS_PER_SECTION)
  }

  function sanitizeOpenQuestionsBlock(text: string, sectionId: string): string {
    if (!text) return text
    if (!/open\s+questions?\s*:?/i.test(text)) return text
    if (!allowOpenQuestionsForSection(sectionId)) {
      return stripOpenQuestionsBlock(text)
    }
    const parsed = parseOpenQuestionsBlock(text)
    const extracted = parsed?.items || []
    const filtered = filterOpenQuestions(extracted)
    if (filtered.length === 0) {
      return stripOpenQuestionsBlock(text)
    }
    const rebuilt = formatOpenQuestionsBlock(filtered)
    return replaceOpenQuestionsBlock(text, rebuilt)
  }

  function mergeOpenQuestions(prev: OpenQuestion[], extracted: OpenQuestion[]): OpenQuestion[] {
    const keyFor = (q: OpenQuestion) => normalizeQuestionKey(q.text)
    const prevMap = new Map(prev.map(q => [keyFor(q), q]))
    const next: OpenQuestion[] = []
    const seen = new Set<string>()
    for (const q of extracted) {
      const key = keyFor(q)
      seen.add(key)
      const existing = prevMap.get(key)
      if (existing) {
        next.push({
          ...existing,
          sectionId: q.sectionId,
          sectionTitle: q.sectionTitle,
          rationale: q.rationale || existing.rationale,
          status: existing.status === 'answered' ? 'answered' : 'open',
          updatedAt: Date.now()
        })
      } else {
        next.push(q)
      }
    }
    for (const old of prev) {
      const key = keyFor(old)
      if (seen.has(key)) continue
      if (old.status === 'answered') {
        next.push({ ...old, status: 'answered', updatedAt: Date.now() })
      } else {
        next.push({ ...old, status: 'resolved', updatedAt: Date.now() })
      }
    }
    return next
  }

  function mergeSections(saved: Array<Partial<TemplateSection> & { id: string }> | undefined): TemplateSection[] {
    if (!saved || saved.length === 0) return TEMPLATE_SECTIONS.map(s => ({ ...s }))
    const defaults = TEMPLATE_SECTIONS.map(s => ({ ...s }))
    const defaultMap = new Map(defaults.map(s => [s.id, s]))
    const used = new Set<string>()
    const merged: TemplateSection[] = []

    // Only include sections that exist in current template
    for (const entry of saved) {
      const base = defaultMap.get(entry.id)
      if (base) {
        const output = formatSectionText(entry.output || base.output || '', entry.id)
        merged.push({
          ...base,
          ...entry,
          output,
          citations: entry.citations || base.citations,
          // Preserve new fields from saved data, fall back to template defaults
          audience: entry.audience ?? base.audience,
          exportable: entry.exportable ?? base.exportable,
          parentSection: entry.parentSection ?? base.parentSection
        })
        used.add(entry.id)
      }
      // Skip sections that no longer exist in template (e.g., removed sections)
    }

    // Add any new template sections not in saved data
    for (const def of defaults) {
      if (!used.has(def.id)) {
        merged.push(def)
      }
    }
    return merged
  }

  /**
   * Get sections grouped by parent for hierarchical display.
   * Returns sections with their child sections attached.
   */
  function getSectionsWithChildren(): Array<TemplateSection & { children?: TemplateSection[] }> {
    const childMap = new Map<string, TemplateSection[]>()
    const result: Array<TemplateSection & { children?: TemplateSection[] }> = []
    
    // Group children by parentSection
    for (const section of sections) {
      if (section.parentSection) {
        const existing = childMap.get(section.parentSection) || []
        existing.push(section)
        childMap.set(section.parentSection, existing)
      }
    }
    
    // Build result with children attached
    for (const section of sections) {
      if (!section.parentSection) {
        result.push({
          ...section,
          children: childMap.get(section.id)
        })
      }
    }
    
    return result
  }

  function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function buildSelectionRegex(selectionText: string, caseInsensitive: boolean = false): RegExp | null {
    const tokens = selectionText.split(/\s+/).map(escapeRegex).filter(Boolean)
    if (tokens.length === 0) return null
    const pattern = tokens.join('\\s+')
    return caseInsensitive ? new RegExp(pattern, 'i') : new RegExp(pattern)
  }

  function buildLooseSelectionRegex(selectionText: string): RegExp | null {
    const tokens = selectionText.split(/\s+/).map(escapeRegex).filter(Boolean)
    if (tokens.length < 6) return null
    const head = tokens.slice(0, 3).join('\\s+')
    const tail = tokens.slice(-3).join('\\s+')
    const maxGap = Math.min(4000, Math.max(400, selectionText.length + 200))
    return new RegExp(`${head}[\\s\\S]{0,${maxGap}}${tail}`, 'i')
  }

  function applyEditToText(
    current: string,
    selectionText: string | null | undefined,
    replacement: string,
    options?: { allowAppend?: boolean; allowRegex?: boolean; allowLooseMatch?: boolean }
  ): { next: string; applied: boolean; mode: 'replace' | 'append' | 'set' } {
    if (!selectionText || selectionText.trim().length === 0) {
      return { next: replacement, applied: true, mode: 'set' }
    }

    const trimmedSelection = selectionText.trim()
    const exactIndex = current.indexOf(trimmedSelection)
    if (exactIndex >= 0) {
      const next = current.slice(0, exactIndex) + replacement + current.slice(exactIndex + trimmedSelection.length)
      return { next, applied: true, mode: 'replace' }
    }

    const lowerIndex = current.toLowerCase().indexOf(trimmedSelection.toLowerCase())
    if (lowerIndex >= 0) {
      const next = current.slice(0, lowerIndex) + replacement + current.slice(lowerIndex + trimmedSelection.length)
      return { next, applied: true, mode: 'replace' }
    }

    if (options?.allowRegex !== false) {
      const regex = buildSelectionRegex(trimmedSelection, true)
      if (regex) {
        const match = regex.exec(current)
        if (match && match.index >= 0) {
          const next = current.slice(0, match.index) + replacement + current.slice(match.index + match[0].length)
          return { next, applied: true, mode: 'replace' }
        }
      }
    }

    if (options?.allowLooseMatch !== false) {
      const looseRegex = buildLooseSelectionRegex(trimmedSelection)
      if (looseRegex) {
        const match = looseRegex.exec(current)
        if (match && match.index >= 0) {
          const next = current.slice(0, match.index) + replacement + current.slice(match.index + match[0].length)
          return { next, applied: true, mode: 'replace' }
        }
      }
    }

    if (options?.allowAppend === false) {
      return { next: current, applied: false, mode: 'replace' }
    }

    if (current.trim().length > 0) {
      return { next: [current, replacement].filter(Boolean).join('\n'), applied: false, mode: 'append' }
    }

    return { next: replacement, applied: false, mode: 'set' }
  }

  function highlightSelectionInText(text: string, selectionText: string | null | undefined): string {
    if (!selectionText) return text
    const trimmed = selectionText.trim()
    if (!trimmed) return text
    const exactIndex = text.indexOf(trimmed)
    if (exactIndex >= 0) {
      return `${text.slice(0, exactIndex)}<mark>${text.slice(exactIndex, exactIndex + trimmed.length)}</mark>${text.slice(exactIndex + trimmed.length)}`
    }
    const regex = buildSelectionRegex(trimmed, true)
    if (regex) {
      const match = regex.exec(text)
      if (match && match.index >= 0) {
        return `${text.slice(0, match.index)}<mark>${match[0]}</mark>${text.slice(match.index + match[0].length)}`
      }
    }
    const looseRegex = buildLooseSelectionRegex(trimmed)
    if (looseRegex) {
      const match = looseRegex.exec(text)
      if (match && match.index >= 0) {
        return `${text.slice(0, match.index)}<mark>${match[0]}</mark>${text.slice(match.index + match[0].length)}`
      }
    }
    return text
  }

  function trimForDiff(text: string, limit: number = 6000): string {
    const cleaned = normalizeText(text || '')
    if (cleaned.length <= limit) return cleaned
    return `${cleaned.slice(0, limit)}\n…`
  }

  function insertEditorText(prefix: string, suffix: string = '', fallback: string = '') {
    const el = editTextareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = el.value.slice(start, end)
    const insert = selected ? `${prefix}${selected}${suffix}` : `${prefix}${fallback}${suffix}`
    el.value = el.value.slice(0, start) + insert + el.value.slice(end)
    const cursor = start + insert.length
    el.setSelectionRange(cursor, cursor)
    el.focus()
  }

  function normalizeEpisodeDate(value?: string): string | undefined {
    if (!value) return undefined
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const match = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (!match) return value
    const month = Math.max(1, Math.min(12, parseInt(match[1], 10)))
    const day = Math.max(1, Math.min(31, parseInt(match[2], 10)))
    let year = parseInt(match[3], 10)
    if (year < 100) year += year >= 70 ? 1900 : 2000
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  }

  function updateDocMeta(docId: string, updates: Partial<Pick<SourceDoc, 'documentType' | 'episodeDate'>>) {
    setDocs(prev => prev.map(doc => {
      if (doc.id !== docId) return doc
      const nextDate = normalizeEpisodeDate(updates.episodeDate || doc.episodeDate)
      const nextType = updates.documentType || doc.documentType
      const chronologicalOrder = nextDate ? Date.parse(nextDate) : doc.chronologicalOrder
      const nextChunks = doc.chunks.map(chunk => ({
        ...chunk,
        documentType: nextType,
        episodeDate: nextDate
      }))
      return {
        ...doc,
        documentType: nextType,
        episodeDate: nextDate,
        chronologicalOrder,
        chunks: nextChunks
      }
    }))
  }

  function buildDraftContext(scope: 'section' | 'all', limit: number = 3000): string {
    if (scope === 'section' && selectedSection) {
      const body = stripInlineChunkIds(normalizeText(selectedSection.output || '')).trim()
      const trimmed = body.length > limit ? body.slice(0, limit) + '\n…' : body
      return trimmed ? `Current draft for ${selectedSection.title}:\n${trimmed}` : ''
    }
    if (scope === 'all') {
      const parts = visibleSections.map(s => {
        const body = stripInlineChunkIds(normalizeText(s.output || '')).trim()
        return body ? `## ${s.title}\n${body}` : ''
      }).filter(Boolean)
      const joined = parts.join('\n\n')
      const capped = joined.length > limit ? joined.slice(0, limit) + '\n…' : joined
      return capped
    }
    return ''
  }

  function buildOtherSectionsContext(excludeId: string, limit: number = 2000): string {
    const parts = visibleSections
      .filter(s => s.id !== excludeId)
      .map(s => {
        const body = stripInlineChunkIds(normalizeText(s.output || '')).trim()
        return body ? `## ${s.title}\n(Already covered; do not repeat)\n${body}` : ''
      })
      .filter(Boolean)
    if (parts.length === 0) return ''
    const joined = parts.join('\n\n')
    return joined.length > limit ? joined.slice(0, limit) + '\n…' : joined
  }

  function buildChronologyContext(docsList: SourceDoc[], limit: number = 1200): string {
    const ordered = [...docsList]
      .filter(d => d.episodeDate || d.chronologicalOrder)
      .sort((a, b) => (a.chronologicalOrder ?? 0) - (b.chronologicalOrder ?? 0))
    if (ordered.length === 0) return ''
    const lines = ordered.map(d => {
      const date = d.episodeDate || 'undated'
      const type = d.documentType ? d.documentType.replace('-', ' ') : 'document'
      return `${date} · ${type} · ${d.name}`
    })
    const body = lines.join('\n')
    const out = `Chronology reference (do not cite):\n${body}`
    return out.length > limit ? out.slice(0, limit) + '\n…' : out
  }

  function buildOpenQuestionsContext(excludeId: string, limit: number = 800): string {
    if (!settings.showOpenQuestions) return ''
    const questions: Array<{ sectionTitle: string; text: string }> = []
    for (const section of visibleSections) {
      if (section.id === excludeId) continue
      if (!allowOpenQuestionsForSection(section.id)) continue
      const body = normalizeOpenQuestionsBlock(stripInlineChunkIds(normalizeText(section.output || ''))).trim()
      if (!body) continue
      const extracted = filterOpenQuestions(extractOpenQuestionsFromText(body))
      for (const q of extracted) {
        if (q.text) questions.push({ sectionTitle: section.title, text: q.text })
      }
    }
    if (questions.length === 0) return ''
    const seen = new Set<string>()
    const unique: Array<{ sectionTitle: string; text: string }> = []
    for (const q of questions) {
      const key = normalizeQuestionKey(q.text)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(q)
    }
    const body = unique.map(q => `- ${q.sectionTitle}: ${q.text}`).join('\n')
    const out = `Open questions already asked (avoid repeating):\n${body}`
    return out.length > limit ? out.slice(0, limit) + '\n…' : out
  }

  function extractOpenQuestionsFromSections(nextSections: TemplateSection[]): OpenQuestion[] {
    const items: OpenQuestion[] = []
    const seen = new Set<string>()
    for (const section of nextSections.filter(s => !s.hidden)) {
      if (!allowOpenQuestionsForSection(section.id)) continue
      const body = normalizeOpenQuestionsBlock(stripInlineChunkIds(normalizeText(section.output || ''))).trim()
      if (!body) continue
      const extracted = filterOpenQuestions(extractOpenQuestionsFromText(body))
      for (const q of extracted) {
        const text = q.text.trim()
        if (!text) continue
        const key = normalizeQuestionKey(text)
        if (seen.has(key)) continue
        seen.add(key)
        items.push({
          id: crypto.randomUUID(),
          sectionId: section.id,
          sectionTitle: section.title,
          text,
          rationale: q.rationale,
          status: 'open',
          createdAt: Date.now()
        })
      }
    }
    return items
  }

  function prioritizeSourceCoverage(chunks: Chunk[]): Chunk[] {
    const seen = new Set<string>()
    const primary: Chunk[] = []
    const secondary: Chunk[] = []
    for (const chunk of chunks) {
      if (seen.has(chunk.sourceId)) {
        secondary.push(chunk)
      } else {
        primary.push(chunk)
        seen.add(chunk.sourceId)
      }
    }
    return [...primary, ...secondary]
  }

  function prioritizeFollowupEvidence(chunks: Chunk[]): Chunk[] {
    const followupIds = new Set(docs.filter(d => d.tag === 'followup').map(d => d.id))
    if (followupIds.size === 0) return chunks
    const followup: Chunk[] = []
    const rest: Chunk[] = []
    for (const chunk of chunks) {
      if (followupIds.has(chunk.sourceId)) followup.push(chunk)
      else rest.push(chunk)
    }
    return [...followup, ...rest]
  }

  async function ensureDsmIndex(): Promise<ReturnType<typeof buildDsmIndex> | null> {
    if (dsmIndexRef.current) return dsmIndexRef.current
    try {
      const res = await fetch('/references/DSM-V.md')
      if (!res.ok) return null
      const text = await res.text()
      const index = buildDsmIndex(text)
      dsmIndexRef.current = index
      return index
    } catch {
      return null
    }
  }

  // Drag and drop
  useEffect(() => {
    function onDragOver(e: DragEvent) {
      e.preventDefault()
      setIsDragging(true)
    }
    function onDragLeave(e: DragEvent) {
      if ((e.target as HTMLElement)?.tagName === 'BODY') {
        setIsDragging(false)
      }
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        if (activePanel === 'followup') {
          handleFollowupFiles(files)
        } else {
          handleFiles(files)
        }
      }
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [activePanel])

  // Load saved case
  useEffect(() => {
    const existingCases = listCases()
    setCases(existingCases)
    const existing = loadCase()
    if (existing) {
      setCaseId(existing.id)
      setProfile(existing.profile)
      setDocs(existing.docs)
      setChatThreads(existing.chat || { ask: [], edit: [] })
      setOpenQuestions(existing.openQuestions || [])
      setLastGeneratedAt(existing.lastGeneratedAt || null)
      const merged = mergeSections(existing.sections)
      setSections(merged)
      const nextSelected = merged.find(s => s.id === selectedId && !s.hidden) || merged.find(s => !s.hidden) || merged[0]
      if (nextSelected) setSelectedId(nextSelected.id)
      if (existing.savedAt) {
        setLastSavedAt(new Date(existing.savedAt).toLocaleString())
      }
    }
    setHydrated(true)
  }, [])

  // Auto-save
  useEffect(() => {
    if (!hydrated) return
    if (!caseId && !hasCaseContent) return
    const t = setTimeout(() => {
      const saved = saveCase(caseId, profile, docs, sections, chatThreads, openQuestions, lastGeneratedAt || undefined)
      setCaseId(saved.id)
      setLastSavedAt(new Date(saved.savedAt).toLocaleString())
      setCases(listCases())
    }, 1200)
    return () => clearTimeout(t)
  }, [profile, docs, sections, chatThreads, openQuestions, lastGeneratedAt, hydrated, caseId, hasCaseContent])

  async function handleFiles(files: File[]) {
    const loaded = await loadFiles(files, settings)
    setDocs(prev => [...prev, ...loaded])
  }

  async function handleFollowupFiles(files: File[]) {
    const loaded = await loadFiles(files, settings, 'followup')
    if (loaded.length === 0) return
    const nextDocs = [...docs, ...loaded]
    setDocs(nextDocs)
    setActivePanel('followup')
    await runFollowupUpdates(nextDocs)
  }

  async function loadExamples() {
    try {
      const res = await fetch('/examples/examples.json')
      const data = await res.json()
      const files: string[] = data.files || []
      const fileObjs: File[] = []
      for (const file of files) {
        const resp = await fetch(`/examples/${file}`)
        const blob = await resp.blob()
        const ext = file.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'text/plain'
        fileObjs.push(new window.File([blob], file, { type }))
      }
      const loaded = await loadFiles(fileObjs, settings)
      setDocs(prev => [...prev, ...loaded])
      setProfile({
        name: 'Jane Doe (Example)',
        mrn: 'EX-20411',
        dob: '1991-05-14',
        sex: 'female'
      })
    } catch {
      console.error('Failed to load examples')
      return
    }
  }

  async function loadFollowupExample() {
    try {
      const resp = await fetch('/examples/example-post-interview-note.txt')
      const blob = await resp.blob()
      const file = new window.File([blob], 'example-post-interview-note.txt', { type: 'text/plain' })
      const loaded = await loadFiles([file], settings, 'followup')
      if (loaded.length === 0) return
      const nextDocs = [...docs, ...loaded]
      setDocs(nextDocs)
      setActivePanel('followup')
      await runFollowupUpdates(nextDocs)
    } catch {
      console.error('Failed to load post-interview example')
    }
  }

  function handleUpdateSection(id: string, text: string) {
    const cleaned = formatSectionText(text, id)
    setSections(prev => prev.map(s => (s.id === id ? { ...s, output: cleaned } : s)))
    clearSectionIssue(id)
  }

  function clearSectionIssue(sectionId: string) {
    setSectionErrors(prev => {
      if (!prev[sectionId]) return prev
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
  }

  function notifyGenerationIssue(sectionId: string, title: string, issue: string) {
    setSectionErrors(prev => ({ ...prev, [sectionId]: issue }))
    appendMessage('ask', {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: `Generation warning (${title}): ${issue}`,
      createdAt: Date.now()
    })
  }

  function reportCitationCoverage() {
    if (docs.length === 0) return
    const cited = new Set<string>()
    for (const section of sections) {
      for (const citation of section.citations || []) {
        cited.add(citation.sourceId)
      }
    }
    const missing = docs.filter(d => !cited.has(d.id))
    if (missing.length === 0) return
    const names = missing.map(d => d.name).join(', ')
    appendMessage('ask', {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: `Citation coverage warning: no citations were used from ${names}. Consider regenerating relevant sections or adding notes.`,
      createdAt: Date.now()
    })
  }

  async function generateSection(
    section: TemplateSection,
    options?: { mode?: 'replace' | 'draft'; updateNote?: string }
  ) {
    if (!settings.openaiApiKey) {
      return
    }
    if (docs.length === 0) {
      return
    }

    const mode = options?.mode || 'replace'
    const prior = sections.find(s => s.id === section.id)
    const priorOutput = prior?.output || ''
    const priorCitations = prior?.citations || []

    clearSectionIssue(section.id)
    setStreamingPreviews(prev => {
      if (!prev[section.id]) return prev
      const next = { ...prev }
      delete next[section.id]
      return next
    })
    setGeneratingIds(prev => ({ ...prev, [section.id]: true }))
    setEditingSectionId(prev => (prev === section.id ? null : prev))
    const updateHint = options?.updateNote ? `\nUpdate note: ${options.updateNote}` : ''
    const allowOpenQuestions = allowOpenQuestionsForSection(section.id)
    const openQuestionGuidance = allowOpenQuestions
      ? OPEN_QUESTION_RULES
      : 'Do not include open questions in this section.'
    const toneGuidance = 'Tone: clinician-to-clinician handoff. Clear, concise, structured. Remove redundancy. No new diagnoses. Explicitly mark uncertainty.'
    const promptGuidance = `${section.guidance}\n${toneGuidance}\n${openQuestionGuidance}${updateHint}`
    const sectionPrompt = section.id === 'dsm5_analysis'
      ? { ...section, guidance: `${promptGuidance} Use DSM criteria only as reference; do not present DSM criteria as patient facts. Cite patient evidence for symptom claims.` }
      : { ...section, guidance: promptGuidance }
    const evidenceLimit = Math.max(6, sourceCount || 0)
    const buildEvidence = async (limit: number): Promise<Chunk[]> => {
      const baseQuery = `${sectionPrompt.title} ${sectionPrompt.guidance}`
      let selected = section.id === 'hpi'
        ? rankEvidenceWeighted(baseQuery, allChunks, docs, limit, { includeUnmatchedSources: true })
        : rankEvidenceDiverse(baseQuery, allChunks, limit, { includeUnmatchedSources: true })

      if (settings.semanticSearch) {
        try {
          const semantic = await rankEvidenceSemantic(baseQuery, allChunks, limit)
          if (semantic && semantic.length > 0) {
            selected = semantic
          }
        } catch {
          // Fall back to lexical ranking
        }
      }
      selected = prioritizeFollowupEvidence(prioritizeSourceCoverage(selected))
      if (section.id === 'dsm5_analysis') {
        const dsmIndex = await ensureDsmIndex()
        if (dsmIndex && dsmIndex.length > 0) {
          const query = `${sectionPrompt.title} ${sectionPrompt.guidance}\n${buildDsmQuery(sections)}`
          const matches = rankDsmEntries(query, dsmIndex, 6)
          const dsmText = formatDsmEntries(matches)
          if (dsmText.trim()) {
            const dsmDoc = makeDocFromText('DSM-5-TR Criteria (Indexed)', dsmText, 'txt')
            selected = [...selected, ...dsmDoc.chunks]
          }
        }
      }
      return selected
    }
    
    // Build DSM context for substance use and plan sections
    const DSM_ENHANCED_SECTIONS = ['substance_use', 'problem_list', 'dsm5_analysis']
    const buildDsmContext = async (): Promise<string> => {
      if (!DSM_ENHANCED_SECTIONS.includes(section.id)) return ''
      const dsmIndex = await ensureDsmIndex()
      if (!dsmIndex || dsmIndex.length === 0) return ''
      const query = `${sectionPrompt.title} ${sectionPrompt.guidance}\n${buildDsmQuery(sections)}`
      const matches = rankDsmEntries(query, dsmIndex, 4)
      return formatDsmEntries(matches)
    }
    
    const evidence = await buildEvidence(evidenceLimit)
    const dsmContext = await buildDsmContext()
    const otherSectionsContext = buildOtherSectionsContext(section.id)
    const openQuestionsContext = settings.showOpenQuestions ? buildOpenQuestionsContext(section.id) : ''
    const chronologyContext = section.id === 'hpi' ? buildChronologyContext(docs) : ''
    const combinedContext = [otherSectionsContext, openQuestionsContext, chronologyContext].filter(Boolean).join('\n\n')

    type GeneratedPayload = Awaited<ReturnType<typeof generateSectionWithOpenAI>>
    const finalizeGenerated = async (
      generated: GeneratedPayload,
      currentEvidence: Chunk[],
      currentPrompt: TemplateSection,
      options?: { silent?: boolean }
    ): Promise<boolean> => {
      const silent = options?.silent ?? false
      const cleaned = formatSectionText(generated.text, section.id, { stripChunkIds: false })
      const finalText = stripInlineChunkIds(cleaned)
      const hasText = cleaned.trim().length > 0
      const hasCitations = (generated.citations || []).length > 0
      const applyGenerated = (text: string, citations: ChatMessage['citations']) => {
        if (mode === 'draft') {
          rejectExistingPendingEdits(section.id)
          appendMessage('edit', {
            id: crypto.randomUUID(),
            role: 'assistant',
            text,
            citations,
            createdAt: Date.now(),
            editStatus: 'pending',
            editTargetText: trimForDiff(priorOutput),
            editTargetScope: 'section',
            editSectionId: section.id,
            editSectionTitle: section.title
          })
        } else {
          setSections(prev => prev.map(s => (s.id === section.id ? { ...s, output: text, citations } : s)))
        }
        clearSectionIssue(section.id)
      }

      if (!hasText) {
        if (mode === 'replace') {
          setSections(prev => prev.map(s => (s.id === section.id ? { ...s, output: priorOutput, citations: priorCitations } : s)))
        }
        if (!silent) {
          notifyGenerationIssue(section.id, section.title, 'Empty output returned; previous content preserved.')
        }
        return false
      }

      if (!hasCitations) {
        const extracted = extractCitationsFromText(cleaned, currentEvidence)
        if (extracted.length > 0) {
          applyGenerated(finalText, extracted)
          return true
        }
        try {
          const recovered = await recoverCitationsWithOpenAI(cleaned, currentEvidence, settings)
          if (recovered.length > 0) {
            applyGenerated(finalText, recovered)
            return true
          }
        } catch {
          // fall through to retry
        }
        try {
          const retryPrompt = {
            ...currentPrompt,
            guidance: `${currentPrompt.guidance}\nSTRICT: Every statement must have a citation. If you cannot cite, return an empty text.`
          }
          const retry = await generateSectionWithOpenAI(retryPrompt, currentEvidence, settings, undefined, combinedContext, dsmContext)
          const retryText = formatSectionText(retry.text, section.id, { stripChunkIds: false })
          const retryFinal = stripInlineChunkIds(retryText)
          if (retryText.trim().length > 0 && (retry.citations || []).length > 0) {
            applyGenerated(retryFinal, retry.citations)
            return true
          }
        } catch {
          // fall through to warning
        }
        if (mode === 'replace') {
          setSections(prev => prev.map(s => (s.id === section.id ? { ...s, output: priorOutput, citations: priorCitations } : s)))
        }
        if (!silent) {
          notifyGenerationIssue(section.id, section.title, 'Missing citations; output not applied.')
        }
        return false
      }

      applyGenerated(finalText, generated.citations)
      return true
    }

    const shouldStream = mode === 'replace' && !isGeneratingAll
    try {
      let streamingBuffer = ''
      const generated = await generateSectionWithOpenAI(
        sectionPrompt,
        evidence,
        settings,
        shouldStream
          ? (text) => {
              if (!text) return
              streamingBuffer += text
              setStreamingPreviews(prev => ({ ...prev, [section.id]: streamingBuffer }))
            }
          : undefined,
        combinedContext,
        dsmContext
      )
      const ok = await finalizeGenerated(generated, evidence, sectionPrompt, { silent: mode === 'replace' })
      if (!ok && mode === 'replace') {
        const expandedLimit = Math.max(evidenceLimit + 6, evidenceLimit * 2, sourceCount * 2)
        const expandedEvidence = await buildEvidence(expandedLimit)
        const recoveryPrompt: TemplateSection = {
          ...sectionPrompt,
          guidance: `${sectionPrompt.guidance}\nSTRICT: If you return any text, citations must be non-empty. Return a shorter output if needed.`
        }
        try {
          const retry = await generateSectionWithOpenAI(recoveryPrompt, expandedEvidence, settings, undefined, combinedContext, dsmContext)
          await finalizeGenerated(retry, expandedEvidence, recoveryPrompt)
        } catch {
          // fall through
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      console.error(message)
      if (mode === 'replace') {
        try {
          const fallback = await generateSectionWithOpenAI(sectionPrompt, evidence, settings, undefined, combinedContext, dsmContext)
          await finalizeGenerated(fallback, evidence, sectionPrompt)
          return
        } catch (fallbackErr) {
          console.error(fallbackErr)
        }
      }
      notifyGenerationIssue(section.id, section.title, message)
    } finally {
      setStreamingPreviews(prev => {
        if (!prev[section.id]) return prev
        const next = { ...prev }
        delete next[section.id]
        return next
      })
      setGeneratingIds(prev => {
        const next = { ...prev }
        delete next[section.id]
        return next
      })
    }
  }

  async function polishSection(section: TemplateSection) {
    if (!settings.openaiApiKey) return
    const current = sections.find(s => s.id === section.id)
    const priorOutput = current?.output || ''
    if (!priorOutput.trim()) return
    const request = `Polish for clarity, brevity, and consistent formatting.

FORMATTING RULES:
1. Bold headers on their own line: **Label:** followed by bullet points below
2. Each data point on its own bullet line (never semicolon-separated inline)
3. Badges [+]/[-]/[?] at START of items: "- [+] Item" not "- Item [+]"
4. Use ":" for label-value separation (not em-dashes)
5. Blank line between header blocks
6. Narrative content stays as paragraphs; structured data as bulleted lists
7. No empty headers (skip if no content)

Remove redundancy, tighten phrasing. Preserve all facts. Do NOT add new information.`
    const evidence = rankEvidenceWeighted(
      `${section.title} ${section.guidance}`,
      allChunks,
      docs,
      Math.max(6, sourceCount || 0),
      { includeUnmatchedSources: true }
    )
    setGeneratingIds(prev => ({ ...prev, [section.id]: true }))
    try {
      const generated = await editWithOpenAI(request, priorOutput, '', evidence, settings, { scope: 'section' })
      const cleaned = formatSectionText(generated.text, section.id, { stripChunkIds: false })
      const finalText = stripInlineChunkIds(cleaned)
      if (!finalText.trim()) return
      let citations = generated.citations || []
      if (citations.length === 0) {
        const extracted = extractCitationsFromText(cleaned, evidence)
        if (extracted.length > 0) {
          citations = extracted
        } else {
          try {
            const recovered = await recoverCitationsWithOpenAI(cleaned, evidence, settings)
            citations = recovered
          } catch {
            citations = []
          }
        }
      }
      rejectExistingPendingEdits(section.id)
      appendMessage('edit', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: finalText,
        citations,
        createdAt: Date.now(),
        editStatus: 'pending',
        editTargetText: trimForDiff(priorOutput),
        editTargetScope: 'section',
        editSectionId: section.id,
        editSectionTitle: section.title,
        editApplyMode: 'replace'
      })
    } finally {
      setGeneratingIds(prev => {
        const next = { ...prev }
        delete next[section.id]
        return next
      })
    }
  }

  async function generateAll() {
    if (!settings.openaiApiKey) {
      return
    }
    if (docs.length === 0) {
      return
    }

    setIsGeneratingAll(true)
    try {
      const concurrency = Math.min(3, Math.max(1, visibleSections.length))
      
      // Use a proper queue to avoid race conditions
      const queue = [...visibleSections]
      const getNext = (): TemplateSection | undefined => queue.shift()
      
      const runWorker = async (workerId: number): Promise<void> => {
        while (true) {
          const section = getNext()
          if (!section) break
          try {
            await generateSection(section, { mode: 'replace' })
          } catch (err) {
            console.error(`Worker ${workerId} failed on ${section.id}:`, err)
          }
        }
      }
      
      // Start workers
      const workers = Array.from({ length: concurrency }, (_, i) => runWorker(i))
      await Promise.all(workers)
      
      setLastGeneratedAt(Date.now())
      await runReviewer()
      reportCitationCoverage()
    } finally {
      setIsGeneratingAll(false)
    }
  }

  function getFollowupContext(overrideDocs?: SourceDoc[]) {
    const docList = overrideDocs || docs
    const followupDocs = docList.filter(d => d.tag === 'followup')
    const followupIds = new Set(followupDocs.map(d => d.id))
    const chunks = overrideDocs ? mergeDocuments(docList) : allChunks
    const followupChunks = chunks.filter(c => followupIds.has(c.sourceId))
    const label = followupDocs.map(d => d.name).join(', ')
    return { followupDocs, followupIds, followupChunks, label }
  }

  function filterCitationsToFollowup(citations: Citation[], followupIds: Set<string>): Citation[] {
    if (followupIds.size === 0) return []
    return (citations || []).filter(c => followupIds.has(c.sourceId))
  }

  function resolveFollowupSourceNote(explicit?: string) {
    const trimmed = (explicit || '').trim()
    if (trimmed) return trimmed
    return followupSourceNote
  }

  function enableManualPostInterviewSource() {
    setPostInterviewManualSource(true)
    setPostInterviewDraft(prev => ({
      ...prev,
      source: prev.source.trim() ? prev.source : followupSourceLabel
    }))
  }

  function disableManualPostInterviewSource() {
    setPostInterviewManualSource(false)
    setPostInterviewDraft(prev => ({
      ...prev,
      source: followupSourceLabel
    }))
  }

  function enableManualFollowupSource(questionId: string) {
    setManualFollowupSources(prev => ({ ...prev, [questionId]: true }))
    setFollowupSourceDrafts(prev => ({
      ...prev,
      [questionId]: prev[questionId] || followupSourceLabel
    }))
  }

  function disableManualFollowupSource(questionId: string) {
    setManualFollowupSources(prev => ({ ...prev, [questionId]: false }))
    setFollowupSourceDrafts(prev => ({ ...prev, [questionId]: '' }))
  }

  function buildManualFollowupCitations(sourceNote: string): Citation[] {
    if (followupDocs.length === 0) return []
    const excerpt = sourceNote || 'Update documentation'
    return followupDocs.map(doc => ({
      sourceId: doc.id,
      sourceName: doc.name,
      chunkId: `followup-${doc.id}`,
      excerpt
    }))
  }

  async function runFollowupUpdates(overrideDocs?: SourceDoc[]) {
    if (!settings.openaiApiKey) return
    const { followupDocs, followupIds, followupChunks, label } = getFollowupContext(overrideDocs)
    if (followupDocs.length === 0 || followupChunks.length === 0) {
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Upload update notes before generating update cards.',
        createdAt: Date.now()
      })
      return
    }

    const today = postInterviewDraft.date || new Date().toISOString().slice(0, 10)
    const sourceNote = label ? `Update docs: ${label}` : 'Update docs'
    const sourceNoteLabel = label || 'Update docs'
    const updateNote = `${sourceNote}. Only include truly new information from these docs.`
    setActivePanel('followup')
    setIsGeneratingAll(true)
    try {
      // 1) Auto-answer open questions (post-interview docs only)
      if (settings.showOpenQuestions) {
        const derived = extractOpenQuestionsFromSections(sections)
        const pending = (openQuestions.length > 0 ? openQuestions : derived).filter(q => q.status === 'open')
        if (pending.length > 0) {
          const query = pending.map(q => q.text).join(' ')
          let evidence = rankEvidenceWeighted(query, followupChunks, followupDocs, Math.max(6, followupDocs.length * 2), { includeUnmatchedSources: true })
          evidence = prioritizeSourceCoverage(evidence)
          try {
            const answers = await answerOpenQuestionsWithOpenAI(
              pending.map(q => ({ id: q.id, text: q.text })),
              evidence,
              settings
            )
            if (answers.length > 0) {
              const answerMap = new Map(answers.map(answer => [answer.id, answer]))
              setOpenQuestions(prev => prev.map(q => {
                const answer = answerMap.get(q.id)
                if (!answer) return q
                const rawText = normalizeText(answer.text || '')
                const text = normalizeAnswerText(rawText)
                const citations = filterCitationsToFollowup(answer.citations || [], followupIds)
                const isAnswered = text && !/^insufficient evidence/i.test(text.trim()) && citations.length > 0
                if (!isAnswered) {
                  return { ...q, updatedAt: Date.now() }
                }
                return {
                  ...q,
                  answer: text,
                  answerCitations: citations,
                  answerSourceNote: sourceNoteLabel,
                  status: 'answered',
                  answeredAt: Date.now(),
                  updatedAt: Date.now()
                }
              }))
              for (const question of pending) {
                const answer = answerMap.get(question.id)
                if (!answer) continue
                const rawText = normalizeText(answer.text || '')
                const text = normalizeAnswerText(rawText)
                const citations = filterCitationsToFollowup(answer.citations || [], followupIds)
                const isAnswered = text && !/^insufficient evidence/i.test(text.trim()) && citations.length > 0
                if (!isAnswered) continue
                const alreadyPending = chatThreads.edit.some(msg =>
                  msg.editStatus === 'pending'
                  && msg.editApplyMode === 'open-question-answer'
                  && msg.editOpenQuestionId === question.id
                )
                if (alreadyPending) continue
                appendMessage('edit', {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  text,
                  citations,
                  createdAt: Date.now(),
                  editStatus: 'pending',
                  editTargetText: '',
                  editTargetScope: 'section',
                  editSectionId: question.sectionId,
                  editSectionTitle: question.sectionTitle,
                  editApplyMode: 'open-question-answer',
                  editOpenQuestionId: question.id,
                  editOpenQuestionText: question.text,
                  editOpenQuestionRationale: question.rationale
                })
              }
            }
          } catch (err) {
            console.error(err)
          }
        }
      }

      // 2) Suggest post-interview revisions for all sections (follow-up notes only)
      const concurrency = Math.min(3, Math.max(1, visibleSections.length))
      let idx = 0
      const runners = Array.from({ length: Math.min(concurrency, visibleSections.length) }, async () => {
        while (idx < visibleSections.length) {
          const current = visibleSections[idx]
          idx += 1
          const priorOutput = (current.output || '').trim()
          const revisionGuidance = `${current.guidance}\n${updateNote}\nIntegrate only new information into the section. Keep structure. Remove redundancy. Do NOT add a separate post-interview note header.`
          const promptSection: TemplateSection = { ...current, guidance: revisionGuidance }
          let evidence = rankEvidenceWeighted(
            `${promptSection.title} ${promptSection.guidance}`,
            followupChunks,
            followupDocs,
            Math.max(6, followupDocs.length * 2),
            { includeUnmatchedSources: true }
          )
          evidence = prioritizeSourceCoverage(evidence)
          try {
            const context = priorOutput
              ? `Current section text (revise in place):\n${stripInlineChunkIds(normalizeText(priorOutput))}`
              : 'Current section text is empty. Generate a full section from follow-up docs only.'
            const generated = priorOutput
              ? await editWithOpenAI(
                  'Integrate the follow-up information into the section. Keep the existing structure and tone. Remove redundancy. If no new information exists, return the original text unchanged.',
                  priorOutput,
                  context,
                  evidence,
                  settings,
                  { scope: 'section' }
                )
              : await generateSectionWithOpenAI(promptSection, evidence, settings, undefined, context)
            const cleaned = formatSectionText(generated.text, current.id, { stripChunkIds: false })
            const finalText = stripInlineChunkIds(cleaned)
            if (!isSubstantiveRevision(priorOutput, finalText)) continue
            let citations = generated.citations || []
            if (citations.length === 0) {
              const extracted = extractCitationsFromText(cleaned, evidence)
              if (extracted.length > 0) {
                citations = extracted
              } else {
                try {
                  const recovered = await recoverCitationsWithOpenAI(cleaned, evidence, settings)
                  citations = recovered
                } catch {
                  citations = []
                }
              }
            }
            citations = filterCitationsToFollowup(citations, followupIds)
            if (citations.length === 0) continue
            const updateTag = inferUpdateTag(finalText)
            const updateSummary = extractUpdateSummary(finalText)
            appendMessage('edit', {
              id: crypto.randomUUID(),
              role: 'assistant',
              text: finalText,
              citations,
              createdAt: Date.now(),
              editStatus: 'pending',
              editTargetText: trimForDiff(priorOutput),
              editTargetScope: 'section',
              editSectionId: current.id,
              editSectionTitle: current.title,
              editApplyMode: 'update-card',
              editNoteDate: today,
              editNoteSource: sourceNoteLabel,
              updateTag,
              updateSummary
            })
          } catch (err) {
            console.error(err)
          }
        }
      })
      await Promise.all(runners)
      setLastGeneratedAt(Date.now())
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Update cards ready (including open-question answers). Review the cards to apply changes.',
        createdAt: Date.now()
      })
    } finally {
      setIsGeneratingAll(false)
    }
  }

  function saveManualAnswer(questionId: string) {
    const answer = (followupAnswerDrafts[questionId] || '').trim()
    const sourceNote = resolveFollowupSourceNote(followupSourceDrafts[questionId])
    if (!answer) return
    const existing = openQuestions.find(q => q.id === questionId)
    const note = sourceNote || 'Clinician interview'
    const manualCitations = buildManualFollowupCitations(note)
    setOpenQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q
      return {
        ...q,
        answer: normalizeAnswerText(answer),
        answerSourceNote: note,
        answerCitations: manualCitations,
        status: 'answered',
        answeredAt: Date.now(),
        updatedAt: Date.now()
      }
    }))
    if (existing) {
      setSections(prev => prev.map(section => {
        if (section.id !== existing.sectionId) return section
        const updated = applyOpenQuestionAnswerToText(section.output || '', existing.text, answer)
        if (updated === (section.output || '')) return section
        return {
          ...section,
          output: formatSectionText(updated, section.id),
          citations: [...(section.citations || []), ...manualCitations]
        }
      }))
      setChatThreads(prev => ({
        ask: prev.ask,
        edit: prev.edit.map(msg => (
          msg.editStatus === 'pending'
            && msg.editApplyMode === 'open-question-answer'
            && msg.editOpenQuestionId === questionId
            ? { ...msg, editStatus: 'rejected' }
            : msg
        ))
      }))
    }
    setFollowupAnswerDrafts(prev => ({ ...prev, [questionId]: '' }))
    setFollowupSourceDrafts(prev => ({ ...prev, [questionId]: '' }))
    setManualFollowupSources(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  function clearOpenQuestionAnswer(questionId: string) {
    const existing = openQuestions.find(q => q.id === questionId)
    if (!existing) return
    setOpenQuestions(prev => prev.map(q => (
      q.id === questionId
        ? {
            ...q,
            answer: undefined,
            answerSourceNote: undefined,
            answerCitations: undefined,
            status: 'open',
            answeredAt: undefined,
            updatedAt: Date.now()
          }
        : q
    )))
    setSections(prev => prev.map(section => {
      if (section.id !== existing.sectionId) return section
      const updated = clearOpenQuestionAnswerInText(section.output || '', existing.text)
      if (updated === (section.output || '')) return section
      return { ...section, output: formatSectionText(updated, section.id) }
    }))
    setChatThreads(prev => ({
      ask: prev.ask,
      edit: prev.edit.map(msg => (
        msg.editStatus === 'pending'
          && msg.editApplyMode === 'open-question-answer'
          && msg.editOpenQuestionId === questionId
          ? { ...msg, editStatus: 'rejected' }
          : msg
      ))
    }))
    setFollowupAnswerDrafts(prev => ({ ...prev, [questionId]: '' }))
    setFollowupSourceDrafts(prev => ({ ...prev, [questionId]: '' }))
    setManualFollowupSources(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  function removeOpenQuestion(questionId: string) {
    const existing = openQuestions.find(q => q.id === questionId)
    if (!existing) return
    setOpenQuestions(prev => prev.filter(q => q.id !== questionId))
    setSections(prev => prev.map(section => {
      if (section.id !== existing.sectionId) return section
      const updated = removeOpenQuestionFromText(section.output || '', existing.text)
      if (updated === (section.output || '')) return section
      return { ...section, output: formatSectionText(updated, section.id) }
    }))
    setChatThreads(prev => ({
      ask: prev.ask,
      edit: prev.edit.map(msg => (
        msg.editStatus === 'pending'
          && msg.editApplyMode === 'open-question-answer'
          && msg.editOpenQuestionId === questionId
          ? { ...msg, editStatus: 'rejected' }
          : msg
      ))
    }))
    setFollowupAnswerDrafts(prev => ({ ...prev, [questionId]: '' }))
    setFollowupSourceDrafts(prev => ({ ...prev, [questionId]: '' }))
  }

  async function addPostInterviewNote() {
    const { sectionId, text, date, source } = postInterviewDraft
    if (!sectionId || !text.trim()) return
    if (!settings.openaiApiKey) {
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Add your OpenAI API key in Settings to apply updates.',
        createdAt: Date.now()
      })
      return
    }
    const sourceNote = resolveFollowupSourceNote(source)
    const manualDoc = makeDocFromText(`Manual update (${date || 'undated'})`, text, 'txt', undefined, undefined, undefined, 'local', Date.now(), 'followup')
    const section = sections.find(s => s.id === sectionId)
    if (!section) return
    const priorOutput = section?.output || ''
    const context = priorOutput
      ? `Current section text (revise in place):\n${stripInlineChunkIds(normalizeText(priorOutput))}`
      : 'Current section text is empty. Generate a full section from this update.'
    setPostInterviewBusy(true)
    try {
      const generated = priorOutput
        ? await editWithOpenAI(
            'Integrate the clinician update into the section. Keep structure and tone. Remove redundancy. If no new information exists, return the original text unchanged.',
            priorOutput,
            context,
            manualDoc.chunks,
            settings,
            { scope: 'section' }
          )
        : await generateSectionWithOpenAI(
            { ...section, guidance: `${section?.guidance || ''}\nUse ONLY the provided update.` },
            manualDoc.chunks,
            settings,
            undefined,
            context
          )
      const cleaned = formatSectionText(generated.text, sectionId, { stripChunkIds: false })
      const finalText = stripInlineChunkIds(cleaned)
      if (!isSubstantiveRevision(priorOutput, finalText)) return
      const updateTag = inferUpdateTag(text)
      const updateSummary = extractUpdateSummary(text)
      appendMessage('edit', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: finalText,
        citations: generated.citations || manualDoc.chunks.map(chunk => ({
          sourceId: manualDoc.id,
          sourceName: manualDoc.name,
          chunkId: chunk.id,
          excerpt: chunk.text.slice(0, 120)
        })),
        createdAt: Date.now(),
        editStatus: 'pending',
        editTargetText: trimForDiff(priorOutput),
        editTargetScope: 'section',
        editSectionId: sectionId,
        editSectionTitle: section?.title || '',
        editApplyMode: 'update-card',
        editNoteDate: date || new Date().toISOString().slice(0, 10),
        editNoteSource: sourceNote,
        updateTag,
        updateSummary
      })
      setSelectedId(sectionId)
    } finally {
      setPostInterviewBusy(false)
      setPostInterviewDraft(prev => ({
        ...prev,
        text: '',
        source: prev.source.trim() ? prev.source : followupSourceLabel
      }))
    }
  }

  function resetOutputs() {
    setSections(prev => prev.map(s => ({ ...s, output: '', citations: [] })))
    setOpenQuestions([])
    setLastGeneratedAt(null)
    setFollowupAnswerDrafts({})
    setFollowupSourceDrafts({})
    setManualFollowupSources({})
    setPostInterviewManualSource(false)
    setPostInterviewDraft(prev => ({ ...prev, source: followupSourceLabel }))
    setSectionErrors({})
    setStreamingPreviews({})
    setSelectionSnippet(null)
    setEvidenceContext(null)
  }

  function handleSaveSettings(next: AppSettings) {
    setSettings(next)
    saveSettings(next)
  }

  function buildExportSections() {
    const visible = includeClinicianOnly
      ? sections
      : sections.filter(section => !section.clinicianOnly)
    return visible.map(section => ({
      ...section,
      output: formatSectionText(section.output || '', section.id)
    }))
  }

  function appendMessage(mode: 'ask' | 'edit', msg: ChatMessage) {
    setChatThreads(prev => ({
      ...prev,
      [mode]: [...prev[mode], msg]
    }))
  }

  function updateChatMessage(id: string, updates: Partial<ChatMessage>) {
    setChatThreads(prev => ({
      ask: prev.ask.map(msg => (msg.id === id ? { ...msg, ...updates } : msg)),
      edit: prev.edit.map(msg => (msg.id === id ? { ...msg, ...updates } : msg))
    }))
  }

  function rejectExistingPendingEdits(sectionId: string) {
    setChatThreads(prev => ({
      ask: prev.ask,
      edit: prev.edit.map(msg => (
        msg.editSectionId === sectionId && msg.editStatus === 'pending'
          ? { ...msg, editStatus: 'rejected' }
          : msg
      ))
    }))
  }

  function applyEditToSections(
    currentSections: TemplateSection[],
    message: ChatMessage
  ): { nextSections: TemplateSection[]; applied: boolean; mode: ChatMessage['editApplyMode'] | 'replace' | 'append' | 'set' } {
    if (!message.editSectionId) {
      return { nextSections: currentSections, applied: false, mode: message.editApplyMode }
    }
    const section = currentSections.find(s => s.id === message.editSectionId)
    if (!section) {
      return { nextSections: currentSections, applied: false, mode: message.editApplyMode }
    }
    const current = section.output || ''
    const isAppendNote = message.editApplyMode === 'append-note' || message.editApplyMode === 'append-note-after-questions'
    const isUpdateCard = message.editApplyMode === 'update-card'
    if (isAppendNote) {
      const noteDate = message.editNoteDate || new Date().toISOString().slice(0, 10)
      const noteText = stripInlineChunkIds(normalizeText(message.text || ''))
      const noteBlock = formatPostInterviewNoteBlock(noteText, noteDate, resolveFollowupSourceNote(message.editNoteSource))
      const inserted = appendPostInterviewNoteAtEnd(current, noteBlock)
      const nextText = formatSectionText(inserted, message.editSectionId)
      const mergedCitations = [...(section.citations || []), ...(message.citations || [])]
      return {
        nextSections: currentSections.map(s => (
          s.id === message.editSectionId ? { ...s, output: nextText, citations: mergedCitations } : s
        )),
        applied: true,
        mode: message.editApplyMode
      }
    }
    if (message.editApplyMode === 'open-question-answer') {
      const questionText = message.editOpenQuestionText
        || openQuestions.find(q => q.id === message.editOpenQuestionId)?.text
        || ''
      if (!questionText) {
        return { nextSections: currentSections, applied: false, mode: message.editApplyMode }
      }
      const updated = applyOpenQuestionAnswerToText(current, questionText, message.text || '')
      if (updated === current) {
        return { nextSections: currentSections, applied: false, mode: message.editApplyMode }
      }
      const mergedCitations = [...(section.citations || []), ...(message.citations || [])]
      return {
        nextSections: currentSections.map(s => (
          s.id === message.editSectionId
            ? { ...s, output: formatSectionText(updated, message.editSectionId), citations: mergedCitations }
            : s
        )),
        applied: true,
        mode: message.editApplyMode
      }
    }
    if (isUpdateCard) {
      const nextText = formatSectionText(message.text || '', message.editSectionId)
      if (!nextText.trim()) {
        return { nextSections: currentSections, applied: false, mode: message.editApplyMode }
      }
      const mergedCitations = [...(section.citations || []), ...(message.citations || [])]
      const nextTags = message.updateTag
        ? Array.from(new Set([...(section.updateTags || []), message.updateTag]))
        : section.updateTags
      return {
        nextSections: currentSections.map(s => (
          s.id === message.editSectionId
            ? {
                ...s,
                output: nextText,
                citations: mergedCitations,
                updateTags: nextTags,
                lastUpdatedAt: Date.now()
              }
            : s
        )),
        applied: true,
        mode: 'replace'
      }
    }
    const suggested = formatSectionText(message.text, message.editSectionId, { stripChunkIds: false })
    const result = message.editTargetScope === 'selection' && message.editSelectionText
      ? applyEditToText(current, message.editSelectionText, suggested, { allowAppend: false, allowLooseMatch: false })
      : { next: suggested, applied: true, mode: 'set' as const }
    const mergedCitations = [...(section.citations || []), ...(message.citations || [])]
    const nextCitations = message.editTargetScope === 'section' && message.citations ? message.citations : mergedCitations
    return {
      nextSections: currentSections.map(s => (
        s.id === message.editSectionId
          ? { ...s, output: formatSectionText(result.next, message.editSectionId), citations: nextCitations }
          : s
      )),
      applied: result.applied,
      mode: result.mode
    }
  }

  function applyEditMessage(message: ChatMessage) {
    if (!message.editSectionId) return
    const result = applyEditToSections(sections, message)
    setSections(result.nextSections)
    updateChatMessage(message.id, { editStatus: 'applied', editApplied: result.applied, editApplyMode: result.mode })
    if (message.editTargetScope === 'selection') {
      setSelectionSnippet(null)
    }
    setSelectedId(message.editSectionId)
  }

  function applyAllPostInterviewNotes() {
    if (pendingFollowupEdits.length === 0) return
    const pendingIds = new Set(pendingFollowupEdits.map(msg => msg.id))
    setSections(prev => {
      let next = prev
      for (const msg of pendingFollowupEdits) {
        const result = applyEditToSections(next, msg)
        next = result.nextSections
      }
      return next
    })
    setChatThreads(prev => ({
      ask: prev.ask,
      edit: prev.edit.map(msg => (
        pendingIds.has(msg.id)
          ? { ...msg, editStatus: 'applied', editApplied: true, editApplyMode: msg.editApplyMode }
          : msg
      ))
    }))
    const lastApplied = pendingFollowupEdits[pendingFollowupEdits.length - 1]
    if (lastApplied?.editSectionId) {
      setSelectedId(lastApplied.editSectionId)
    }
  }

  function rejectEditMessage(message: ChatMessage) {
    updateChatMessage(message.id, { editStatus: 'rejected' })
  }

  async function handleSend(question: string) {
    let mode = chatMode
    let workingQuestion = question
    let sectionOverride: TemplateSection | null = null
    const trimmedQuestion = question.trim()
    const isLikelyQuestion = /\?$/.test(trimmedQuestion)
      || /^(what|why|how|when|where|who|does|do|is|are|can|could|should|explain|clarify)\b/i.test(trimmedQuestion)
    const isEditIntent = /(edit|rewrite|reword|change|shorten|expand|clarify|fix|correct|polish|tighten|improve|update)\b/i.test(trimmedQuestion)
    if (mode === 'auto') {
      const hasSelection = Boolean(selectionSnippet)
      if (isEditIntent || (hasSelection && !isLikelyQuestion)) {
        mode = 'edit'
      } else {
        mode = 'ask'
      }
    }
    const contextLabel = evidenceContext
      ? `Evidence · ${evidenceContext.sourceName}`
      : selectionSnippet
        ? `Selection · ${sections.find(s => s.id === selectionSnippet.sectionId)?.title || selectedSection?.title || 'Section'}`
        : undefined
    const contextSnippet = evidenceContext
      ? evidenceContext.excerpt
      : selectionSnippet?.text
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
      createdAt: Date.now(),
      contextLabel,
      contextSnippet
    }
    appendMessage(mode, msg)
    if (trimmedQuestion.startsWith('@')) {
      const remainder = trimmedQuestion.slice(1).trim()
      const remainderLower = remainder.toLowerCase()
      const candidates = sections
        .map(s => ({ section: s, title: s.title.toLowerCase() }))
        .filter(item => remainderLower.startsWith(item.title))
        .sort((a, b) => b.title.length - a.title.length)
      const match = candidates[0]
      if (match) {
        sectionOverride = match.section
        let nextQuestion = remainder.slice(match.section.title.length).trim()
        nextQuestion = nextQuestion.replace(/^[:\-]\s*/, '')
        workingQuestion = nextQuestion || question
        setSelectedId(match.section.id)
        setSelectionSnippet(null)
      }
    }

    const effectiveSection = sectionOverride || selectedSection
    const hasSelection = Boolean(selectionSnippet?.text)
    const resolvedScope: ChatMessage['editTargetScope'] = hasSelection && editScope === 'selection' ? 'selection' : 'section'
    const editTargetScope = mode === 'edit' ? resolvedScope : undefined
    const editTargetText = mode === 'edit'
      ? (resolvedScope === 'selection' ? (selectionSnippet?.text || '') : (effectiveSection?.output || ''))
      : ''
    const editSectionId = mode === 'edit' ? (selectionSnippet?.sectionId || effectiveSection?.id) : undefined
    const editSectionTitle = mode === 'edit'
      ? (selectionSnippet?.sectionId
        ? sections.find(s => s.id === selectionSnippet.sectionId)?.title || effectiveSection?.title
        : effectiveSection?.title)
      : undefined

    if (!settings.openaiApiKey) {
      appendMessage(mode, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Add your OpenAI API key in Settings to use chat.',
        createdAt: Date.now()
      })
      return
    }
    if (docs.length === 0) {
      appendMessage(mode, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Upload files first so I have something to reference.',
        createdAt: Date.now()
      })
      return
    }
    if (mode === 'edit' && !effectiveSection && !selectionSnippet) {
      appendMessage(mode, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Select a section or highlight text to edit.',
        createdAt: Date.now()
      })
      return
    }

    const regenMatch = workingQuestion.trim().match(/^(regen|regenerate|reanalyze|reanalyse|reinvestigate|rebuild|refresh)\s*:?\s*(.*)$/i)
    if (regenMatch) {
      const target = (regenMatch[2] || '').trim()
      const lowerQuestion = workingQuestion.toLowerCase()
      const normalizedTarget = target.toLowerCase()
      const wantsAll = !target || /\b(all|everything|entire|full|files?|case|summary)\b/.test(normalizedTarget)
      const wantsReset = /(from scratch|fresh|clean|reset)\b/.test(lowerQuestion) || lowerQuestion.startsWith('rebuild') || lowerQuestion.startsWith('reinvestigate')
      if (wantsAll) {
        setChatLoading(true)
        if (wantsReset) {
          resetOutputs()
        }
        await generateAll()
        appendMessage(mode, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: wantsReset ? 'Regenerated all sections from scratch.' : 'Regenerated all sections.',
          createdAt: Date.now()
        })
        setChatLoading(false)
        return
      }
      const section = target ? findSectionByTitle(target) : (sectionOverride || selectedSection)
      if (!section) {
        appendMessage(mode, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Which section should I regenerate? Try: regen: Problem List & Plan',
          createdAt: Date.now()
        })
        return
      }
      setChatLoading(true)
      await generateSection(section)
      appendMessage(mode, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Regenerated section: ${section.title}.`,
        createdAt: Date.now()
      })
      setChatLoading(false)
      return
    }

    setChatLoading(true)

    try {
      const sectionForScope = mode === 'ask' ? (sectionOverride || selectedSection) : null
      const scopedQuestion = sectionForScope
        ? `Section (${sectionForScope.title}): ${workingQuestion}`
        : workingQuestion
      const draftContext = mode === 'edit'
        ? buildDraftContext('section', 2500)
        : buildDraftContext(sectionForScope ? 'section' : 'all', sectionForScope ? 2500 : 5000)
      const selectionContext = selectionSnippet ? `Selected excerpt (context only unless scope set to selection):\n"${selectionSnippet.text}"` : ''
      const evidenceContextText = evidenceContext ? `Evidence excerpt (${evidenceContext.sourceName}):\n"${evidenceContext.excerpt}"` : ''
      const fullQuestion = [scopedQuestion, selectionContext, evidenceContextText, draftContext].filter(Boolean).join('\n\n')

      const evidenceQuery = evidenceContext ? `${workingQuestion} ${evidenceContext.excerpt}` : workingQuestion
      const useAllEvidence = mode === 'ask' && (!sectionForScope || Boolean(evidenceContext))
      const evidenceSection = selectionSnippet
        ? sections.find(s => s.id === selectionSnippet.sectionId) || effectiveSection
        : effectiveSection
      const askLimit = Math.max(6, sourceCount || 0)
      let evidence = useAllEvidence
        ? rankEvidenceWeighted(`${evidenceQuery}`, allChunks, docs, askLimit, { includeUnmatchedSources: true })
        : evidenceSection
          ? rankEvidenceWeighted(`${evidenceSection.title} ${evidenceQuery}`, allChunks, docs, 6, { includeUnmatchedSources: false })
          : rankEvidenceWeighted(`${evidenceQuery}`, allChunks, docs, 6, { includeUnmatchedSources: false })
      if (settings.semanticSearch) {
        try {
          const semantic = await rankEvidenceSemantic(`${evidenceQuery}`, allChunks, askLimit)
          if (semantic && semantic.length > 0) {
            evidence = semantic
          }
        } catch {
          // fall back to weighted lexical ranking
        }
      }
      if (useAllEvidence) {
        evidence = prioritizeFollowupEvidence(prioritizeSourceCoverage(evidence))
      }

      const editContext = mode === 'edit'
        ? [draftContext, evidenceContextText].filter(Boolean).join('\n\n')
        : ''
      const answer = mode === 'edit'
        ? await editWithOpenAI(
          workingQuestion,
          resolvedScope === 'selection' ? (selectionSnippet?.text || '') : (effectiveSection?.output || ''),
          editContext,
          evidence,
          settings,
          { scope: resolvedScope }
        )
        : await askWithOpenAI(fullQuestion, evidence, settings)
      const cleanedAnswer = normalizeText(answer.text)
      const strippedAnswer = stripInlineChunkIds(cleanedAnswer).trim()
      const isSelectionEdit = mode === 'edit' && resolvedScope === 'selection' && Boolean(selectionSnippet?.text)
      const normalizedAnswer = isSelectionEdit && selectionSnippet?.text
        ? normalizeSelectionReplacement(strippedAnswer, selectionSnippet.text)
        : strippedAnswer
      const displayAnswer = normalizedAnswer.length > 0 ? normalizedAnswer : 'No output returned. Please try again.'
      const replyId = crypto.randomUUID()
      let editStatus: ChatMessage['editStatus']
      if (mode === 'edit' && normalizedAnswer.length > 0 && editSectionId) {
        rejectExistingPendingEdits(editSectionId)
        setSelectedId(editSectionId)
        editStatus = 'pending'
      }

      const reply: ChatMessage = {
        id: replyId,
        role: 'assistant',
        text: displayAnswer,
        citations: answer.citations,
        createdAt: Date.now(),
        editStatus: editStatus,
        editTargetText: mode === 'edit' ? trimForDiff(editTargetText) : undefined,
        editTargetScope: editTargetScope,
        editSelectionText: selectionSnippet?.text,
        editSectionId: editSectionId,
        editSectionTitle: editSectionTitle
      }
      appendMessage(mode, reply)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      appendMessage(mode, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: message,
        createdAt: Date.now()
      })
    } finally {
      setChatLoading(false)
    }
  }

  function handleSelectCase(id: string) {
    const existing = loadCase(id)
    if (!existing) return
    setCaseId(existing.id)
    setProfile(existing.profile)
    setDocs(existing.docs)
    setChatThreads(existing.chat || { ask: [], edit: [] })
    setOpenQuestions(existing.openQuestions || [])
    setLastGeneratedAt(existing.lastGeneratedAt || null)
    setFollowupAnswerDrafts({})
    setFollowupSourceDrafts({})
    setSectionErrors({})
    setStreamingPreviews({})
    setGeneratingIds({})
    setSelectionSnippet(null)
    setEvidenceContext(null)
    const merged = mergeSections(existing.sections)
    setSections(merged)
    const nextSelected = merged.find(s => s.id === selectedId && !s.hidden) || merged.find(s => !s.hidden) || merged[0]
    if (nextSelected) setSelectedId(nextSelected.id)
    if (existing.savedAt) {
      setLastSavedAt(new Date(existing.savedAt).toLocaleString())
    }
  }

  function handleNewCase() {
    setCaseId(null)
    setProfile({ name: '', mrn: '', dob: '' })
    setDocs([])
    setChatThreads(createEmptyThreads())
    setOpenQuestions([])
    setLastGeneratedAt(null)
    setFollowupAnswerDrafts({})
    setFollowupSourceDrafts({})
    setPostInterviewDraft({
      sectionId: TEMPLATE_SECTIONS[0]?.id || '',
      date: new Date().toISOString().slice(0, 10),
      text: '',
      source: ''
    })
    setGeneratingIds({})
    setSelectionSnippet(null)
    setEvidenceContext(null)
    resetOutputs()
    setLastSavedAt(null)
  }

  function handleDeleteCase(id: string) {
    deleteCase(id)
    setCases(listCases())
    if (id === caseId) handleNewCase()
  }

  function applyAnswerToSection(text: string, citations: ChatMessage['citations'] = [], sectionId?: string | null) {
    if (!sectionId) return
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const mergedText = insertBeforeOpenQuestionsBlock(s.output || '', text, s.id)
      const mergedCitations = [...(s.citations || []), ...(citations || [])]
      return { ...s, output: mergedText, citations: mergedCitations }
    }))
  }

  function updateSectionMeta(id: string, updates: Partial<TemplateSection>) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  function moveSection(id: string, direction: -1 | 1) {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id)
      const nextIdx = idx + direction
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[nextIdx]
      next[nextIdx] = temp
      return next
    })
  }

  function moveSectionTo(dragId: string, targetId: string) {
    setSections(prev => {
      const from = prev.findIndex(s => s.id === dragId)
      const to = prev.findIndex(s => s.id === targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(from < to ? to - 1 : to, 0, item)
      return next
    })
  }

  function findSectionByTitle(query: string): TemplateSection | null {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return null
    const exact = sections.find(s => s.title.toLowerCase() === trimmed)
    if (exact) return exact
    return sections.find(s => s.title.toLowerCase().includes(trimmed)) || null
  }

  function insertSection(afterId?: string) {
    const newSection: TemplateSection = {
      id: crypto.randomUUID(),
      title: 'New Section',
      guidance: '',
      output: '',
      citations: []
    }
    setSections(prev => {
      if (!afterId) return [...prev, newSection]
      const idx = prev.findIndex(s => s.id === afterId)
      if (idx < 0) return [...prev, newSection]
      const next = [...prev]
      next.splice(idx + 1, 0, newSection)
      return next
    })
    setSelectedId(newSection.id)
  }

  function removeSection(id: string) {
    setSections(prev => {
      const next = prev.filter(s => s.id !== id)
      if (selectedId === id) {
        const nextSelected = next.find(s => !s.hidden) || next[0]
        if (nextSelected) setSelectedId(nextSelected.id)
      }
      return next
    })
  }

  function askAboutExcerpt(excerpt: string, sourceName: string) {
    setActivePanel('chat')
    setChatMode('ask')
    setSelectionSnippet(null)
    setEvidenceContext({ sourceName, excerpt })
    setChatInput('')
    requestAnimationFrame(() => chatInputRef.current?.focus())
  }

  async function runReviewer() {
    if (!settings.openaiApiKey) return
    const sectionsToReview = visibleSections.filter(s => (s.output || '').trim())
    if (sectionsToReview.length === 0) return
    setReviewingSummary(true)
    try {
      const changes = await reviewSummaryWithOpenAI(sectionsToReview, settings)
      if (changes.length === 0) {
        appendMessage('ask', {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Reviewer: no inconsistencies detected.',
          createdAt: Date.now()
        })
        return
      }
      for (const change of changes.slice(0, 5)) {
        const section = sections.find(s => s.id === change.sectionId) || findSectionByTitle(change.sectionId)
        if (!section) continue
        rejectExistingPendingEdits(section.id)
        appendMessage('edit', {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: change.revisedText,
          citations: section.citations,
          createdAt: Date.now(),
          reviewIssue: change.issue,
          editStatus: 'pending',
          editTargetText: trimForDiff(section.output || ''),
          editTargetScope: 'section',
          editSectionId: section.id,
          editSectionTitle: section.title
        })
      }
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Reviewer suggested updates for ${Math.min(changes.length, 5)} section(s). Review the proposed edits below.`,
        createdAt: Date.now()
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reviewer failed'
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: message,
        createdAt: Date.now()
      })
    } finally {
      setReviewingSummary(false)
    }
  }

  async function runAttendingReview() {
    if (!settings.openaiApiKey) return
    const sectionsToReview = visibleSections.filter(s => (s.output || '').trim())
    if (sectionsToReview.length === 0) return
    setRunningAttendingReview(true)
    setAttendingReviewIssues([])
    try {
      const issues = await reviewForAttending(sectionsToReview, settings)
      setAttendingReviewIssues(issues)
      if (issues.length === 0) {
        appendMessage('ask', {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Attending review complete. Documentation meets standards for co-signature.',
          createdAt: Date.now()
        })
      } else {
        const blockers = issues.filter(i => i.severity === 'blocker').length
        const majors = issues.filter(i => i.severity === 'major').length
        const minors = issues.filter(i => i.severity === 'minor').length
        const summary = [
          blockers > 0 ? `${blockers} blocker(s)` : null,
          majors > 0 ? `${majors} major` : null,
          minors > 0 ? `${minors} minor` : null
        ].filter(Boolean).join(', ')
        appendMessage('ask', {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `Attending review found ${issues.length} issue(s): ${summary}. Check the Issues panel for details.`,
          createdAt: Date.now()
        })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Attending review failed'
      appendMessage('ask', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: message,
        createdAt: Date.now()
      })
    } finally {
      setRunningAttendingReview(false)
    }
  }

  function handleDocumentSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const text = selection.toString().trim()
    if (!text) return
    const anchor = selection.anchorNode
    if (!anchor || !documentRef.current || !documentRef.current.contains(anchor)) return
    const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement
    const sectionEl = element?.closest('[data-section-id]') as HTMLElement | null
    const sectionId = sectionEl?.dataset.sectionId
    if (!sectionId) return
    setSelectionSnippet({ text, sectionId })
    setEvidenceContext(null)
    setSelectedId(sectionId)
  }

  const baseCitations = selectedSection?.citations || []
  const citations = activePanel === 'followup'
    ? filterCitationsToFollowup(baseCitations, followupDocIds)
    : baseCitations
  const selectedHasContent = Boolean(selectedSection?.output && selectedSection.output.trim())
  const selectionSectionTitle = selectionSnippet
    ? sections.find(s => s.id === selectionSnippet.sectionId)?.title || selectedSection?.title || 'Section'
    : ''
  const selectionPreview = selectionSnippet ? selectionSnippet.text.replace(/\s+/g, ' ').trim() : ''
  const selectionPreviewShort = selectionPreview.length > 180 ? `${selectionPreview.slice(0, 180)}…` : selectionPreview
  const evidencePreview = evidenceContext ? evidenceContext.excerpt.replace(/\s+/g, ' ').trim() : ''
  const evidencePreviewShort = evidencePreview.length > 180 ? `${evidencePreview.slice(0, 180)}…` : evidencePreview

  return (
    <div className={`app ${settings.dsmBadgeStyle === 'compact' ? 'dsm-compact' : 'dsm-clinical'} h-screen flex overflow-hidden bg-[var(--color-canvas)]`}>
      {/* Left Sidebar - Compact */}
      <aside className={`sidebar flex flex-col h-full transition-all duration-200 ${sidebarExpanded ? 'w-52' : 'w-11'}`}>
        {/* Header + collapse */}
        <div className="px-2 py-2 flex items-center gap-2">
          <div className="logo-icon flex-shrink-0">
            <Layers size={14} strokeWidth={1.5} />
          </div>
          {sidebarExpanded && (
            <>
              <span className="text-[11px] font-medium text-[var(--color-ink)] truncate flex-1">Psych Intake Brief</span>
              <button onClick={() => setSidebarExpanded(false)} className="icon-btn">
                <ChevronRight size={14} className="rotate-180" />
              </button>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className={`px-1.5 pb-1 ${sidebarExpanded ? 'flex gap-1' : 'flex flex-col gap-1'}`}>
          <button 
            onClick={handleNewCase}
            className="action-pill flex-1"
            title="New Case"
          >
            <Plus size={12} strokeWidth={2} />
            {sidebarExpanded && <span>New</span>}
          </button>
          <label className="action-pill flex-1 cursor-pointer" title="Upload">
            <Upload size={12} strokeWidth={2} />
            {sidebarExpanded && <span>Upload</span>}
            <input
              type="file"
              multiple
              accept=".txt,.md,.docx,.pdf"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length > 0) handleFiles(files)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>
        </div>

        {/* Cases list */}
        <div className="flex-1 overflow-y-auto">
          {sidebarExpanded && (
            <div className="px-2 py-1.5">
              <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-1">Cases</span>
            </div>
          )}
          
          {cases.length === 0 ? (
            <div className="px-3 py-4 text-center">
              {sidebarExpanded ? (
                <p className="text-[11px] text-[var(--color-text-muted)]">No cases yet</p>
              ) : (
                <FolderOpen size={14} className="mx-auto text-[var(--color-text-muted)]" />
              )}
            </div>
          ) : (
            <div className="space-y-0.5 px-1">
              {cases.map(c => {
                const title = c.profile.name || c.profile.mrn || 'Untitled'
                const isActive = c.id === caseId
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCase(c.id)}
                    className={`case-item group ${isActive ? 'active' : ''}`}
                    title={title}
                  >
                    <File size={14} className="flex-shrink-0" />
                    {sidebarExpanded && (
                      <>
                        <span className="flex-1 truncate text-xs">{title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCase(c.id) }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[var(--color-error)]"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Files section */}
          {docs.length > 0 && sidebarExpanded && (
            <>
              <div className="px-2 py-1.5 mt-3">
                <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-1">Files ({docs.length})</span>
              </div>
              <div className="space-y-0.5 px-1">
                {docs.map(doc => (
                  <div key={doc.id} className="case-item" onClick={() => setPreviewDoc(doc)}>
                    <FileText size={14} className={`flex-shrink-0 file-type-${doc.kind}`} />
                    <div className="flex-1 min-w-0">
                      <span className="truncate text-xs block">{doc.name}</span>
                      {doc.documentType && doc.documentType !== 'other' && (
                        <span className="doc-type-badge">{doc.documentType.replace('-', ' ')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-1.5 mt-auto flex items-center gap-1">
          {docs.length === 0 && sidebarExpanded && (
            <button onClick={loadExamples} className="action-pill flex-1 text-[10px]">
              <Sparkles size={10} strokeWidth={2} />
              <span>Examples</span>
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} className="icon-btn" title="Settings">
            <Settings size={14} strokeWidth={1.5} />
          </button>
          {!sidebarExpanded && (
            <button onClick={() => setSidebarExpanded(true)} className="icon-btn" title="Expand">
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header bar - slim */}
        <header className="header-bar flex items-center px-3 gap-2">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="eval-context-label">Preparing for psychiatric evaluation</span>
            <div className="patient-badge">
              <input
                className="patient-input name"
                placeholder="Patient name"
                value={profile.name}
                onChange={e => setProfile({ ...profile, name: e.target.value })}
              />
              <span className="patient-sep" />
              <input
                className="patient-input"
                placeholder="MRN"
                value={profile.mrn}
                onChange={e => setProfile({ ...profile, mrn: e.target.value })}
              />
              <span className="patient-sep" />
              <input
                className="patient-input"
                placeholder="DOB"
                value={profile.dob}
                onChange={e => setProfile({ ...profile, dob: e.target.value })}
              />
              <span className="patient-sep" />
              <input
                className="patient-input"
                placeholder="Sex"
                value={profile.sex || ''}
                onChange={e => setProfile({ ...profile, sex: e.target.value })}
              />
              <span className="patient-sep" />
              <input
                className="patient-input"
                placeholder="Gender"
                value={profile.gender || ''}
                onChange={e => setProfile({ ...profile, gender: e.target.value })}
              />
              <span className="patient-sep" />
              <input
                className="patient-input"
                placeholder="Pronouns"
                value={profile.pronouns || ''}
                onChange={e => setProfile({ ...profile, pronouns: e.target.value })}
              />
              {lastSavedAt && (
                <>
                  <span className="patient-sep" />
                  <span className="saved-dot" />
                </>
              )}
            </div>
          </div>
          
          <div className="header-actions">
            {tokenUsage.input > 0 && (
              <div
                className="token-display"
                title={`Tier: ${settings.serviceTier} | Input: ${tokenUsage.input.toLocaleString()} (cached ${tokenUsage.cached.toLocaleString()}) | Output: ${tokenUsage.output.toLocaleString()}`}
              >
                <span>{(tokenUsage.input + tokenUsage.output).toLocaleString()} tokens</span>
                <span className="token-cost">est. ${tokenUsage.cost.toFixed(3)}</span>
              </div>
            )}
            <div className="progress-pill">
              <span className="progress-num">{completedSections}</span>
              <span className="progress-total">/{visibleSections.length}</span>
              <div className="progress-bar-mini">
                <div 
                  className="progress-fill-mini" 
                  style={{ width: `${(completedSections / Math.max(1, visibleSections.length)) * 100}%` }} 
                />
              </div>
            </div>
            
            <button
              onClick={generateAll}
              className="generate-btn"
              disabled={isGeneratingAll || reviewingSummary || docs.length === 0 || !settings.openaiApiKey}
            >
              {isGeneratingAll || reviewingSummary ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} strokeWidth={2} />}
              <span>{reviewingSummary ? 'Reviewing' : 'Generate'}</span>
            </button>

            <div className="relative">
              <button onClick={() => setActionsOpen(!actionsOpen)} className="icon-btn">
                <MoreHorizontal size={14} strokeWidth={1.5} />
              </button>
              {actionsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
                  <div className="dropdown-menu animate-fade-in">
                    <button
                      onClick={async () => {
                        setActionsOpen(false)
                        try {
                          await exportDocx(profile, buildExportSections(), includeChatInExport ? allChatMessages : [], { includeAppendix, includeOpenQuestions })
                          addToast('success', 'DOCX exported successfully')
                        } catch (err) {
                          console.error('DOCX export failed:', err)
                          addToast('error', 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
                        }
                      }}
                      className="dropdown-item"
                    >
                      <FileDown size={12} /> Export DOCX
                    </button>
                    <button
                      onClick={async () => {
                        setActionsOpen(false)
                        try {
                          await exportPdf(profile, buildExportSections(), includeChatInExport ? allChatMessages : [], { includeAppendix, includeOpenQuestions })
                          addToast('success', 'PDF exported successfully')
                        } catch (err) {
                          console.error('PDF export failed:', err)
                          addToast('error', 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
                        }
                      }}
                      className="dropdown-item"
                    >
                      <FileDown size={12} /> Export PDF
                    </button>
                    <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                    <button
                      onClick={() => setIncludeChatInExport(v => !v)}
                      className="dropdown-item"
                    >
                      <span className={`w-3 h-3 rounded border ${includeChatInExport ? 'bg-[var(--color-maple)] border-[var(--color-maple)]' : 'border-[var(--color-border)]'}`} />
                      Include chat
                    </button>
                    <button
                      onClick={() => setIncludeClinicianOnly(v => !v)}
                      className="dropdown-item"
                    >
                      <span className={`w-3 h-3 rounded border ${includeClinicianOnly ? 'bg-[var(--color-maple)] border-[var(--color-maple)]' : 'border-[var(--color-border)]'}`} />
                      Include clinician-only
                    </button>
                    <button
                      onClick={() => setIncludeAppendix(v => !v)}
                      className="dropdown-item"
                    >
                      <span className={`w-3 h-3 rounded border ${includeAppendix ? 'bg-[var(--color-maple)] border-[var(--color-maple)]' : 'border-[var(--color-border)]'}`} />
                      Include evidence appendix
                    </button>
                    <button
                      onClick={() => setIncludeOpenQuestions(v => !v)}
                      className="dropdown-item"
                    >
                      <span className={`w-3 h-3 rounded border ${includeOpenQuestions ? 'bg-[var(--color-maple)] border-[var(--color-maple)]' : 'border-[var(--color-border)]'}`} />
                      Include open questions
                    </button>
                    <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                    <button
                      onClick={() => {
                        runAttendingReview()
                        setActionsOpen(false)
                      }}
                      disabled={runningAttendingReview || completedSections === 0 || !settings.openaiApiKey}
                      className="dropdown-item"
                    >
                      {runningAttendingReview ? <Loader2 size={12} className="animate-spin" /> : <ClipboardCheck size={12} />}
                      Attending Review
                      {hasAttendingIssues && <span className="ml-1 text-[var(--color-error)]">({attendingReviewIssues.length})</span>}
                    </button>
                    <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                    <button
                      onClick={() => { resetOutputs(); setActionsOpen(false) }}
                      className="dropdown-item text-[var(--color-error)]"
                    >
                      <RefreshCw size={12} /> Reset all
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sections */}
          <div className="flex-1 overflow-y-auto document-shell">
            <div className="document-page" ref={documentRef} onMouseUp={handleDocumentSelection}>
              <div className="document-header">
                <div className="document-title">Psych Intake Brief</div>
                {profileLine && <div className="document-meta">{profileLine}</div>}
                <div className="document-meta muted">{docs.length} files · {completedSections}/{visibleSections.length} sections</div>
              </div>

              {visibleSections.map((section) => {
                const isSelected = selectedId === section.id
                const isGenerating = Boolean(generatingIds[section.id])
                const streamingPreview = streamingPreviews[section.id]
                const rawText = typeof streamingPreview === 'string' ? streamingPreview : (section.output || '')
                const displayText = sectionDisplayMap.get(section.id) || formatSectionDisplayText(rawText, section.id)
                const hasSelection = selectionSnippet?.sectionId === section.id
                const highlightedText = hasSelection
                  ? highlightSelectionInText(displayText, selectionSnippet?.text)
                  : displayText
                const isEditing = isSelected && editingSectionId === section.id && !isGenerating && !streamingPreview
                const hasContent = Boolean(section.output?.trim())
                const citationCount = section.citations?.length || 0
                const sectionError = sectionErrors[section.id]
                const pendingEdit = pendingEditsBySection.get(section.id)
                const pendingIsUpdate = pendingEdit
                  ? pendingEdit.editApplyMode === 'update-card'
                    || pendingEdit.editApplyMode === 'append-note'
                    || pendingEdit.editApplyMode === 'append-note-after-questions'
                  : false
                const pendingIsAnswer = pendingEdit?.editApplyMode === 'open-question-answer'
                const pendingIsSelection = pendingEdit?.editTargetScope === 'selection' && Boolean(pendingEdit.editSelectionText)

                return (
                  <div
                    key={section.id}
                    className={`section-row ${isSelected ? 'active' : ''} ${isGenerating ? 'generating' : ''} ${hasSelection ? 'has-selection' : ''}`}
                    onClick={() => {
                      setSelectedId(section.id)
                    }}
                    data-section-id={section.id}
                  >
                    <div className="section-row-header">
                      <h3 className="section-label">{section.title}</h3>
                      {section.clinicianOnly && (
                        <span className="clinician-only-badge" title="Clinician only - Do not copy forward">
                          <Lock size={8} />
                        </span>
                      )}
                      {hasContent && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />}
                      {isGenerating && <Loader2 size={10} className="animate-spin text-[var(--color-maple)]" />}
                      {citationCount > 0 && <span className="section-cite">[{citationCount}]</span>}
                      {hasContent && citationCount === 0 && <span className="section-warning">No citations</span>}
                      {isSelected && <span className="section-active-pill">Active</span>}
                      {hasSelection && <span className="section-selection-pill">Selection context</span>}
                      {(section.updateTags && section.updateTags.length > 0) && (
                        <div className="section-tag-row" title={section.updateTags.join(', ')}>
                          {section.updateTags.slice(0, 2).map(tag => (
                            <span key={tag} className="section-tag">
                              <Tag size={8} />
                              {tag}
                            </span>
                          ))}
                          {section.updateTags.length > 2 && (
                            <span className="section-tag muted">+{section.updateTags.length - 2}</span>
                          )}
                        </div>
                      )}
                      {isSelected && !isGenerating && (
                        <button
                          className={`section-action-btn ${isEditing ? 'active' : ''}`}
                          title={isEditing ? 'Done editing' : 'Edit section'}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingSectionId(prev => (prev === section.id ? null : section.id))
                          }}
                        >
                          {isEditing ? <X size={10} /> : <Pencil size={10} />}
                        </button>
                      )}
                      {hasContent && (
                        <button
                          className="section-action-btn"
                          title="Polish section"
                          onClick={(e) => {
                            e.stopPropagation()
                            polishSection(section)
                          }}
                        >
                          <Sparkles size={10} />
                        </button>
                      )}
                      <button
                        className="section-action-btn"
                        title="Regenerate section"
                        onClick={(e) => {
                          e.stopPropagation()
                          generateSection(section)
                        }}
                      >
                        <RefreshCw size={10} />
                      </button>
                    </div>
                    
                      {pendingEdit && (
                      <div className={`edit-card section-diff-card ${pendingIsAnswer ? 'answer-card' : pendingIsUpdate ? 'update-card' : ''}`}>
                        <div className="edit-card-header">
                          <span className={`edit-status pending ${pendingIsAnswer ? 'answer' : pendingIsUpdate ? 'update' : ''}`}>
                            {pendingIsAnswer ? 'Proposed answer' : pendingIsUpdate ? 'Proposed update' : 'Proposed edit'}
                          </span>
                          <span className="edit-pill">{pendingIsSelection ? 'Selection' : 'Section'}</span>
                          {pendingIsUpdate && (
                            <span className="edit-pill update-pill">{pendingEdit.updateTag || 'Update'}</span>
                          )}
                          {pendingIsAnswer && (
                            <span className="edit-pill answer-pill">Open question answer</span>
                          )}
                        </div>
                        {pendingIsUpdate && pendingEdit.updateSummary && (
                          <div className="edit-card-summary">
                            {pendingEdit.updateSummary}
                          </div>
                        )}
                        {pendingIsUpdate && pendingEdit.editApplyMode === 'append-note' ? (
                          <div className="edit-callout">
                            <Markdown
                              className="note-markdown"
                              text={formatPostInterviewNoteBlock(
                                pendingEdit.text || '',
                                pendingEdit.editNoteDate || new Date().toISOString().slice(0, 10),
                                pendingEdit.editNoteSource
                              )}
                            />
                          </div>
                        ) : pendingIsAnswer ? (
                          <div className="edit-callout">
                            <Markdown
                              className="note-markdown"
                              text={buildOpenQuestionAnswerBlock(
                                pendingEdit.editOpenQuestionText
                                  || openQuestions.find(q => q.id === pendingEdit.editOpenQuestionId)?.text
                                  || '',
                                pendingEdit.editOpenQuestionRationale
                                  || openQuestions.find(q => q.id === pendingEdit.editOpenQuestionId)?.rationale
                                  || undefined,
                                pendingEdit.text || ''
                              )}
                            />
                          </div>
                        ) : (
                          <DiffView
                            original={pendingIsSelection ? (pendingEdit.editSelectionText || '') : formatSectionText(section.output || '', section.id)}
                            suggested={pendingIsSelection ? (pendingEdit.text || '') : formatSectionText(pendingEdit.text || '', section.id)}
                          />
                        )}
                        <div className="edit-card-actions">
                          <button
                            className="edit-action-btn primary"
                            onClick={(e) => {
                              e.stopPropagation()
                              applyEditMessage(pendingEdit)
                            }}
                          >
                            Apply
                          </button>
                          <button
                            className="edit-action-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              rejectEditMessage(pendingEdit)
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="section-edit-shell">
                        <div className="section-edit-meta">
                          <span>Editing {section.title}</span>
                          <span>Cmd/Ctrl+Enter to save · Esc to cancel</span>
                        </div>
                        <div className="section-edit-toolbar">
                          <button type="button" onClick={() => insertEditorText('**', '**', 'Label')} title="Bold label">
                            **Label**
                          </button>
                          <button type="button" onClick={() => insertEditorText('Label: ', '', '')} title="Insert label">
                            Label:
                          </button>
                          <button type="button" onClick={() => insertEditorText('- ', '', '')} title="Bullet">
                            • Bullet
                          </button>
                          <button type="button" onClick={() => insertEditorText('1. ', '', '')} title="Numbered list">
                            1.
                          </button>
                          <button
                            type="button"
                            onClick={() => insertEditorText('**Key highlights:**\n- ', '', '')}
                            title="Key highlights block"
                          >
                            Highlights
                          </button>
                          <button
                            type="button"
                            onClick={() => insertEditorText('**Open questions:**\n- ', '', '')}
                            title="Open questions block"
                          >
                            Open Qs
                          </button>
                        </div>
                        <textarea 
                          className="section-edit-textarea"
                          defaultValue={section.output || ''}
                          ref={editTextareaRef}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingSectionId(null)
                            }
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              insertEditorText('  ', '', '')
                            }
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              handleUpdateSection(section.id, e.currentTarget.value)
                              setEditingSectionId(null)
                            }
                          }}
                          onBlur={(e) => {
                            handleUpdateSection(section.id, e.target.value)
                            setEditingSectionId(null)
                          }}
                        />
                      </div>
                    ) : (
                      <div 
                        className={`section-text rendered ${streamingPreview ? 'streaming' : ''}`}
                        onClick={() => setSelectedId(section.id)}
                        onDoubleClick={() => {
                          if (hasContent && !isGenerating) {
                            setEditingSectionId(section.id)
                          }
                        }}
                        title={hasContent ? 'Double-click to edit' : ''}
                      >
                        <Markdown text={highlightedText} className="note-markdown" />
                      </div>
                    )}

                    {sectionError && (
                      <div className="section-error">
                        {sectionError}
                      </div>
                    )}

                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Panel */}
          <aside className="right-panel flex flex-col">
            {/* Compact icon tabs */}
            <div className="panel-tab-bar">
              <div className="panel-tab-group">
                <button
                  className={`panel-icon-tab ${activePanel === 'evidence' ? 'active' : ''}`}
                  onClick={() => setActivePanel('evidence')}
                  title="Evidence"
                >
                  <BookOpen size={14} />
                </button>
                <button
                  className={`panel-icon-tab ${activePanel === 'chat' ? 'active' : ''}`}
                  onClick={() => setActivePanel('chat')}
                  title="Chat"
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  className={`panel-icon-tab ${activePanel === 'followup' ? 'active' : ''}`}
                  onClick={() => setActivePanel('followup')}
                  title="Updates"
                >
                  <Clock size={14} />
                </button>
                <button
                  className={`panel-icon-tab ${activePanel === 'issues' ? 'active' : ''}`}
                  onClick={() => setActivePanel('issues')}
                  title="Review issues"
                >
                  <AlertTriangle size={14} />
                  {hasAttendingIssues && <span className="tab-dot" />}
                </button>
                <button
                  className={`panel-icon-tab ${activePanel === 'usage' ? 'active' : ''}`}
                  onClick={() => setActivePanel('usage')}
                  title="Usage"
                >
                  <BarChart3 size={14} />
                </button>
                <button
                  className={`panel-icon-tab ${activePanel === 'template' ? 'active' : ''}`}
                  onClick={() => setActivePanel('template')}
                  title="Template"
                >
                  <FileText size={14} />
                </button>
              </div>
              {/* Chat controls - only show when chat is active */}
              {activePanel === 'chat' && (
                <div className="panel-tab-actions">
                  <button
                    className="panel-action-btn"
                    title="New chat"
                    onClick={() => {
                      setChatThreads(createEmptyThreads())
                      setSelectionSnippet(null)
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {activePanel === 'evidence' ? (
                <div className="p-3">
                  <div className="text-xs text-[var(--color-text-muted)] mb-2">
                    {selectedSection?.title || 'Select section'}
                  </div>
                  
                  {citations.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-text-muted)]">
                      <Quote size={16} className="mx-auto mb-2 opacity-40" />
                      <p className="text-xs">{selectedHasContent ? 'Missing citations for this section.' : 'No citations'}</p>
                      {selectedHasContent && selectedSection && (
                        <button
                          className="btn btn-ghost mt-3 text-[10px]"
                          onClick={() => generateSection(selectedSection)}
                        >
                          Regenerate with citations
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {citations.map((c, idx) => (
                        <div key={`${c.chunkId}-${idx}`} className="citation-card">
                          <span className="citation-num">[{idx + 1}]</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--color-text)] truncate">{c.sourceName}</p>
                            <p className={`citation-excerpt ${expandedCitations[`${c.chunkId}-${idx}`] ? 'expanded' : ''} ${c.excerpt.length > 160 ? 'truncated' : ''}`}>
                              {c.excerpt}
                            </p>
                            <div className="citation-actions">
                              {c.excerpt.length > 160 && (
                                <button
                                  className="citation-toggle"
                                  onClick={() => {
                                    const key = `${c.chunkId}-${idx}`
                                    setExpandedCitations(prev => ({ ...prev, [key]: !prev[key] }))
                                  }}
                                >
                                  {expandedCitations[`${c.chunkId}-${idx}`] ? 'Collapse' : 'Expand'}
                                </button>
                              )}
                              <button
                                className="citation-ask"
                                onClick={() => askAboutExcerpt(c.excerpt, c.sourceName)}
                              >
                                Ask about this quote
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activePanel === 'followup' ? (
                <div className="p-2 followup-panel">
                  <div className="template-head followup-head">
                    <div>
                      <div className="template-title">Updates</div>
                      <div className="template-subtitle followup-subtitle">Review new info and apply in-place revisions.</div>
                    </div>
                    <div className="followup-head-actions">
                      {settings.showOpenQuestions ? (
                        <div className="followup-counts">
                          <span className="followup-pill open">Open {openQuestionCounts.open}</span>
                          <span className="followup-pill answered">Answered {openQuestionCounts.answered}</span>
                        </div>
                      ) : (
                        <div className="followup-counts">
                          <span className="followup-pill muted">Open questions off</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="followup-actions">
                    <label className="action-pill cursor-pointer">
                      <Upload size={12} strokeWidth={2} />
                      <span>Upload updates</span>
                      <input
                        type="file"
                        multiple
                        accept=".txt,.md,.docx,.pdf"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length > 0) handleFollowupFiles(files)
                          e.target.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      className="action-pill"
                      onClick={applyAllPostInterviewNotes}
                      disabled={pendingFollowupCount === 0}
                      title="Apply all pending updates and open-question answers"
                    >
                      <Pencil size={12} strokeWidth={2} />
                      <span>Apply all ({pendingFollowupCount})</span>
                    </button>
                  </div>

                  <div className="followup-meta-row">
                    <div className="followup-meta">
                      {followupDocs.length > 0 ? (
                        <>
                          <span>{followupDocs.length} doc{followupDocs.length === 1 ? '' : 's'}</span>
                          {hasNewDocs && <span>New since last summary</span>}
                        </>
                      ) : (
                        <span>No docs yet</span>
                      )}
                    </div>
                    <button
                      className="followup-example-link"
                      onClick={loadFollowupExample}
                      disabled={isGeneratingAll}
                      title="Loads a sample update note and creates update cards."
                    >
                      Load example
                    </button>
                  </div>
                  {followupDocs.length > 0 && (
                    <div className="followup-docs">
                      {followupDocs.map(doc => (
                        <span key={doc.id} className="followup-doc-chip">
                          {doc.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="post-interview-panel post-interview-note">
                    <div className="post-interview-title">
                      <Pencil size={10} className="inline mr-1" />
                      Add Update
                    </div>
                    <div className="post-interview-form">
                      <select
                        className="post-interview-select"
                        value={postInterviewDraft.sectionId}
                        onChange={(e) => setPostInterviewDraft(prev => ({ ...prev, sectionId: e.target.value }))}
                      >
                        {visibleSections.map(section => (
                          <option key={section.id} value={section.id}>{section.title}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="post-interview-date"
                        value={postInterviewDraft.date}
                        onChange={(e) => setPostInterviewDraft(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <textarea
                      className="post-interview-textarea"
                      placeholder="Add new info to integrate into the section..."
                      value={postInterviewDraft.text}
                      onChange={(e) => setPostInterviewDraft(prev => ({ ...prev, text: e.target.value }))}
                    />
                    <div className="post-interview-source-row">
                      <span className="post-interview-source-label">Source</span>
                      <span className="post-interview-source-value" title={postInterviewDraft.source || followupSourceLabel || 'Auto'}>
                        {postInterviewDraft.source || followupSourceLabel || 'Auto'}
                      </span>
                      {postInterviewManualSource ? (
                        <button
                          className="post-interview-source-toggle"
                          type="button"
                          onClick={disableManualPostInterviewSource}
                        >
                          Use auto
                        </button>
                      ) : (
                        <button
                          className="post-interview-source-toggle"
                          type="button"
                          onClick={enableManualPostInterviewSource}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {postInterviewManualSource && (
                      <input
                        className="post-interview-input"
                        placeholder="Manual source"
                        value={postInterviewDraft.source}
                        onChange={(e) => setPostInterviewDraft(prev => ({ ...prev, source: e.target.value }))}
                      />
                    )}
                    <div className="post-interview-actions">
                      <button
                        className="btn btn-primary"
                        onClick={addPostInterviewNote}
                        disabled={!postInterviewDraft.text.trim() || postInterviewBusy}
                      >
                        <Pencil size={10} />
                        {postInterviewBusy ? 'Applying…' : 'Create update card'}
                      </button>
                    </div>
                  </div>

                  <div className="post-interview-panel post-interview-updates">
                    <div className="post-interview-title">Update cards</div>
                    {pendingFollowupEdits.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)]">No pending updates yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {pendingFollowupEdits.map(note => {
                          const isAnswer = note.editApplyMode === 'open-question-answer'
                          const question = isAnswer
                            ? openQuestions.find(q => q.id === note.editOpenQuestionId)
                            : null
                          const questionText = (note.editOpenQuestionText || question?.text || '').trim()
                          const questionRationale = (note.editOpenQuestionRationale || question?.rationale || '').trim() || undefined
                          const answerPreview = isAnswer
                            ? buildOpenQuestionAnswerBlock(questionText, questionRationale, note.text || '')
                            : ''
                          return (
                            <div key={note.id} className={`edit-card ${isAnswer ? 'answer-card' : 'update-card'}`}>
                              <div className="edit-card-header">
                                <span className={`edit-status pending ${isAnswer ? 'answer' : 'update'}`}>
                                  {isAnswer ? 'Proposed answer' : 'Proposed update'}
                                </span>
                                {note.editSectionTitle && (
                                  <span className="edit-pill">Section: {note.editSectionTitle}</span>
                                )}
                                {isAnswer ? (
                                  <span className="edit-pill answer-pill">Open question answer</span>
                                ) : (
                                  <span className="edit-pill update-pill">{note.updateTag || 'Update'}</span>
                                )}
                              </div>
                              {isAnswer ? (
                                <div className="edit-callout">
                                  <Markdown className="note-markdown" text={answerPreview} />
                                </div>
                              ) : (
                                <div className="edit-callout">
                                  <Markdown
                                    className="note-markdown"
                                    text={note.updateSummary || note.text}
                                  />
                                </div>
                              )}
                              <div className="edit-card-actions">
                                <button
                                  className="edit-action-btn primary"
                                  onClick={() => applyEditMessage(note)}
                                >
                                  Apply
                                </button>
                                <button
                                  className="edit-action-btn"
                                  onClick={() => rejectEditMessage(note)}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {settings.showOpenQuestions ? (
                    orderedOpenQuestions.length === 0 ? (
                      <div className="text-center py-8 text-[var(--color-text-muted)]">
                        <Quote size={16} className="mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No open questions yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderedOpenQuestions.map(q => {
                          const draftAnswer = followupAnswerDrafts[q.id] ?? ''
                          const draftSource = followupSourceDrafts[q.id] ?? followupSourceLabel
                          const openQuestionPreview = buildOpenQuestionAnswerBlock(q.text, q.rationale, q.answer)
                          return (
                            <div key={q.id} className={`followup-card ${q.status}`}>
                              <div className="followup-card-head">
                                <span className="followup-section">{q.sectionTitle}</span>
                                <span className={`followup-status ${q.status}`}>{q.status}</span>
                              </div>
                              {openQuestionPreview && (
                                <div className="edit-callout">
                                  <Markdown className="note-markdown" text={openQuestionPreview} />
                                </div>
                              )}
                              {q.answerSourceNote && (
                                <div className="followup-source">Source: {q.answerSourceNote}</div>
                              )}
                              {q.answerCitations && q.answerCitations.length > 0 && (
                                <div className="followup-citations">
                                  {q.answerCitations.map((c, idx) => (
                                    <div key={`${q.id}-cite-${idx}`} className="followup-citation">
                                      <span className="citation-num">[{idx + 1}]</span>
                                      <span className="citation-source">{c.sourceName}</span>
                                      <span className="citation-excerpt">{c.excerpt}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <textarea
                                className="followup-textarea"
                                placeholder={q.answer ? 'Update answer (optional)...' : 'Add interview answer or updated documentation summary...'}
                                value={draftAnswer}
                                onChange={(e) => setFollowupAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                              />
                              <div className="followup-source-row">
                                <span className="followup-source-label">Source</span>
                                <span className="followup-source-value" title={draftSource || followupSourceLabel || 'Auto'}>
                                  {draftSource || followupSourceLabel || 'Auto'}
                                </span>
                                {manualFollowupSources[q.id] ? (
                                  <button
                                    className="followup-source-toggle"
                                    type="button"
                                    onClick={() => disableManualFollowupSource(q.id)}
                                  >
                                    Use auto
                                  </button>
                                ) : (
                                  <button
                                    className="followup-source-toggle"
                                    type="button"
                                    onClick={() => enableManualFollowupSource(q.id)}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              {manualFollowupSources[q.id] && (
                                <input
                                  className="followup-input"
                                  placeholder="Manual source"
                                  value={draftSource}
                                  onChange={(e) => setFollowupSourceDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                                />
                              )}
                              <div className="followup-actions-row">
                                <button
                                  className="btn btn-primary"
                                  onClick={() => saveManualAnswer(q.id)}
                                  disabled={!draftAnswer.trim()}
                                >
                                  Apply answer
                                </button>
                                {q.answer && (
                                  <button className="btn btn-ghost" onClick={() => clearOpenQuestionAnswer(q.id)}>
                                    Clear answer
                                  </button>
                                )}
                                <button
                                  className="btn btn-danger"
                                  onClick={() => {
                                    if (window.confirm('Remove this open question from the document?')) {
                                      removeOpenQuestion(q.id)
                                    }
                                  }}
                                >
                                  Remove question
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 text-[var(--color-text-muted)]">
                      <Quote size={16} className="mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Open questions are disabled in Settings.</p>
                      <button
                        className="btn btn-ghost mt-3 text-[10px]"
                        onClick={() => setSettingsOpen(true)}
                      >
                        Enable open questions
                      </button>
                    </div>
                  )}
                </div>
              ) : activePanel === 'issues' ? (
                <IssuesPanel
                  issues={attendingReviewIssues}
                  running={runningAttendingReview}
                  hasApiKey={Boolean(settings.openaiApiKey)}
                  hasContent={completedSections > 0}
                  canRun={Boolean(settings.openaiApiKey) && completedSections > 0}
                  onRun={runAttendingReview}
                  onSelectSection={(sectionId) => {
                    setSelectedId(sectionId)
                    setActivePanel('chat')
                  }}
                  resolveSectionTitle={(sectionId) => getSectionTitle(sectionId) || sectionId}
                />
              ) : activePanel === 'usage' ? (
                <UsagePanel
                  totals={tokenUsage}
                  events={usageEvents}
                  onReset={() => {
                    setTokenUsage({ input: 0, cached: 0, output: 0, cost: 0 })
                    setUsageEvents([])
                  }}
                  serviceTier={settings.serviceTier}
                  semanticEnabled={settings.semanticSearch}
                  semanticReady={isSemanticReady()}
                />
              ) : activePanel === 'template' ? (
                <div className="p-3 space-y-3">
                  <div className="template-head">
                    <div>
                      <div className="template-title">Template</div>
                      <div className="template-subtitle">Reorder sections and customize titles/instructions.</div>
                    </div>
                  </div>
                  <div className="template-list">
                    <button
                      className="template-add"
                      onClick={() => insertSection()}
                    >
                      <Plus size={12} />
                      Add section
                    </button>
                    {sections.map((section, idx) => (
                      <div
                        key={section.id}
                        className={`template-card ${section.hidden ? 'muted' : ''} ${dragOverSectionId === section.id ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={() => setDraggingSectionId(section.id)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOverSectionId(section.id)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (draggingSectionId && draggingSectionId !== section.id) {
                            moveSectionTo(draggingSectionId, section.id)
                          }
                          setDraggingSectionId(null)
                          setDragOverSectionId(null)
                        }}
                        onDragEnd={() => {
                          setDraggingSectionId(null)
                          setDragOverSectionId(null)
                        }}
                      >
                        <div className="template-row">
                          <input
                            className="template-input"
                            value={section.title}
                            onChange={(e) => updateSectionMeta(section.id, { title: e.target.value })}
                            placeholder="Section title"
                          />
                          <div className="template-actions">
                            <button
                              className="template-icon-btn"
                              onClick={() => moveSection(section.id, -1)}
                              disabled={idx === 0}
                              title="Move up"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              className="template-icon-btn"
                              onClick={() => moveSection(section.id, 1)}
                              disabled={idx === sections.length - 1}
                              title="Move down"
                            >
                              <ChevronDown size={12} />
                            </button>
                            <button
                              className="template-icon-btn"
                              onClick={() => updateSectionMeta(section.id, { hidden: !section.hidden })}
                              title={section.hidden ? 'Show section' : 'Hide section'}
                            >
                              {section.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button
                              className="template-icon-btn"
                              onClick={() => insertSection(section.id)}
                              title="Add below"
                            >
                              <Plus size={12} />
                            </button>
                            <button
                              className="template-icon-btn danger"
                              onClick={() => {
                                if (window.confirm('Remove this section? This cannot be undone.')) {
                                  removeSection(section.id)
                                }
                              }}
                              title="Remove section"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="template-textarea"
                          value={section.guidance}
                          onChange={(e) => updateSectionMeta(section.id, { guidance: e.target.value })}
                          placeholder="Custom instructions for this section"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chat-shell">
                  <div className="chat-body">
                    {messagesToRender.length === 0 ? (
                      <div className="chat-welcome">
                        <div className="chat-welcome-hero">
                          <div className="chat-welcome-icon">
                            <Layers size={20} strokeWidth={1.5} />
                          </div>
                          <div className="chat-welcome-title">Psych Intake Brief</div>
                          <p className="chat-welcome-subtitle">
                            {chatMode === 'edit'
                              ? 'Request edits to the draft'
                              : chatMode === 'ask'
                                ? 'Ask about the patient or notes'
                                : 'Ask or request edits'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="chat-messages">
                        {messagesToRender.map((msg) => {
                          const hasEditCard = msg.mode === 'edit'
                            && msg.role === 'assistant'
                            && msg.editStatus
                            && msg.editTargetText !== undefined
                          const isAppendNote = msg.editApplyMode === 'append-note' || msg.editApplyMode === 'append-note-after-questions'
                          const isUpdateCard = msg.editApplyMode === 'update-card' || isAppendNote
                          const isOpenQuestionAnswer = msg.editApplyMode === 'open-question-answer'
                          const contextText = msg.contextSnippet ? msg.contextSnippet.replace(/\s+/g, ' ').trim() : ''
                          const contextDisplay = contextText.length > 240 ? `${contextText.slice(0, 240)}…` : contextText
                          const statusLabel = msg.editStatus === 'pending'
                            ? (isOpenQuestionAnswer ? 'Proposed answer' : isUpdateCard ? 'Proposed update' : 'Proposed edit')
                            : msg.editStatus === 'applied'
                              ? (msg.editApplyMode === 'append'
                                  ? 'Applied (appended)'
                                  : isUpdateCard
                                    ? 'Applied (update)'
                                    : isOpenQuestionAnswer
                                      ? 'Applied (open question answer)'
                                    : 'Applied')
                              : 'Rejected'

                          return (
                            <div key={msg.id} id={`msg-${msg.id}`} className={`msg ${msg.role}`}>
                              <div className="msg-role">
                                {msg.role === 'user' ? 'You' : 'Assistant'}
                                <span className={`msg-mode ${msg.mode}`}>{msg.mode === 'edit' ? 'Edit' : 'Ask'}</span>
                              </div>
                              <div className="msg-text">
                                {msg.role === 'user' && contextDisplay && (
                                  <div className={`msg-context ${msg.contextLabel?.startsWith('Evidence') ? 'evidence' : ''}`.trim()}>
                                    {msg.contextLabel && <div className="msg-context-label">{msg.contextLabel}</div>}
                                    <div className="msg-context-quote">“{contextDisplay}”</div>
                                  </div>
                                )}
                                {msg.isTyping ? (
                                  <span className="typing-indicator" aria-label="Assistant is thinking">
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                ) : hasEditCard ? (
                                  <div className="edit-card">
                                    <div className="edit-card-header">
                                      <span className={`edit-status ${msg.editStatus} ${msg.editStatus === 'pending' ? (isOpenQuestionAnswer ? 'answer' : isAppendNote ? 'update' : '') : ''}`}>
                                        {statusLabel}
                                      </span>
                                      {msg.editTargetScope && (
                                        <span className="edit-pill">{msg.editTargetScope === 'selection' ? 'Selection' : 'Section'}</span>
                                      )}
                                      {msg.editSectionTitle && (
                                        <span className="edit-pill">Section: {msg.editSectionTitle}</span>
                                      )}
                                      {isAppendNote && (
                                        <span className="edit-pill update-pill">Update note</span>
                                      )}
                                      {isOpenQuestionAnswer && (
                                        <span className="edit-pill answer-pill">Open question answer</span>
                                      )}
                                    </div>
                                    {msg.reviewIssue && (
                                      <div className="edit-reason">Reason: {msg.reviewIssue}</div>
                                    )}
                                    {isAppendNote ? (
                                      <div className="edit-callout">
                                        <Markdown
                                          className="note-markdown"
                                          text={formatPostInterviewNoteBlock(
                                            msg.text,
                                            msg.editNoteDate || new Date().toISOString().slice(0, 10),
                                            msg.editNoteSource
                                          )}
                                        />
                                      </div>
                                    ) : isOpenQuestionAnswer ? (
                                      <div className="edit-callout">
                                        <Markdown
                                          className="note-markdown"
                                          text={buildOpenQuestionAnswerBlock(
                                            msg.editOpenQuestionText
                                              || openQuestions.find(q => q.id === msg.editOpenQuestionId)?.text
                                              || '',
                                            msg.editOpenQuestionRationale
                                              || openQuestions.find(q => q.id === msg.editOpenQuestionId)?.rationale
                                              || undefined,
                                            msg.text
                                          )}
                                        />
                                      </div>
                                    ) : (
                                      <>
                                        <DiffView
                                          original={msg.editTargetText || ''}
                                          suggested={normalizeText(msg.text)}
                                        />
                                        {buildOpenQuestionsPreview(msg.text) && (
                                          <div className="edit-callout">
                                            <Markdown className="note-markdown" text={buildOpenQuestionsPreview(msg.text) || ''} />
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {msg.editStatus === 'pending' && (
                                      <div className="edit-card-actions">
                                        <button
                                          className="edit-action-btn primary"
                                          onClick={() => applyEditMessage(msg)}
                                        >
                                          Apply
                                        </button>
                                        <button
                                          className="edit-action-btn"
                                          onClick={() => rejectEditMessage(msg)}
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Markdown text={normalizeText(msg.text)} />
                                )}
                              </div>
                              {!msg.isTyping && msg.mode === 'ask' && msg.role === 'assistant' && selectedSection && (
                                <button
                                  className="apply-btn"
                                  onClick={() => applyAnswerToSection(msg.text, msg.citations, selectedSection.id)}
                                >
                                  Append to {selectedSection.title}
                                </button>
                              )}
                              {!msg.isTyping && msg.citations && msg.citations.length > 0 && (
                                <div className="msg-citations">
                                  {msg.citations.map((c, idx) => (
                                    <span key={idx} className="msg-cite">
                                      <Quote size={8} />
                                      {c.sourceName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="chat-composer">
                    <div className="composer-shell">
                      <div className="composer-head">
                        <div className="composer-context">
                          {selectionSnippet ? (
                            <span className="composer-context-chip selection">
                              Selection · {selectionSectionTitle}
                              <button
                                className="chip-x"
                                onClick={() => setSelectionSnippet(null)}
                                aria-label="Clear selection"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ) : selectedSection ? (
                            <span className="composer-context-chip">
                              Section · {selectedSection.title}
                            </span>
                          ) : (
                            <span className={`composer-context-chip ${chatMode === 'edit' ? 'warn' : 'muted'}`}>
                              {chatMode === 'edit' ? 'Select a section to edit' : 'All notes'}
                            </span>
                          )}
                          {evidenceContext && (
                            <span className="composer-context-chip evidence">
                              Evidence · {evidenceContext.sourceName}
                              <button
                                className="chip-x"
                                onClick={() => setEvidenceContext(null)}
                                aria-label="Clear evidence"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          )}
                        </div>
                        {selectionSnippet && selectionPreviewShort && (
                          <div className="composer-selection-preview" title={selectionPreview}>
                            "{selectionPreviewShort}"
                          </div>
                        )}
                        {evidenceContext && evidencePreviewShort && (
                          <div className="composer-selection-preview evidence" title={evidencePreview}>
                            "{evidencePreviewShort}"
                          </div>
                        )}
                        {/* Edit scope indicator - selection is context by default */}
                        {chatMode === 'edit' && selectedSection && (
                          <div className="edit-scope-indicator">
                            <span className="scope-label">Scope</span>
                            <button
                              className={`scope-btn ${editScope === 'section' ? 'active' : ''}`}
                              type="button"
                              onClick={() => setEditScope('section')}
                            >
                              Section
                            </button>
                            {selectionSnippet && (
                              <button
                                className={`scope-btn ${editScope === 'selection' ? 'active' : ''}`}
                                type="button"
                                onClick={() => setEditScope('selection')}
                              >
                                Selection only
                              </button>
                            )}
                            <span className="scope-hint">
                              {selectionSnippet ? 'Selection is context unless set to Selection only.' : 'Edits apply to the full section.'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="composer-main">
                        <textarea
                          className="composer-input"
                          ref={chatInputRef}
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          disabled={chatLoading}
                          placeholder={chatMode === 'edit' ? 'Request an edit…' : chatMode === 'ask' ? 'Ask a question…' : 'Ask or request an edit…'}
                          rows={1}
                          onInput={e => {
                            const target = e.target as HTMLTextAreaElement
                            const maxHeight = 360
                            target.style.height = 'auto'
                            const nextHeight = Math.min(target.scrollHeight, maxHeight)
                            target.style.height = `${nextHeight}px`
                            target.style.overflowY = target.scrollHeight > maxHeight ? 'auto' : 'hidden'
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey && canSend) {
                              e.preventDefault()
                              handleSend(chatInput.trim())
                              setChatInput('')
                              const target = e.target as HTMLTextAreaElement
                              target.style.height = 'auto'
                              target.style.overflowY = 'hidden'
                            }
                          }}
                        />
                      </div>

                      <div className="composer-footer">
                        <div className="composer-left">
                          <div className="mode-dropdown">
                            <button
                              className={`mode-pill ${chatMode}`}
                              onClick={() => setModeMenuOpen(prev => !prev)}
                            >
                              {chatMode === 'edit' ? 'Edit' : chatMode === 'ask' ? 'Ask' : 'Auto'}
                              <ChevronDown size={8} />
                            </button>
                            {modeMenuOpen && (
                              <>
                                <div className="mode-menu-backdrop" onClick={() => setModeMenuOpen(false)} />
                                <div className="mode-menu">
                                  <button
                                    className={`mode-menu-item ${chatMode === 'auto' ? 'active' : ''}`}
                                    onClick={() => {
                                      setChatMode('auto')
                                      setModeMenuOpen(false)
                                    }}
                                  >
                                    Auto
                                  </button>
                                  <button
                                    className={`mode-menu-item ${chatMode === 'ask' ? 'active' : ''}`}
                                    onClick={() => {
                                      setChatMode('ask')
                                      setModeMenuOpen(false)
                                    }}
                                  >
                                    Ask
                                  </button>
                                  <button
                                    className={`mode-menu-item ${chatMode === 'edit' ? 'active' : ''}`}
                                    onClick={() => {
                                      setChatMode('edit')
                                      setModeMenuOpen(false)
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <button className="model-pill" type="button" onClick={() => setSettingsOpen(true)}>
                            {settings.model || 'gpt-5.2'}
                          </button>
                        </div>

                        <div className="composer-right">
                          <button
                            className={`composer-send ${canSend ? 'ready' : ''} ${chatLoading ? 'loading' : ''}`}
                            disabled={!canSend && !chatLoading}
                            onClick={() => {
                              if (chatLoading) {
                                // Stop action could go here
                              } else if (canSend) {
                                handleSend(chatInput.trim())
                                setChatInput('')
                                if (chatInputRef.current) {
                                  chatInputRef.current.style.height = 'auto'
                                  chatInputRef.current.style.overflowY = 'hidden'
                                }
                              }
                            }}
                          >
                            {chatLoading ? (
                              <div className="composer-stop" />
                            ) : (
                              <ArrowUp size={10} strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-[var(--color-ink)]/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--color-paper)] rounded-xl p-8 text-center shadow-2xl border border-[var(--color-border)]">
            <Upload size={32} className="mx-auto mb-3 text-[var(--color-maple)]" />
            <p className="text-lg font-medium">Drop files</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">TXT, DOCX, PDF</p>
          </div>
        </div>
      )}

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      <FilePreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} onUpdate={updateDocMeta} />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
