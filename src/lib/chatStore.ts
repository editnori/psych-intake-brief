import type { ChatMessage, ChatThreads } from './types'

/**
 * Chat store abstraction for managing chat threads
 * Provides a clean interface for chat operations without coupling to React state
 */

export type ChatMode = 'ask' | 'edit'

/**
 * Create initial empty chat threads
 */
export function createEmptyThreads(): ChatThreads {
  return { ask: [], edit: [] }
}

/**
 * Get messages from a specific thread
 */
export function getThread(threads: ChatThreads, mode: ChatMode): ChatMessage[] {
  return threads[mode]
}

/**
 * Append a message to a thread
 */
export function appendMessage(
  threads: ChatThreads,
  mode: ChatMode,
  message: ChatMessage
): ChatThreads {
  return {
    ...threads,
    [mode]: [...threads[mode], message]
  }
}

/**
 * Update the last message in a thread (for streaming)
 */
export function updateLastMessage(
  threads: ChatThreads,
  mode: ChatMode,
  updater: (msg: ChatMessage) => ChatMessage
): ChatThreads {
  const thread = threads[mode]
  if (thread.length === 0) return threads
  
  const updated = [...thread]
  updated[updated.length - 1] = updater(updated[updated.length - 1])
  
  return {
    ...threads,
    [mode]: updated
  }
}

/**
 * Clear a specific thread
 */
export function clearThread(threads: ChatThreads, mode: ChatMode): ChatThreads {
  return {
    ...threads,
    [mode]: []
  }
}

/**
 * Clear all threads
 */
export function clearAllThreads(): ChatThreads {
  return createEmptyThreads()
}

/**
 * Create a user message
 */
export function createUserMessage(
  content: string,
  options?: {
    sectionId?: string
    sectionTitle?: string
    selectionSnippet?: string
    mode?: ChatMode
  }
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    timestamp: Date.now(),
    sectionId: options?.sectionId,
    sectionTitle: options?.sectionTitle,
    selectionSnippet: options?.selectionSnippet
  }
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(
  content: string = '',
  options?: {
    loading?: boolean
    sectionId?: string
    revisedOutput?: string
    editApplied?: boolean
    editApplyMode?: ChatMessage['editApplyMode']
    editNoteDate?: string
    editNoteSource?: string
    editOpenQuestionId?: string
    editOpenQuestionText?: string
    editOpenQuestionRationale?: string
    reviewIssue?: string
  }
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    loading: options?.loading,
    sectionId: options?.sectionId,
    revisedOutput: options?.revisedOutput,
    editApplied: options?.editApplied,
    editApplyMode: options?.editApplyMode,
    editNoteDate: options?.editNoteDate,
    editNoteSource: options?.editNoteSource,
    editOpenQuestionId: options?.editOpenQuestionId,
    editOpenQuestionText: options?.editOpenQuestionText,
    editOpenQuestionRationale: options?.editOpenQuestionRationale,
    reviewIssue: options?.reviewIssue
  }
}

/**
 * Get the count of messages across all threads
 */
export function getTotalMessageCount(threads: ChatThreads): number {
  return threads.ask.length + threads.edit.length
}

/**
 * Check if there are any messages in the threads
 */
export function hasMessages(threads: ChatThreads): boolean {
  return getTotalMessageCount(threads) > 0
}

