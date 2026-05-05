import { useEffect, useState } from 'react'

interface ReceiptRow {
  id: number
  date: string
  description: string
  receipt_path: string
  payment_method: string
  expense_name: string
  amount: number
}

const paymentLabels: Record<string, string> = {
  cash: '💴 現金',
  credit: '💳 クレカ',
  electronic: '📱 電子決済',
  bank: '🏦 銀行振込',
}

export default function Receipts(): JSX.Element {
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    window.api.receipt.getAll().then(d => setRows(d as ReceiptRow[]))
  }, [])

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.description.includes(search) ||
      r.expense_name?.includes(search)
    const matchFilter = filter === 'all' || r.payment_method === filter
    return matchSearch && matchFilter
  })

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0)
  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  const getFileName = (filePath: string) => filePath.split('\\').pop() ?? filePath

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">領収書管理</h1>
        <button className="btn btn-ghost" onClick={() => window.api.receipt.openFolder()}>
          📁 フォルダを開く
        </button>
      </div>

      {/* サマリ */}
      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="summary-card">
          <div className="label">領収書件数</div>
          <div className="value" style={{ fontSize: 28, color: 'var(--accent)' }}>{filtered.length} 件</div>
        </div>
        <div className="summary-card">
          <div className="label">合計金額</div>
          <div className="value expense" style={{ fontSize: 20 }}>{fmt(totalAmount)}</div>
        </div>
        <div className="summary-card">
          <div className="label">全領収書</div>
          <div className="value" style={{ fontSize: 28, color: 'var(--text2)' }}>{rows.length} 件</div>
        </div>
      </div>

      {/* 検索・フィルター */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: 280 }}
            placeholder="🔍 摘要・勘定科目で検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'all', label: 'すべて' },
              { value: 'cash', label: '💴 現金' },
              { value: 'credit', label: '💳 クレカ' },
              { value: 'electronic', label: '📱 電子決済' },
              { value: 'bank', label: '🏦 銀行振込' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12,
                  border: filter === f.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: filter === f.value ? 'var(--bg3)' : 'transparent',
                  color: filter === f.value ? 'var(--text)' : 'var(--text2)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 一覧 */}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>日付</th>
              <th>摘要</th>
              <th style={{ width: 110 }}>支払方法</th>
              <th style={{ width: 120, textAlign: 'right' }}>金額</th>
              <th>ファイル名</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr>
                  <td colSpan={6} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>
                    {rows.length === 0 ? '領収書が添付された仕訳がありません' : '検索条件に一致する領収書がありません'}
                  </td>
                </tr>
              : filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                  <td>
                    <div>{r.description}</div>
                    {r.expense_name && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {r.expense_name}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {paymentLabels[r.payment_method] ?? r.payment_method}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
                  <td>
                    <div style={{ fontSize: 11, color: 'var(--text2)', wordBreak: 'break-all' }}>
                      📎 {getFileName(r.receipt_path)}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => window.api.receipt.open(r.receipt_path)}
                    >
                      開く
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '10px 12px', borderTop: '2px solid var(--border)' }}>
                  合計 {filtered.length}件
                </td>
                <td style={{ textAlign: 'right', padding: '10px 12px', borderTop: '2px solid var(--border)', color: 'var(--danger)' }}>
                  {fmt(totalAmount)}
                </td>
                <td colSpan={2} style={{ borderTop: '2px solid var(--border)' }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}