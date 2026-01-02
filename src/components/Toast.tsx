import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id)
    }, toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  const icons = {
    success: <CheckCircle2 size={18} className="text-[var(--color-success)]" />,
    error: <XCircle size={18} className="text-[var(--color-error)]" />,
    info: <AlertCircle size={18} className="text-[var(--color-azure)]" />
  }

  const bgColors = {
    success: 'bg-[#ecfdf5] border-[var(--color-success)]',
    error: 'bg-[#fef2f2] border-[var(--color-error)]',
    info: 'bg-[#eff6ff] border-[var(--color-azure)]'
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 shadow-lg ${bgColors[toast.type]} animate-slide-in`}
      role="alert"
    >
      {icons[toast.type]}
      <span className="flex-1 text-sm text-[var(--color-text)]">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// Toast context for global access
type ToastFn = (type: ToastType, message: string, duration?: number) => void
let globalToast: ToastFn | null = null

export function setGlobalToast(fn: ToastFn | null) {
  globalToast = fn
}

export function toast(type: ToastType, message: string, duration?: number) {
  if (globalToast) {
    globalToast(type, message, duration)
  }
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (type: ToastType, message: string, duration?: number) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, type, message, duration }])
  }

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    setGlobalToast(addToast)
    return () => setGlobalToast(null)
  }, [])

  return { toasts, addToast, dismissToast }
}

