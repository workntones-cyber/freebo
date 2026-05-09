import { useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface Props {
  toasts: ToastMessage[]
  onRemove: (id: number) => void
}

export default function Toast({ toasts, onRemove }: Props): JSX.Element {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 99999, pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 20px', borderRadius: 'var(--radius)',
          background: t.type === 'success' ? '#1a3a2e' : t.type === 'error' ? '#3a1a1a' : 'var(--bg3)',
          border: `1px solid ${t.type === 'success' ? '#28a870' : t.type === 'error' ? '#d94f4f' : 'var(--border)'}`,
          color: t.type === 'success' ? '#28a870' : t.type === 'error' ? '#d94f4f' : 'var(--text)',
          fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'auto',
          animation: 'slideIn 0.2s ease',
        }}>
          {t.type === 'success' ? '✅ ' : t.type === 'error' ? '❌ ' : 'ℹ️ '}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// トースト管理フック
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const show = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  return { toasts, show, remove }
}