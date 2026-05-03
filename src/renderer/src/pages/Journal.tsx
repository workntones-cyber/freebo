import { useEffect, useState } from 'react'

interface JournalRow {
  id: number
  date: string
  description: string
  lines_summary: string
  payment_method: string
  currency: string
  original_amount: number | null
  exchange_rate: number | null
  is_settled: number
  settled_at: string | null
  receipt_path: string | null
}

interface SettleForm {
  journalId: number
  description: string
  originalJPY: number
  settledAt: string
  settledAmount: string
  rate: number | null
  rateLoading: boolean
}

const paymentLabels: Record<string, string> = {
  cash: '現金',
  credit: '💳 クレカ',
  electronic: '📱 電子決済',
  bank: '銀行振込',
}

export default function Journal({ onNew }: { onNew: () => void }): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows] = useState<JournalRow[]>([])
  const [settleForm, setSettleForm] = useState<SettleForm | null>(null)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState('')

  const load = () => window.api.journals.getAll(year).then(d => setRows(d as JournalRow[]))
  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('この仕訳を削除しますか？')) return
    await window.api.journals.delete(id)
    load()
  }

  // 引き落とし処理モーダルを開く
  const openSettle = async (row: JournalRow) => {
    // 元の未払金額を取得
    const detail = await window.api.journals.getById(row.id) as {
      lines: { type: string; amount: number; account_name: string }[]
    }
    const unpaidLine = detail.lines.find(l => l.type === 'credit')
    const originalJPY = unpaidLine?.amount ?? 0

    const today = new Date().toISOString().slice(0, 10)
    setSettleForm({
      journalId: row.id,
      description: row.description,
      originalJPY,
      settledAt: today,
      settledAmount: '',
      rate: null,
      rateLoading: false,
    })
  }

  // 引き落とし日が変わったらレートを取得
  const handleSettleDateChange = async (date: string) => {
    if (!settleForm) return
    setSettleForm(f => f ? { ...f, settledAt: date, rate: null, rateLoading: true } : f)
    const rate = await window.api.exchange.getRate(date)
    setSettleForm(f => f ? { ...f, rate, rateLoading: false } : f)
  }

  const handleSettle = async () => {
    if (!settleForm) return
    if (!settleForm.settledAmount) { setError('引き落とし金額を入力してください'); return }
    setError('')
    setSettling(true)
    try {
      await window.api.journals.settle({
        journalId: settleForm.journalId,
        settledAt: settleForm.settledAt,
        settledAmount: Number(settleForm.settledAmount),
        originalAmount: settleForm.originalJPY,
        exchangeRate: settleForm.rate,
      })
      setSettleForm(null)
      load()
    } finally {
      setSettling(false)
    }
  }

  const diff = settleForm
    ? Number(settleForm.settledAmount || 0) - settleForm.originalJPY
    : 0

  const unsettledCount = rows.filter(r =>
    (r.payment_method === 'credit' || r.payment_method === 'electronic') && !r.is_settled
  ).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">仕訳帳</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {unsettledCount > 0 && (
            <span style={{ background: '#2a1f00', border: '1px solid #5a4000', color: '#f0c040', padding: '4px 12px', borderRadius: 'var(--radius)', fontSize: 13 }}>
              ⚠️ 未決済 {unsettledCount}件
            </span>
          )}
          <span style={{ color: 'var(--text2)' }}>{year}年</span>
          <button className="btn btn-primary" onClick={onNew}>＋ 仕訳入力</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>日付</th>
              <th>摘要</th>
              <th style={{ width: 110 }}>支払方法</th>
              <th>借方 / 貸方</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>仕訳データがありません</td></tr>
              : rows.map(r => {
                const needsSettle = (r.payment_method === 'credit' || r.payment_method === 'electronic') && !r.is_settled
                return (
                  <tr key={r.id} style={{ background: needsSettle ? 'rgba(90,64,0,0.15)' : undefined }}>
                    <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {needsSettle && <span title="引き落とし未処理">⚠️</span>}
                        <span>{r.description}</span>
                        {r.currency === 'USD' && r.original_amount && (
                          <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>
                            ${r.original_amount} @ {r.exchange_rate}
                          </span>
                        )}
                        {r.receipt_path && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '2px 6px', fontSize: 11 }}
                            onClick={() => window.api.receipt.open(r.receipt_path!)}
                            title="領収書を開く"
                          >
                            📎
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {paymentLabels[r.payment_method] ?? r.payment_method}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {r.lines_summary?.split(',').map((l, i) => {
                        const [type, name, amount] = l.split(':')
                        return (
                          <div key={i}>
                            {type === 'debit' ? '借' : '貸'}）{name} {Number(amount).toLocaleString()}円
                          </div>
                        )
                      })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {needsSettle && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => openSettle(r)}
                          >
                            引き落とし処理
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleDelete(r.id)}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>

      {/* 引き落とし処理モーダル */}
      {settleForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">💳 引き落とし処理</h2>

            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 20, fontSize: 13 }}>
              <div style={{ color: 'var(--text2)', marginBottom: 4 }}>対象仕訳</div>
              <div style={{ fontWeight: 600 }}>{settleForm.description}</div>
              <div style={{ color: 'var(--text2)', marginTop: 4 }}>
                計上済み金額：{settleForm.originalJPY.toLocaleString()} 円
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">引き落とし日</label>
                <input
                  type="date"
                  className="form-input"
                  value={settleForm.settledAt}
                  onChange={e => handleSettleDateChange(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">参考レート（{settleForm.settledAt}）</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: settleForm.rate ? 'var(--accent2)' : 'var(--text2)' }}>
                  {settleForm.rateLoading ? '取得中...' : settleForm.rate ? `${settleForm.rate} 円/USD` : '---'}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">実際の引き落とし金額（円）</label>
              <input
                type="number"
                className="form-input"
                placeholder="例：33012"
                value={settleForm.settledAmount}
                onChange={e => setSettleForm(f => f ? { ...f, settledAmount: e.target.value } : f)}
              />
            </div>

            {settleForm.settledAmount && (
              <div style={{
                padding: 12, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13,
                background: diff === 0 ? 'var(--bg3)' : diff > 0 ? 'rgba(90,64,0,0.3)' : 'rgba(26,58,46,0.3)',
                border: `1px solid ${diff === 0 ? 'var(--border)' : diff > 0 ? '#5a4000' : '#1a3a2e'}`
              }}>
                {diff === 0 && <span style={{ color: 'var(--accent2)' }}>✅ 差額なし</span>}
                {diff > 0 && <span style={{ color: '#f0c040' }}>⚠️ 為替差損：{diff.toLocaleString()} 円（追加支払い）</span>}
                {diff < 0 && <span style={{ color: 'var(--accent2)' }}>✅ 為替差益：{Math.abs(diff).toLocaleString()} 円（支払い減少）</span>}
                <div style={{ color: 'var(--text2)', marginTop: 4 }}>
                  差額は自動で為替差損益として仕訳されます
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleSettle} disabled={settling}>
                {settling ? '処理中...' : '引き落とし仕訳を生成'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setSettleForm(null); setError('') }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}