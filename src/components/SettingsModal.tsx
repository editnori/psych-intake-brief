import { useEffect, useState } from 'react'
import { X, Cpu, Cloud } from 'lucide-react'
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
      <div className="modal p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>Settings</h3>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Model settings */}
          <section>
            <p className="label mb-3">AI Model</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Model name</label>
                <input
                  className="input"
                  placeholder="gpt-4o-mini"
                  value={draft.model}
                  onChange={e => setDraft({ ...draft, model: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
            <p className="label mb-3">PDF Parsing</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, pdfParser: 'local' })}
                className={`p-4 rounded-lg border text-left transition-all ${
                  draft.pdfParser === 'local'
                    ? 'border-[var(--color-maple)] bg-[var(--color-maple-bg)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                <Cpu size={18} className={draft.pdfParser === 'local' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text-muted)]'} />
                <p className={`text-sm font-medium mt-2 ${draft.pdfParser === 'local' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text)]'}`}>
                  Local
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Fast, no API calls</p>
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, pdfParser: 'openai' })}
                className={`p-4 rounded-lg border text-left transition-all ${
                  draft.pdfParser === 'openai'
                    ? 'border-[var(--color-maple)] bg-[var(--color-maple-bg)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                <Cloud size={18} className={draft.pdfParser === 'openai' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text-muted)]'} />
                <p className={`text-sm font-medium mt-2 ${draft.pdfParser === 'openai' ? 'text-[var(--color-maple)]' : 'text-[var(--color-text)]'}`}>
                  OpenAI Vision
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Higher accuracy</p>
              </button>
            </div>

            {draft.pdfParser === 'openai' && (
              <div className="mt-3 animate-fade-in">
                <label className="field-label">Vision model</label>
                <input
                  className="input"
                  placeholder="gpt-4o-mini"
                  value={draft.pdfModel}
                  onChange={e => setDraft({ ...draft, pdfModel: e.target.value })}
                />
              </div>
            )}
          </section>

          <div className="divider" />

          {/* API Key */}
          <section>
            <p className="label mb-3">Authentication</p>
            <div>
              <label className="field-label">OpenAI API key</label>
              <input
                className="input font-mono text-sm"
                placeholder="sk-..."
                type="password"
                value={draft.openaiApiKey}
                onChange={e => setDraft({ ...draft, openaiApiKey: e.target.value })}
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-2 flex items-center gap-1.5">
                <span className="status-dot complete" />
                Stored locally only, never sent to our servers
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-end gap-3">
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
