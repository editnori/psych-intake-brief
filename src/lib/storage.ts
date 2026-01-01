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
        pdfParser: 'openai',
        pdfModel: 'gpt-5.2',
        showOpenQuestions: true
      }
    }
    const parsed = JSON.parse(raw)
    return {
      openaiApiKey: parsed.openaiApiKey || '',
      model: 'gpt-5.2',
      reasoningEffort: parsed.reasoningEffort || 'medium',
      verbosity: parsed.verbosity || 'medium',
      pdfParser: parsed.pdfParser || 'openai',
      pdfModel: 'gpt-5.2',
      showOpenQuestions: parsed.showOpenQuestions ?? true
    }
  } catch {
    return {
      openaiApiKey: '',
      model: 'gpt-5.2',
      reasoningEffort: 'medium',
      verbosity: 'medium',
      pdfParser: 'openai',
      pdfModel: 'gpt-5.2',
      showOpenQuestions: true
    }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    const normalized: AppSettings = {
      ...settings,
      model: 'gpt-5.2',
      pdfModel: settings.pdfModel || 'gpt-5.2'
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore storage errors (e.g. privacy mode)
  }
}
