import { useState, useCallback, useRef } from 'react'
import type { TemplateSection, Chunk, AppSettings } from '../lib/types'
import { generateSection } from '../lib/llm'

interface UseGenerationOptions {
  settings: AppSettings
  onUpdate?: (sectionId: string, text: string, isFinal: boolean) => void
  onError?: (sectionId: string, error: string) => void
  onComplete?: (sectionId: string) => void
}

export function useGeneration(options: UseGenerationOptions) {
  const { settings, onUpdate, onError, onComplete } = options
  const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({})
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const isGenerating = useCallback((sectionId: string) => {
    return generatingIds[sectionId] ?? false
  }, [generatingIds])

  const generate = useCallback(async (
    section: TemplateSection,
    chunks: Chunk[],
    existingOutput?: string
  ) => {
    const sectionId = section.id
    
    // Abort any existing generation for this section
    const existing = abortRefs.current.get(sectionId)
    if (existing) {
      existing.abort()
    }

    const controller = new AbortController()
    abortRefs.current.set(sectionId, controller)
    
    setGeneratingIds(prev => ({ ...prev, [sectionId]: true }))

    try {
      const result = await generateSection(
        section,
        chunks,
        settings,
        (delta) => {
          if (onUpdate) {
            onUpdate(sectionId, delta, false)
          }
        }
      )

      if (!controller.signal.aborted) {
        if (onUpdate) {
          onUpdate(sectionId, result.text, true)
        }
        if (onComplete) {
          onComplete(sectionId)
        }
      }

      return result
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Generation failed'
        if (onError) {
          onError(sectionId, message)
        }
      }
      throw error
    } finally {
      setGeneratingIds(prev => {
        const next = { ...prev }
        delete next[sectionId]
        return next
      })
      abortRefs.current.delete(sectionId)
    }
  }, [settings, onUpdate, onError, onComplete])

  const abort = useCallback((sectionId: string) => {
    const controller = abortRefs.current.get(sectionId)
    if (controller) {
      controller.abort()
      abortRefs.current.delete(sectionId)
      setGeneratingIds(prev => {
        const next = { ...prev }
        delete next[sectionId]
        return next
      })
    }
  }, [])

  const abortAll = useCallback(() => {
    for (const [id, controller] of abortRefs.current) {
      controller.abort()
    }
    abortRefs.current.clear()
    setGeneratingIds({})
  }, [])

  return {
    generate,
    abort,
    abortAll,
    isGenerating,
    generatingIds
  }
}

