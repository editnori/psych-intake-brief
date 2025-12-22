import { useEffect, useState } from 'react'
import { X, Cpu, Cloud, HelpCircle } from 'lucide-react'
import type { AppSettings } from '../lib/types'

interface Props {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

export function SettingsModal({ open, settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settings, open])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  if (!open) return null

  function handleSave() {
    onSave(draft)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal p-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-serif)' }}>Settings</h3>
          <button onClick={onClose} className="btn-icon">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Model settings */}
          <section>
            <p className="label mb-2">AI Model</p>
            <div className="space-y-2">
              <div>
                <label className="field-label">Model name</label>
                <div className="input flex items-center justify-between">
                  <span className="text-[var(--color-text)]">gpt-5.2</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">Locked</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">Reasoning</label>
                  <select
                    className="input"
                    value={draft.reasoningEffort}
                    onChange={e => setDraft({ ...draft, reasoningEffort: e.target.value as AppSettings['reasoningEffort'] })}
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="xhigh">Maximum</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Verbosity</label>
                  <select
                    className="input"
                    value={draft.verbosity}
                    onChange={e => setDraft({ ...draft, verbosity: e.target.value as AppSettings['verbosity'] })}
                  >
                    <option value="low">Concise</option>
                    <option value="medium">Balanced</option>
                    <option value="high">Detailed</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <div className="divider" />

          {/* PDF Parsing */}
          <section>
            <p className="label mb-2">PDF Parsing</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, pdfParser: 'local' })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  draft.pdfParser === 'local'
                    ? 'border-[var(--color-maple)] bg-[var(--color-maple-bg)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                <Cpu size={16} className={draft.pdfParser === 'local' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text-muted)]'} />
                <p className={`text-[11px] font-medium mt-1.5 ${draft.pdfParser === 'local' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text)]'}`}>
                  Local
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Fast, no API calls</p>
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, pdfParser: 'openai' })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  draft.pdfParser === 'openai'
                    ? 'border-[var(--color-maple)] bg-[var(--color-maple-bg)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                <Cloud size={16} className={draft.pdfParser === 'openai' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text-muted)]'} />
                <p className={`text-[11px] font-medium mt-1.5 ${draft.pdfParser === 'openai' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text)]'}`}>
                  OpenAI Vision
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Higher accuracy</p>
              </button>
            </div>

            {draft.pdfParser === 'openai' && (
              <div className="mt-3 animate-fade-in">
                <label className="field-label">Vision model</label>
                <div className="input flex items-center justify-between">
                  <span className="text-[var(--color-text)]">gpt-5.2 (vision)</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">Locked</span>
                </div>
              </div>
            )}
          </section>

          <div className="divider" />

          {/* Generation Options */}
          <section>
            <p className="label mb-2">Generation Options</p>
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-[var(--color-text-muted)]" />
                <div>
                  <p className="text-[11px] font-medium text-[var(--color-text)]">Open Questions</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Generate follow-up questions for missing clinical info</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, showOpenQuestions: !draft.showOpenQuestions })}
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  draft.showOpenQuestions ? 'bg-[var(--color-maple)]' : 'bg-[var(--color-border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    draft.showOpenQuestions ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </section>

          <div className="divider" />

          {/* API Key */}
          <section>
            <p className="label mb-2">Authentication</p>
            <div>
              <label className="field-label">OpenAI API key</label>
              <input
                className="input font-mono text-[11px]"
                placeholder="sk-..."
                type="password"
                value={draft.openaiApiKey}
                onChange={e => setDraft({ ...draft, openaiApiKey: e.target.value })}
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-2 flex items-center gap-1.5">
                <span className="status-dot complete" />
                Stored locally only, never sent to our servers
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
