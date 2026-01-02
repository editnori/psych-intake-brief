import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AppSettings } from '../lib/types'
import { calculateCost } from '../lib/types'

export interface UsageEvent {
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

export interface UsageTotals {
  input: number
  cached: number
  output: number
  cost: number
}

interface UsageContextValue {
  totals: UsageTotals
  events: UsageEvent[]
  addEvent: (event: Omit<UsageEvent, 'id' | 'createdAt'>) => void
  reset: () => void
}

const UsageContext = createContext<UsageContextValue | null>(null)

export function UsageProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<UsageEvent[]>([])

  const totals: UsageTotals = events.reduce(
    (acc, e) => ({
      input: acc.input + e.input,
      cached: acc.cached + e.cached,
      output: acc.output + e.output,
      cost: acc.cost + e.cost
    }),
    { input: 0, cached: 0, output: 0, cost: 0 }
  )

  const addEvent = useCallback((event: Omit<UsageEvent, 'id' | 'createdAt'>) => {
    const newEvent: UsageEvent = {
      ...event,
      id: crypto.randomUUID(),
      createdAt: Date.now()
    }
    setEvents(prev => [...prev, newEvent])
  }, [])

  const reset = useCallback(() => {
    setEvents([])
  }, [])

  return (
    <UsageContext.Provider value={{ totals, events, addEvent, reset }}>
      {children}
    </UsageContext.Provider>
  )
}

export function useUsage(): UsageContextValue {
  const context = useContext(UsageContext)
  if (!context) {
    throw new Error('useUsage must be used within UsageProvider')
  }
  return context
}

/**
 * Helper to create a usage event from raw token data
 */
export function createUsageEvent(
  input: number,
  cached: number,
  output: number,
  model: string,
  tier: AppSettings['serviceTier'],
  label: string,
  rawLabel?: string
): Omit<UsageEvent, 'id' | 'createdAt'> {
  const cost = calculateCost({ input, cachedInput: cached, output }, model, tier)
  return {
    label,
    rawLabel,
    input,
    cached,
    output,
    total: input + output,
    model,
    tier,
    cost
  }
}

