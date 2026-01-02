import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ChatMessage, ChatThreads } from '../lib/types'

type ChatMode = 'auto' | 'ask' | 'edit'

interface ChatContextValue {
  threads: ChatThreads
  mode: ChatMode
  isLoading: boolean
  setMode: (mode: ChatMode) => void
  setLoading: (loading: boolean) => void
  addMessage: (thread: 'ask' | 'edit', message: ChatMessage) => void
  updateMessage: (thread: 'ask' | 'edit', id: string, updates: Partial<ChatMessage>) => void
  clearThread: (thread: 'ask' | 'edit') => void
  setThreads: (threads: ChatThreads) => void
}

const EMPTY_THREADS: ChatThreads = {
  ask: [],
  edit: []
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ChatThreads>(EMPTY_THREADS)
  const [mode, setMode] = useState<ChatMode>('auto')
  const [isLoading, setLoading] = useState(false)

  const addMessage = useCallback((thread: 'ask' | 'edit', message: ChatMessage) => {
    setThreads(prev => ({
      ...prev,
      [thread]: [...prev[thread], message]
    }))
  }, [])

  const updateMessage = useCallback((thread: 'ask' | 'edit', id: string, updates: Partial<ChatMessage>) => {
    setThreads(prev => ({
      ...prev,
      [thread]: prev[thread].map(m => m.id === id ? { ...m, ...updates } : m)
    }))
  }, [])

  const clearThread = useCallback((thread: 'ask' | 'edit') => {
    setThreads(prev => ({
      ...prev,
      [thread]: []
    }))
  }, [])

  return (
    <ChatContext.Provider value={{
      threads,
      mode,
      isLoading,
      setMode,
      setLoading,
      addMessage,
      updateMessage,
      clearThread,
      setThreads
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}

