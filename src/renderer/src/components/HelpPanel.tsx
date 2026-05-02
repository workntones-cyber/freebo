import { useEffect } from 'react'

interface Props {
  title: string
  description: string
  example?: string
  onClose: () => void
}

export default function HelpPanel({ title, description, example, onClose }: Props): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div className="help-overlay" onClick={onClose} />
      <div className="help-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>📖 {title}</h3>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
        </div>
        <p>{description}</p>
        {example && <div className="example">💡 例）{example}</div>}
      </div>
    </>
  )
}