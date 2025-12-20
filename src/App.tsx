import { useEffect, useMemo, useState } from 'react'
import { FileText, Sparkles, RefreshCw, FileDown, Loader2, Plus, FolderOpen, Settings, Upload, ChevronRight, Quote, ArrowUp, MoreHorizontal, X, File, MessageSquare, Layers, BookOpen } from 'lucide-react'
import { TEMPLATE_SECTIONS } from './lib/template'
import type { AppSettings, SourceDoc, TemplateSection, PatientProfile, ChatMessage } from './lib/types'
import { loadFiles, mergeDocuments, makeDocFromText } from './lib/parser'
import { rankEvidence } from './lib/evidence'
import { generateSectionLocally, generateSectionWithOpenAI, askWithOpenAI } from './lib/llm'
import { loadSettings, saveSettings } from './lib/storage'
import { loadCase, saveCase, deleteCase, listCases } from './lib/caseStore'
import { exportDocx, exportPdf } from './lib/exporters'
import { SettingsModal } from './components/SettingsModal'

export function App() {
  const [docs, setDocs] = useState<SourceDoc[]>([])
  const [sections, setSections] = useState<TemplateSection[]>(TEMPLATE_SECTIONS)
  const [selectedId, setSelectedId] = useState<string>(TEMPLATE_SECTIONS[0]?.id || '')
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [profile, setProfile] = useState<PatientProfile>({ name: '', mrn: '', dob: '' })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [applyChatToSection, setApplyChatToSection] = useState(true)
  const [activePanel, setActivePanel] = useState<'evidence' | 'chat'>('chat')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [includeChatInExport, setIncludeChatInExport] = useState(true)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [cases, setCases] = useState<Array<{ id: string; savedAt: number; profile: PatientProfile }>>([])
  const [actionsOpen, setActionsOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  const allChunks = useMemo(() => mergeDocuments(docs), [docs])
  const hasCaseContent = useMemo(() => {
    if (docs.length > 0) return true
    if (chatMessages.length > 0) return true
    if (profile.name || profile.mrn || profile.dob) return true
    return sections.some(s => Boolean(s.output && s.output.trim()))
  }, [docs.length, chatMessages.length, profile, sections])

  const selectedSection = useMemo(
    () => sections.find(s => s.id === selectedId) || null,
    [sections, selectedId]
  )

  const completedSections = useMemo(
    () => sections.filter(s => s.output && s.output.trim()).length,
    [sections]
  )

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
      if (files.length > 0) handleFiles(files)
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  // Load saved case
  useEffect(() => {
    const existingCases = listCases()
    setCases(existingCases)
    const existing = loadCase()
    if (existing) {
      setCaseId(existing.id)
      setProfile(existing.profile)
      setDocs(existing.docs)
      setChatMessages(existing.chat || [])
      setSections(prev => prev.map(s => {
        const saved = existing.sections.find(x => x.id === s.id)
        return saved ? { ...s, output: saved.output, citations: saved.citations } : s
      }))
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
      const saved = saveCase(caseId, profile, docs, sections, chatMessages)
      setCaseId(saved.id)
      setLastSavedAt(new Date(saved.savedAt).toLocaleString())
      setCases(listCases())
    }, 1200)
    return () => clearTimeout(t)
  }, [profile, docs, sections, chatMessages, hydrated, caseId, hasCaseContent])

  async function handleFiles(files: File[]) {
    const hasPdf = files.some(file => file.name.toLowerCase().endsWith('.pdf'))
    setStatus(hasPdf && settings.pdfParser === 'openai' ? 'Parsing with OpenAI...' : 'Processing files...')
    const loaded = await loadFiles(files, settings)
    setDocs(prev => [...prev, ...loaded])
    setStatus(null)
  }

  async function loadExamples() {
    setStatus('Loading examples...')
    try {
      const res = await fetch('/examples/examples.json')
      const data = await res.json()
      const files: string[] = data.files || []
      const loaded: SourceDoc[] = []
      for (const file of files) {
        const text = await fetch(`/examples/${file}`).then(r => r.text())
        loaded.push(makeDocFromText(file, text, 'txt'))
      }
      setDocs(prev => [...prev, ...loaded])
      setProfile({
        name: 'Jane Doe (Example)',
        mrn: 'EX-20411',
        dob: '1991-05-14',
        sex: 'female'
      })
    } catch {
      setStatus('Failed to load examples')
      setTimeout(() => setStatus(null), 1500)
      return
    }
    setStatus(null)
  }

  function handleUpdateSection(id: string, text: string) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, output: text } : s)))
  }

  async function generateSection(section: TemplateSection) {
    if (docs.length === 0) {
      setStatus('Upload files first')
      setTimeout(() => setStatus(null), 1500)
      return
    }

    setGeneratingId(section.id)
    const evidence = rankEvidence(`${section.title} ${section.guidance}`, allChunks, 6)

    try {
      const generated = settings.openaiApiKey
        ? await generateSectionWithOpenAI(section, evidence, settings, (text) => {
            setSections(prev => prev.map(s => (s.id === section.id ? { ...s, output: text } : s)))
          })
        : generateSectionLocally(section, evidence)

      setSections(prev => prev.map(s => (s.id === section.id ? { ...s, output: generated.text, citations: generated.citations } : s)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      setStatus(message)
      setTimeout(() => setStatus(null), 2000)
    } finally {
      setGeneratingId(null)
    }
  }

  async function generateAll() {
    if (docs.length === 0) {
      setStatus('Upload files first')
      setTimeout(() => setStatus(null), 1500)
      return
    }

    setIsGeneratingAll(true)
    setStatus('Generating all sections...')
    for (const section of sections) {
      await generateSection(section)
    }
    setStatus(null)
    setIsGeneratingAll(false)
  }

  function resetOutputs() {
    setSections(prev => prev.map(s => ({ ...s, output: '', citations: [] })))
  }

  function handleSaveSettings(next: AppSettings) {
    setSettings(next)
    saveSettings(next)
  }

  async function handleAsk(question: string) {
    const msg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: question, createdAt: Date.now() }
    setChatMessages(prev => [...prev, msg])
    setStatus('Thinking...')
    try {
      const evidence = selectedSection ? rankEvidence(`${selectedSection.title} ${question}`, allChunks, 6) : allChunks.slice(0, 6)
      const answer = settings.openaiApiKey
        ? await askWithOpenAI(question, evidence, settings)
        : { text: 'Configure an OpenAI key to ask questions.', citations: [] }
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: answer.text,
        citations: answer.citations,
        createdAt: Date.now()
      }
      setChatMessages(prev => [...prev, reply])
      if (applyChatToSection && selectedSection) {
        setSections(prev => prev.map(s => {
          if (s.id !== selectedSection.id) return s
          const mergedText = [s.output, answer.text].filter(Boolean).join('\n')
          const mergedCitations = [...(s.citations || []), ...answer.citations]
          return { ...s, output: mergedText, citations: mergedCitations }
        }))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      setStatus(message)
      setTimeout(() => setStatus(null), 1500)
    } finally {
      setStatus(null)
    }
  }

  function handleSelectCase(id: string) {
    const existing = loadCase(id)
    if (!existing) return
    setCaseId(existing.id)
    setProfile(existing.profile)
    setDocs(existing.docs)
    setChatMessages(existing.chat || [])
    setSections(prev => prev.map(s => {
      const saved = existing.sections.find(x => x.id === s.id)
      return saved ? { ...s, output: saved.output, citations: saved.citations } : { ...s, output: '', citations: [] }
    }))
    if (existing.savedAt) {
      setLastSavedAt(new Date(existing.savedAt).toLocaleString())
    }
  }

  function handleNewCase() {
    setCaseId(null)
    setProfile({ name: '', mrn: '', dob: '' })
    setDocs([])
    setChatMessages([])
    resetOutputs()
    setLastSavedAt(null)
  }

  function handleDeleteCase(id: string) {
    deleteCase(id)
    setCases(listCases())
    if (id === caseId) handleNewCase()
  }

  const citations = selectedSection?.citations || []

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-canvas)]">
      {/* Left Sidebar - Compact */}
      <aside className={`sidebar flex flex-col h-full transition-all duration-200 ${sidebarExpanded ? 'w-52' : 'w-11'}`}>
        {/* Header + collapse */}
        <div className="px-2.5 py-2.5 flex items-center gap-2">
          <div className="logo-icon flex-shrink-0">
            <Layers size={14} strokeWidth={1.5} />
          </div>
          {sidebarExpanded && (
            <>
              <span className="text-xs font-medium text-[var(--color-ink)] truncate flex-1">Summarizer</span>
              <button onClick={() => setSidebarExpanded(false)} className="icon-btn">
                <ChevronRight size={14} className="rotate-180" />
              </button>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className={`px-2 pb-1.5 ${sidebarExpanded ? 'flex gap-1' : 'flex flex-col gap-1'}`}>
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
                <p className="text-xs text-[var(--color-text-muted)]">No cases yet</p>
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
                  <div key={doc.id} className="case-item">
                    <FileText size={14} className={`flex-shrink-0 file-type-${doc.kind}`} />
                    <span className="flex-1 truncate text-xs">{doc.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-2 mt-auto flex items-center gap-1">
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
        <header className="header-bar flex items-center px-4 gap-3">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {hasCaseContent ? (
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
                {lastSavedAt && (
                  <>
                    <span className="patient-sep" />
                    <span className="saved-dot" />
                  </>
                )}
              </div>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)]">No patient selected</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="progress-pill">
              <span className="progress-num">{completedSections}</span>
              <span className="progress-total">/{sections.length}</span>
              <div className="progress-bar-mini">
                <div 
                  className="progress-fill-mini" 
                  style={{ width: `${(completedSections / sections.length) * 100}%` }} 
                />
              </div>
            </div>
            
            <button
              onClick={generateAll}
              className="generate-btn"
              disabled={isGeneratingAll || docs.length === 0}
            >
              {isGeneratingAll ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} strokeWidth={2} />}
              <span>Generate</span>
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
                      onClick={() => { exportDocx(profile, sections, includeChatInExport ? chatMessages : []); setActionsOpen(false) }}
                      className="dropdown-item"
                    >
                      <FileDown size={12} /> Export DOCX
                    </button>
                    <button
                      onClick={() => { exportPdf(profile, sections, includeChatInExport ? chatMessages : []); setActionsOpen(false) }}
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
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto py-6 px-8">
              {sections.map((section, idx) => {
                const isSelected = selectedId === section.id
                const isGenerating = generatingId === section.id
                const hasContent = Boolean(section.output?.trim())

                return (
                  <div
                    key={section.id}
                    className={`section-row ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedId(section.id)}
                  >
                    <div className="section-row-header">
                      <span className="section-num">{String(idx + 1).padStart(2, '0')}</span>
                      <h3 className="section-label">{section.title}</h3>
                      {hasContent && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />}
                      {isGenerating && <Loader2 size={10} className="animate-spin text-[var(--color-maple)]" />}
                    </div>
                    
                    <div 
                      className="section-text"
                      contentEditable={isSelected}
                      suppressContentEditableWarning
                      onBlur={(e) => handleUpdateSection(section.id, e.currentTarget.textContent || '')}
                      onFocus={() => setSelectedId(section.id)}
                      data-placeholder={section.placeholder || 'Click to add...'}
                    >
                      {section.output || ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Panel */}
          <aside className="right-panel flex flex-col">
            {/* Tabs - compact */}
            <div className="panel-tabs">
              <button
                className={`panel-tab flex-1 ${activePanel === 'evidence' ? 'active' : ''}`}
                onClick={() => setActivePanel('evidence')}
              >
                <BookOpen size={13} />
                Evidence
              </button>
              <button
                className={`panel-tab flex-1 ${activePanel === 'chat' ? 'active' : ''}`}
                onClick={() => setActivePanel('chat')}
              >
                <MessageSquare size={13} />
                Chat
              </button>
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
                      <p className="text-xs">No citations</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {citations.map((c, idx) => (
                        <div key={`${c.chunkId}-${idx}`} className="citation-card">
                          <span className="citation-num">[{idx + 1}]</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--color-text)] truncate">{c.sourceName}</p>
                            <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2">{c.excerpt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center px-4">
                        <div>
                          <Sparkles size={20} className="mx-auto mb-2 text-[var(--color-maple)] opacity-50" />
                          <p className="text-xs text-[var(--color-text-muted)]">Ask about the patient</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 space-y-3">
                        {chatMessages.map((msg) => (
                          <div key={msg.id} className={`msg ${msg.role}`}>
                            <div className="msg-role">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                            <div className="msg-text">{msg.text}</div>
                            {msg.citations && msg.citations.length > 0 && (
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
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="chat-input-wrap">
                    <div className="chat-box">
                      <input
                        className="chat-field"
                        placeholder="Add a follow-up..."
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        disabled={Boolean(status)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                            e.preventDefault()
                            handleAsk(chatInput.trim())
                            setChatInput('')
                          }
                        }}
                      />
                      <div className="chat-box-footer">
                        <div className="chat-meta">
                          <button 
                            className={`chat-toggle ${applyChatToSection ? 'on' : ''}`}
                            onClick={() => setApplyChatToSection(!applyChatToSection)}
                            title="Apply to document"
                          >
                            <FileText size={11} />
                            <span>Apply to doc</span>
                          </button>
                          <span className="model-badge">GPT-4o</span>
                        </div>
                        <button
                          className={`send-btn ${chatInput.trim() ? 'ready' : ''}`}
                          disabled={Boolean(status) || !chatInput.trim()}
                          onClick={() => {
                            if (chatInput.trim()) {
                              handleAsk(chatInput.trim())
                              setChatInput('')
                            }
                          }}
                        >
                          {status ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-ink)] text-white text-xs shadow-lg">
            <Loader2 size={12} className="animate-spin" />
            {status}
          </div>
        </div>
      )}

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
    </div>
  )
}
