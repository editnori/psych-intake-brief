import type { AppSettings } from './types'

const SETTINGS_KEY = 'psych_intake_settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      return {
        openaiApiKey: '',
        model: 'gpt-5.2',
        reasoningEffort: 'medium',
        verbosity: 'medium',
        pdfParser: 'local',
        pdfModel: 'gpt-4o-mini'
      }
    }
    const parsed = JSON.parse(raw)
    return {
      openaiApiKey: parsed.openaiApiKey || '',
      model: parsed.model || 'gpt-5.2',
      reasoningEffort: parsed.reasoningEffort || 'medium',
      verbosity: parsed.verbosity || 'medium',
      pdfParser: parsed.pdfParser || 'local',
      pdfModel: parsed.pdfModel || 'gpt-4o-mini'
    }
  } catch {
    return {
      openaiApiKey: '',
      model: 'gpt-5.2',
      reasoningEffort: 'medium',
      verbosity: 'medium',
      pdfParser: 'local',
      pdfModel: 'gpt-4o-mini'
    }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage errors (e.g. privacy mode)
  }
}
