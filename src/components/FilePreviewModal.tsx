import { useEffect, useState } from 'react'
import type { SourceDoc } from '../lib/types'
import { X, FileText } from 'lucide-react'

interface Props {
  doc: SourceDoc | null
  onClose: () => void
  onUpdate?: (docId: string, updates: Partial<Pick<SourceDoc, 'documentType' | 'episodeDate'>>) => void
}

const DOC_TYPE_OPTIONS: Array<{ value: SourceDoc['documentType']; label: string }> = [
  { value: 'discharge-summary', label: 'Discharge summary' },
  { value: 'psych-eval', label: 'Psych eval' },
  { value: 'progress-note', label: 'Progress note' },
  { value: 'biopsychosocial', label: 'Biopsychosocial' },
  { value: 'intake', label: 'Intake' },
  { value: 'other', label: 'Other' }
]

export function FilePreviewModal({ doc, onClose, onUpdate }: Props) {
  const [draftType, setDraftType] = useState<SourceDoc['documentType']>('other')
  const [draftDate, setDraftDate] = useState<string>('')

  useEffect(() => {
    if (!doc) return
    setDraftType(doc.documentType || 'other')
    setDraftDate(doc.episodeDate || '')
  }, [doc])

  if (!doc) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal max-w-3xl p-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <FileText size={14} className={`file-type-${doc.kind}`} />
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--color-ink)]">{doc.name}</h3>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {doc.kind.toUpperCase()} · {doc.chunks.length} chunks{doc.tag ? ` · ${doc.tag}` : ''}
                {doc.addedAt ? ` · ${new Date(doc.addedAt).toLocaleString()}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {doc.error && (
            <div className="text-[10px] text-[var(--color-error)]">Error: {doc.error}</div>
          )}
          {doc.warnings?.map((w, idx) => (
            <div key={idx} className="text-[10px] text-[var(--color-text-secondary)]">{w}</div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Document type</label>
              <select
                className="input"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as SourceDoc['documentType'])}
              >
                {DOC_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Service date</label>
              <input
                className="input"
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </div>
          </div>

          {onUpdate && (
            <div className="flex items-center justify-end">
              <button
                className="btn btn-ghost text-[10px]"
                onClick={() => onUpdate(doc.id, { documentType: draftType, episodeDate: draftDate || undefined })}
              >
                Save metadata
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="file-preview">
            {doc.text ? doc.text : 'No extracted text.'}
          </div>
        </div>
      </div>
    </div>
  )
}
