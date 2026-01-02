import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, ChatThreads, AppSettings, TemplateSection, Chunk } from '../lib/types'
import { answerQuestion, requestEdit, type EditResult } from '../lib/llm'

type ChatMode = 'auto' | 'ask' | 'edit'

interface UseChatOptions {
  settings: AppSettings
  onMessageAdd?: (thread: 'ask' | 'edit', message: ChatMessage) => void
  onMessageUpdate?: (thread: 'ask' | 'edit', id: string, updates: Partial<ChatMessage>) => void
}

export function useChatOperations(options: UseChatOptions) {
  const { settings, onMessageAdd, onMessageUpdate } = options
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendQuestion = useCallback(async (
    question: string,
    chunks: Chunk[],
    sections: TemplateSection[]
  ): Promise<ChatMessage | null> => {
    if (isLoading) return null

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
      createdAt: Date.now()
    }

    if (onMessageAdd) {
      onMessageAdd('ask', userMessage)
    }

    setIsLoading(true)

    try {
      const response = await answerQuestion(question, chunks, sections, settings)
      
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: response.answer,
        citations: response.citations,
        createdAt: Date.now()
      }

      if (onMessageAdd) {
        onMessageAdd('ask', assistantMessage)
      }

      return assistantMessage
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        createdAt: Date.now()
      }

      if (onMessageAdd) {
        onMessageAdd('ask', errorMessage)
      }

      return errorMessage
    } finally {
      setIsLoading(false)
    }
  }, [settings, isLoading, onMessageAdd])

  const sendEditRequest = useCallback(async (
    request: string,
    targetSection: TemplateSection,
    chunks: Chunk[],
    options?: { scope?: 'selection' | 'section'; selectionText?: string }
  ): Promise<EditResult | null> => {
    if (isLoading) return null

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: request,
      editTargetScope: options?.scope,
      editSelectionText: options?.selectionText,
      editSectionId: targetSection.id,
      editSectionTitle: targetSection.title,
      createdAt: Date.now()
    }

    if (onMessageAdd) {
      onMessageAdd('edit', userMessage)
    }

    setIsLoading(true)

    try {
      const result = await requestEdit(
        request,
        targetSection,
        chunks,
        settings,
        options
      )

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: result.revisedText,
        editStatus: 'pending',
        editApplyMode: result.applyMode,
        createdAt: Date.now()
      }

      if (onMessageAdd) {
        onMessageAdd('edit', assistantMessage)
      }

      return result
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Failed to process edit'}`,
        createdAt: Date.now()
      }

      if (onMessageAdd) {
        onMessageAdd('edit', errorMessage)
      }

      return null
    } finally {
      setIsLoading(false)
    }
  }, [settings, isLoading, onMessageAdd])

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setIsLoading(false)
    }
  }, [])

  return {
    sendQuestion,
    sendEditRequest,
    abort,
    isLoading
  }
}

