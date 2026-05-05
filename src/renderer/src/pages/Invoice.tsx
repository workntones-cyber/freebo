import { useEffect, useState } from 'react'

interface InvoiceRow {
  id: number
  invoice_number: string
  client_name: string
  issue_date: string
  due_date: string
  total_amount: number
  status: string
  memo: string
}

interface InvoiceDetail {
  id: number
  invoice_number: string
  client_name: string
  client_address: string
  issue_date: string
  due_date: string
  subtotal: number
  total_amount: number
  status: string
  memo: string
  items: { id: number; description: string; quantity: number; unit_price: number; amount: number }[]
}

interface EditItem { description: string; quantity: number; unitPrice: string }

export default function Invoice({ onNew }: { onNew: () => void }): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows]             = useState<InvoiceRow[]>([])
  const [exporting, setExporting]   = useState<number | null>(null)
  const [editData, setEditData]     = useState<InvoiceDetail | null>(null)
  const [editItems, setEditItems]   = useState<EditItem[]>([])
  const [editError, setEditError]   = useState('')
  const [saving, setSaving]         = useState(false)

  const load = () => window.api.invoices.getAll().then(d => setRows(d as InvoiceRow[]))
  useEffect(() => { load() }, [])

  const handleDelete = async (id: number, invoiceNumber: string) => {
    if (!confirm(`請求書「${invoiceNumber}」を削除しますか？\n\n※この操作は取り消せません。\n※PDFが出力済みの場合、ファイル名の先頭に「[削除済み]」が付きます。`)) return
    await window.api.invoices.delete(id)
    load()
  }

  const openEdit = async (id: number) => {
    const detail = await window.api.invoices.getById(id) as InvoiceDetail
    setEditData(detail)
    setEditItems(detail.items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: String(it.unit_price)
    })))
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editData) return
    if (!editData.client_name) { setEditError('クライアント名は必須です'); return }
    if (editItems.some(it => !it.description || !it.unitPrice)) { setEditError('明細の品目と金額を入力してください'); return }
    setSaving(true)
    try {
      const subtotal = editItems.reduce((s, it) => s + it.quantity * Number(it.unitPrice), 0)
      await window.api.invoices.update({
        id: editData.id,
        invoiceNumber: editData.invoice_number,
        clientName: editData.client_name,
        clientAddress: editData.client_address,
        issueDate: editData.issue_date,
        dueDate: editData.due_date,
        subtotal, totalAmount: subtotal,
        memo: editData.memo,
        items: editItems.map(it => ({
          description: it.description, quantity: it.quantity,
          unitPrice: Number(it.unitPrice), amount: it.quantity * Number(it.unitPrice)
        }))
      })
      setEditData(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const addEditItem    = () => setEditItems([...editItems, { description: '', quantity: 1, unitPrice: '' }])
  const removeEditItem = (i: number) => setEditItems(editItems.filter((_, idx) => idx !== i))
  const updateEditItem = (i: number, field: keyof EditItem, value: string | number) =>
    setEditItems(editItems.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  const editSubtotal = editItems.reduce((s, it) => s + it.quantity * (Number(it.unitPrice) || 0), 0)

  // PDFを作成して送付済みにする
  const handlePdfAndSent = async (row: InvoiceRow) => {
    setExporting(row.id)
    try {
      const detail = await window.api.invoices.getById(row.id) as InvoiceDetail
      const fileName = `請求書_${row.invoice_number}_${row.client_name}.pdf`
      await window.api.pdf.export(fileName, year, 'invoice', detail)
      await window.api.invoices.updateStatus(row.id, 'sent')
      load()
    } finally {
      setExporting(null)
    }
  }

  // 入金済みにする
  const handlePaid = async (id: number) => {
    await window.api.invoices.updateStatus(id, 'paid')
    load()
  }

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  const StepButton = ({ step, label, active, done, onClick, loading }: {
    step: number
    label: string
    active: boolean
    done: boolean
    onClick?: () => void
    loading?: boolean
  }) => (
    <button
      onClick={active && onClick ? onClick : undefined}
      disabled={!active || loading}
      style={{
        flex: 1, padding: '10px 8px', border: 'none', cursor: active ? 'pointer' : 'default',
        borderRadius: 0,
        borderLeft: step > 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
        background: active ? 'var(--accent)' : 'var(--bg3)',
        color: done ? 'var(--accent2)' : active ? '#fff' : 'var(--text2)',
        borderTop: done ? '2px solid var(--accent2)' : active ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all .15s',
        opacity: !active && !done ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700 }}>
        {done ? '✅ ' : active ? '▶ ' : ''}{loading ? '処理中...' : label}
      </div>
      {active && !done && !loading && (
        <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>
          クリックして実行
        </div>
      )}
    </button>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">請求書</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={onNew}>＋ 新規作成</button>
          <button className="btn btn-ghost" onClick={() => window.api.invoices.openFolder(year)}>
            📁 フォルダを開く
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
          請求書がありません。「＋ 新規作成」から作成してください。
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>請求書番号</th>
                <th>クライアント</th>
                <th>発行日</th>
                <th>支払期限</th>
                <th style={{ textAlign: 'right' }}>金額</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <>
                  {/* メイン行 */}
                  <tr key={`row-${r.id}`}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.invoice_number}</td>
                    <td style={{ fontWeight: 600 }}>{r.client_name}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.issue_date}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.due_date}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent2)' }}>
                      {fmt(r.total_amount)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => openEdit(r.id)}
                        >
                          編集
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => handleDelete(r.id, r.invoice_number)}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ステータスバー行 */}
                  <tr key={`status-${r.id}`}>
                    <td colSpan={6} style={{ padding: '0 0 8px', borderBottom: '2px solid var(--border)' }}>
                      <div style={{
                        display: 'flex', borderRadius: 6, overflow: 'hidden',
                        border: '1px solid var(--border)', margin: '0 4px'
                      }}>
                        <StepButton
                          step={1}
                          label="① 作成済み"
                          done={true}
                          active={false}
                        />
                        <StepButton
                          step={2}
                          label="② PDFを作成して送付する"
                          done={r.status === 'sent' || r.status === 'paid'}
                          active={r.status === 'draft'}
                          loading={exporting === r.id}
                          onClick={() => handlePdfAndSent(r)}
                        />
                        <StepButton
                          step={3}
                          label="③ 入金済みにする"
                          done={r.status === 'paid'}
                          active={r.status === 'sent'}
                          onClick={() => handlePaid(r.id)}
                        />
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 編集モーダル */}
      {editData && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 700 }}>
            <h2 className="modal-title">請求書を編集</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">請求書番号</label>
                <input className="form-input" value={editData.invoice_number}
                  onChange={e => setEditData(d => d ? { ...d, invoice_number: e.target.value } : d)} />
              </div>
              <div className="form-group">
                <label className="form-label">クライアント名</label>
                <input className="form-input" value={editData.client_name}
                  onChange={e => setEditData(d => d ? { ...d, client_name: e.target.value } : d)} />
              </div>
              <div className="form-group">
                <label className="form-label">発行日</label>
                <input type="date" className="form-input" value={editData.issue_date}
                  onChange={e => setEditData(d => d ? { ...d, issue_date: e.target.value } : d)} />
              </div>
              <div className="form-group">
                <label className="form-label">支払期限</label>
                <input type="date" className="form-input" value={editData.due_date}
                  onChange={e => setEditData(d => d ? { ...d, due_date: e.target.value } : d)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">クライアント住所（任意）</label>
              <input className="form-input" value={editData.client_address ?? ''}
                onChange={e => setEditData(d => d ? { ...d, client_address: e.target.value } : d)} />
            </div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>明細</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 100px 36px', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>品目</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>数量</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>単価</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>小計</span>
              <span></span>
            </div>
            {editItems.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 100px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input className="form-input" value={it.description}
                  onChange={e => updateEditItem(i, 'description', e.target.value)} />
                <input type="number" className="form-input" value={it.quantity}
                  onChange={e => updateEditItem(i, 'quantity', Number(e.target.value))} />
                <input type="number" className="form-input" value={it.unitPrice}
                  onChange={e => updateEditItem(i, 'unitPrice', e.target.value)} />
                <span style={{ textAlign: 'right', fontSize: 13 }}>
                  {(it.quantity * (Number(it.unitPrice) || 0)).toLocaleString()} 円
                </span>
                {editItems.length > 1 && (
                  <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                    onClick={() => removeEditItem(i)}>✕</button>
                )}
              </div>
            ))}
            <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 16 }}
              onClick={addEditItem}>＋ 明細を追加</button>
            <div style={{ textAlign: 'right', padding: '12px 0', borderTop: '1px solid var(--border)', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>合計：{editSubtotal.toLocaleString()} 円</span>
            </div>
            <div className="form-group">
              <label className="form-label">備考（任意）</label>
              <textarea className="form-textarea" value={editData.memo ?? ''}
                onChange={e => setEditData(d => d ? { ...d, memo: e.target.value } : d)} />
            </div>
            {editError && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{editError}</p>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={saving}>
                {saving ? '保存中...' : '保存する'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditData(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}