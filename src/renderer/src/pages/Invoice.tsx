import { useEffect, useState } from 'react'

interface InvoiceRow {
  id: number
  invoice_number: string
  client_name: string
  issue_date: string
  total_amount: number
  status: string
}

const statusLabel: Record<string, string> = { draft: '下書き', sent: '送付済み', paid: '入金済み' }

export default function Invoice({ onNew }: { onNew: () => void }): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows]         = useState<InvoiceRow[]>([])
  const [exporting, setExporting] = useState<number | null>(null)

  const load = () => window.api.invoices.getAll().then(d => setRows(d as InvoiceRow[]))
  useEffect(() => { load() }, [])

  const handlePaid = async (id: number) => {
    await window.api.invoices.updateStatus(id, 'paid')
    load()
  }

  const handleExport = async (row: InvoiceRow) => {
    setExporting(row.id)
    try {
      await window.api.pdf.export(`請求書_${row.invoice_number}.pdf`, year)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">請求書</h1>
        <button className="btn btn-primary" onClick={onNew}>＋ 新規作成</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>請求書番号</th>
              <th>クライアント</th>
              <th>発行日</th>
              <th style={{ textAlign: 'right' }}>金額</th>
              <th>ステータス</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>請求書がありません</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace' }}>{r.invoice_number}</td>
                  <td>{r.client_name}</td>
                  <td style={{ color: 'var(--text2)' }}>{r.issue_date}</td>
                  <td style={{ textAlign: 'right' }}>{r.total_amount.toLocaleString()} 円</td>
                  <td><span className={`badge badge-${r.status}`}>{statusLabel[r.status]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleExport(r)}
                        disabled={exporting === r.id}
                      >
                        {exporting === r.id ? '生成中...' : '📄 PDF'}
                      </button>
                      {r.status !== 'paid' && (
                        <button
                          className="btn btn-success"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => handlePaid(r.id)}
                        >
                          入金済みにする
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}