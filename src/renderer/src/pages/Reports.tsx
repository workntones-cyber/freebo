import { useEffect, useRef, useState } from 'react'

interface PLRow { account_name: string; category: string; amount: number }

export default function Reports(): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows] = useState<PLRow[]>([])
  const [exporting, setExporting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { window.api.reports.pl(year).then(d => setRows(d as PLRow[])) }, [])

  const revenues = rows.filter(r => r.category === 'revenue')
  const expenses = rows.filter(r => r.category === 'expense')
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0)
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0)
  const netIncome    = totalRevenue - totalExpense
  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  const handleExport = async () => {
    setExporting(true)
    try {
      await window.api.pdf.export(`損益計算書_${year}.pdf`, year)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">損益計算書（P/L）</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text2)' }}>{year}年 1月〜12月</span>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? '生成中...' : '📄 PDFで保存'}
          </button>
        </div>
      </div>

      <div className="card" ref={printRef}>
        <h2 style={{ fontSize: 15, marginBottom: 12, color: 'var(--accent2)' }}>収益</h2>
        <table className="table" style={{ marginBottom: 24 }}>
          <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
          <tbody>
            {revenues.map((r, i) => (
              <tr key={i}>
                <td>{r.account_name}</td>
                <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>収益合計</td>
              <td style={{ textAlign: 'right', color: 'var(--accent2)' }}>{fmt(totalRevenue)}</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: 15, marginBottom: 12, color: 'var(--danger)' }}>費用</h2>
        <table className="table" style={{ marginBottom: 24 }}>
          <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
          <tbody>
            {expenses.map((r, i) => (
              <tr key={i}>
                <td>{r.account_name}</td>
                <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>費用合計</td>
              <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmt(totalExpense)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '2px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>当期純利益</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: netIncome >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmt(netIncome)}</span>
        </div>
      </div>
    </div>
  )
}