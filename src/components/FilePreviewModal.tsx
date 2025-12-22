import type { SourceDoc } from '../lib/types'
import { X, FileText } from 'lucide-react'

interface Props {
  doc: SourceDoc | null
  onClose: () => void
}

export function FilePreviewModal({ doc, onClose }: Props) {
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

        <div className="px-4 py-3 space-y-2">
          {doc.error && (
            <div className="text-[10px] text-[var(--color-error)]">Error: {doc.error}</div>
          )}
          {doc.warnings?.map((w, idx) => (
            <div key={idx} className="text-[10px] text-[var(--color-text-secondary)]">{w}</div>
          ))}
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
