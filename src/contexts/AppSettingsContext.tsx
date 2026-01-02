import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { AppSettings } from '../lib/types'

const STORAGE_KEY = 'psych_intake_settings'

const DEFAULT_SETTINGS: AppSettings = {
  openaiApiKey: '',
  model: 'gpt-5.2',
  serviceTier: 'flex',
  reasoningEffort: 'none',
  verbosity: 'medium',
  pdfParser: 'local',
  pdfModel: 'gpt-5-mini',
  showOpenQuestions: false,
  privacyMode: 'standard',
  semanticSearch: false,
  dsmBadgeStyle: 'clinical'
}

interface AppSettingsContextValue {
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void
  isReady: boolean
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isReady, setIsReady] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setSettings(prev => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore parse errors
    }
    setIsReady(true)
  }, [])

  // Persist to localStorage on change
  useEffect(() => {
    if (!isReady) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // ignore storage errors
    }
  }, [settings, isReady])

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }

  return (
    <AppSettingsContext.Provider value={{ settings, updateSettings, isReady }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings(): AppSettingsContextValue {
  const context = useContext(AppSettingsContext)
  if (!context) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return context
}

