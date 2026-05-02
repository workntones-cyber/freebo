import { useState } from 'react'

interface Item { description: string; quantity: number; unitPrice: string }

export default function InvoiceForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }): JSX.Element {
  const today = new Date().toISOString().slice(0, 10)
  const due   = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`)
  const [clientName, setClientName]       = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [issueDate, setIssueDate]         = useState(today)
  const [dueDate, setDueDate]             = useState(due)
  const [items, setItems]                 = useState<Item[]>([{ description: '', quantity: 1, unitPrice: '' }])
  const [memo, setMemo]                   = useState('')
  const [error, setError]                 = useState('')

  const updateItem = (i: number, field: keyof Item, value: string | number) =>
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  const addItem    = () => setItems([...items, { description: '', quantity: 1, unitPrice: '' }])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const subtotal = items.reduce((s, it) => s + it.quantity * (Number(it.unitPrice) || 0), 0)

  const handleSave = async () => {
    if (!clientName) { setError('クライアント名は必須です'); return }
    if (items.some(it => !it.description || !it.unitPrice)) { setError('明細の品目と金額を入力してください'); return }
    setError('')
    await window.api.invoices.create({
      invoiceNumber, clientName, clientAddress, issueDate, dueDate,
      subtotal, totalAmount: subtotal, status: 'sent', memo,
      items: items.map(it => ({
        description: it.description, quantity: it.quantity,
        unitPrice: Number(it.unitPrice), amount: it.quantity * Number(it.unitPrice)
      }))
    })
    onSaved()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">請求書作成</h1>
        <button className="btn btn-ghost" onClick={onCancel}>← 戻る</button>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">請求書番号</label>
            <input className="form-input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">クライアント名</label>
            <input className="form-input" placeholder="〇〇株式会社" value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">発行日</label>
            <input type="date" className="form-input" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">支払期限</label>
            <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">クライアント住所（任意）</label>
          <input className="form-input" value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
        </div>

        <h3 style={{ fontSize: 14, marginBottom: 12, marginTop: 8 }}>明細</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 100px 36px', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>品目</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>数量</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>単価</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>小計</span>
          <span></span>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 100px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="form-input" placeholder="業務委託料" value={it.description} onChange={e => updateItem(i, 'description', e.target.value)} />
            <input type="number" className="form-input" value={it.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} />
            <input type="number" className="form-input" placeholder="100000" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} />
            <span style={{ textAlign: 'right' }}>{(it.quantity * (Number(it.unitPrice) || 0)).toLocaleString()} 円</span>
            {items.length > 1 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeItem(i)}>✕</button>}
          </div>
        ))}
        <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 16 }} onClick={addItem}>＋ 明細を追加</button>

        <div style={{ textAlign: 'right', padding: '12px 0', borderTop: '1px solid var(--border)', marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>合計：{subtotal.toLocaleString()} 円</span>
        </div>

        <div className="form-group">
          <label className="form-label">備考（任意）</label>
          <textarea className="form-textarea" value={memo} onChange={e => setMemo(e.target.value)} />
        </div>

        {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave}>保存する</button>
          <button className="btn btn-ghost"   onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}