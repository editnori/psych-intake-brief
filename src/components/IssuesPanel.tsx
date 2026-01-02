import type { AttendingReviewIssue } from '../lib/llm'
import { AlertTriangle, ClipboardCheck, Loader2 } from 'lucide-react'

interface Props {
  issues: AttendingReviewIssue[]
  running: boolean
  hasApiKey: boolean
  hasContent: boolean
  canRun: boolean
  onRun: () => void
  onSelectSection: (sectionId: string) => void
  resolveSectionTitle: (sectionId: string) => string
}

export function IssuesPanel({
  issues,
  running,
  hasApiKey,
  hasContent,
  canRun,
  onRun,
  onSelectSection,
  resolveSectionTitle
}: Props) {
  return (
    <div className="p-3 issues-panel">
      <div className="template-head">
        <div>
          <div className="template-title">Review Issues</div>
          <div className="template-subtitle">Pre-signing checks for NP/PA workflows.</div>
        </div>
        <button
          className="action-pill"
          onClick={onRun}
          disabled={running || !canRun}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <ClipboardCheck size={12} />}
          <span>{running ? 'Reviewing' : 'Run review'}</span>
        </button>
      </div>

      {!hasApiKey && (
        <div className="text-xs text-[var(--color-text-muted)] mt-3">
          Add an API key in Settings to run the review.
        </div>
      )}
      {hasApiKey && !hasContent && (
        <div className="text-xs text-[var(--color-text-muted)] mt-3">
          Generate at least one section before running review.
        </div>
      )}

      {issues.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          <AlertTriangle size={16} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No review issues yet.</p>
        </div>
      ) : (
        <div className="space-y-2 mt-3">
          {issues.map((issue, idx) => (
            <div key={`${issue.sectionId}-${idx}`} className={`issue-card severity-${issue.severity}`}>
              <div className="issue-header">
                <span className={`issue-severity ${issue.severity}`}>{issue.severity}</span>
                <button
                  className="issue-section"
                  onClick={() => onSelectSection(issue.sectionId)}
                >
                  {resolveSectionTitle(issue.sectionId)}
                </button>
              </div>
              <div className="issue-text">{issue.issue}</div>
              {issue.suggestion && (
                <div className="issue-suggestion">Suggestion: {issue.suggestion}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
