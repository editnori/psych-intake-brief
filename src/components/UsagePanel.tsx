import { useState } from 'react'
import type { AppSettings } from '../lib/types'
import { RefreshCw, ChevronDown, ChevronRight, Download, Copy } from 'lucide-react'

interface UsageTotals {
  input: number
  cached: number
  output: number
  cost: number
}

interface UsageEvent {
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
}

interface Props {
  totals: UsageTotals
  events: UsageEvent[]
  onReset: () => void
  serviceTier: AppSettings['serviceTier']
  semanticEnabled: boolean
  semanticReady: boolean
}

const TIER_DESCRIPTIONS: Record<AppSettings['serviceTier'], string> = {
  batch: 'Batch: 50% discount, async processing',
  flex: 'Flex: 50% discount, variable latency',
  standard: 'Standard: Normal pricing, reliable latency',
  priority: 'Priority: 2x price, fastest response'
}

export function UsagePanel({
  totals,
  events,
  onReset,
  serviceTier,
  semanticEnabled,
  semanticReady
}: Props) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const totalTokens = totals.input + totals.output
  const billableInput = Math.max(0, totals.input - totals.cached)

  const toggleExpand = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportAsJson = () => {
    const data = {
      totals: {
        input: totals.input,
        cached: totals.cached,
        billableInput,
        output: totals.output,
        total: totalTokens,
        estimatedCost: totals.cost
      },
      tier: serviceTier,
      events: events.map(e => ({
        id: e.id,
        label: e.rawLabel || e.label,
        input: e.input,
        cached: e.cached,
        output: e.output,
        total: e.total,
        model: e.model,
        tier: e.tier,
        cost: e.cost,
        timestamp: new Date(e.createdAt).toISOString()
      }))
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usage-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportAsCsv = () => {
    const header = 'ID,Label,Input,Cached,Output,Total,Model,Tier,Cost,Timestamp\n'
    const rows = events.map(e => 
      `${e.id},"${(e.rawLabel || e.label).replace(/"/g, '""')}",${e.input},${e.cached},${e.output},${e.total},${e.model},${e.tier},${e.cost.toFixed(6)},${new Date(e.createdAt).toISOString()}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usage-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Calculate bar widths for visual ratio
  const maxWidth = Math.max(billableInput, totals.cached, totals.output) || 1
  const billableWidth = (billableInput / maxWidth) * 100
  const cachedWidth = (totals.cached / maxWidth) * 100
  const outputWidth = (totals.output / maxWidth) * 100

  return (
    <div className="p-3 usage-panel">
      <div className="template-head">
        <div>
          <div className="template-title">Usage</div>
          <div className="template-subtitle" title={TIER_DESCRIPTIONS[serviceTier]}>
            Token and cost tracking (estimated). Tier: <strong>{serviceTier}</strong>
          </div>
        </div>
        <div className="flex gap-1">
          <button className="action-pill" onClick={exportAsCsv} title="Export as CSV">
            <Copy size={10} />
          </button>
          <button className="action-pill" onClick={exportAsJson} title="Export as JSON">
            <Download size={10} />
          </button>
          <button className="action-pill" onClick={onReset}>
            <RefreshCw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Visual bar chart */}
      <div className="usage-bars">
        <div className="usage-bar-row">
          <span className="usage-bar-label">Billable</span>
          <div className="usage-bar-track">
            <div className="usage-bar-fill billable" style={{ width: `${billableWidth}%` }} />
          </div>
          <span className="usage-bar-value">{billableInput.toLocaleString()}</span>
        </div>
        <div className="usage-bar-row">
          <span className="usage-bar-label">Cached</span>
          <div className="usage-bar-track">
            <div className="usage-bar-fill cached" style={{ width: `${cachedWidth}%` }} />
          </div>
          <span className="usage-bar-value">{totals.cached.toLocaleString()}</span>
        </div>
        <div className="usage-bar-row">
          <span className="usage-bar-label">Output</span>
          <div className="usage-bar-track">
            <div className="usage-bar-fill output" style={{ width: `${outputWidth}%` }} />
          </div>
          <span className="usage-bar-value">{totals.output.toLocaleString()}</span>
        </div>
      </div>

      <div className="usage-summary">
        <div>
          <div className="usage-label">Total tokens</div>
          <div className="usage-value">{totalTokens.toLocaleString()}</div>
        </div>
        <div>
          <div className="usage-label">Est. cost</div>
          <div className="usage-value">${totals.cost.toFixed(3)}</div>
        </div>
      </div>

      {semanticEnabled && !semanticReady && (
        <div className="usage-warning">
          Semantic ranking is enabled but no local model is loaded yet. Falling back to lexical ranking.
        </div>
      )}

      <div className="usage-list">
        {events.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)]">No usage events yet.</div>
        ) : (
          events.map(event => {
            const isExpanded = expandedEvents.has(event.id)
            return (
              <div key={event.id} className={`usage-row ${isExpanded ? 'expanded' : ''}`}>
                <button 
                  className="usage-row-toggle"
                  onClick={() => toggleExpand(event.id)}
                  title={event.rawLabel || event.label}
                >
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  <span className="usage-row-label">{event.label}</span>
                  <span className="usage-row-time">{new Date(event.createdAt).toLocaleTimeString()}</span>
                  <span className="usage-row-cost">${event.cost.toFixed(4)}</span>
                </button>
                {isExpanded && (
                  <div className="usage-row-details">
                    <div className="usage-row-detail">
                      <span>Input</span>
                      <span>{event.input.toLocaleString()}</span>
                    </div>
                    <div className="usage-row-detail">
                      <span>Cached</span>
                      <span>{event.cached.toLocaleString()}</span>
                    </div>
                    <div className="usage-row-detail">
                      <span>Billable</span>
                      <span>{Math.max(0, event.input - event.cached).toLocaleString()}</span>
                    </div>
                    <div className="usage-row-detail">
                      <span>Output</span>
                      <span>{event.output.toLocaleString()}</span>
                    </div>
                    <div className="usage-row-detail">
                      <span>Model</span>
                      <span>{event.model}</span>
                    </div>
                    <div className="usage-row-detail">
                      <span>Tier</span>
                      <span>{event.tier}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
