import { useCallback, useEffect, useRef } from 'react'
import { calculateCost, type AppSettings, type ServiceTier } from '../lib/types'
import { onTokenUsage, type UsageData } from '../lib/llm'

interface TokenUsageEvent {
  id: string
  label: string
  rawLabel?: string
  input: number
  cached: number
  output: number
  total: number
  model: string
  tier: ServiceTier
  cost: number
  createdAt: number
}

interface UseTokenUsageOptions {
  settings: AppSettings
  onEvent?: (event: TokenUsageEvent) => void
}

function formatLabel(raw?: string): string {
  if (!raw) return 'Unknown'
  
  // Format section labels
  if (raw.startsWith('section:')) {
    const id = raw.slice(8)
    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  
  // Format edit labels
  if (raw.startsWith('edit:')) {
    return `Edit (${raw.slice(5)})`
  }
  
  // Format PDF labels
  if (raw === 'pdf-parse' || raw.startsWith('pdf')) {
    return 'PDF Parse'
  }
  
  // Format chat labels
  if (raw === 'chat' || raw.startsWith('chat:')) {
    return 'Chat'
  }
  
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function useTokenUsage(options: UseTokenUsageOptions) {
  const { settings, onEvent } = options
  const callbackRef = useRef(onEvent)
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    const unsubscribe = onTokenUsage((data: UsageData) => {
      const input = data.promptTokens || 0
      const cached = data.cachedPromptTokens || 0
      const output = data.completionTokens || 0
      const model = data.model || settings.model || 'gpt-5.2'
      const tier = data.tier || settings.serviceTier || 'standard'
      
      const cost = calculateCost(
        { input, cachedInput: cached, output },
        model,
        tier
      )

      const event: TokenUsageEvent = {
        id: crypto.randomUUID(),
        label: formatLabel(data.label),
        rawLabel: data.label,
        input,
        cached,
        output,
        total: input + output,
        model,
        tier,
        cost,
        createdAt: Date.now()
      }

      if (callbackRef.current) {
        callbackRef.current(event)
      }
    })

    return unsubscribe
  }, [settings.model, settings.serviceTier])

  return {}
}

