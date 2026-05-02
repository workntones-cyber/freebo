import { useEffect, useState } from 'react'

interface PLRow { account_name: string; category: string; amount: number }

export default function Dashboard(): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows] = useState<PLRow[]>([])

  useEffect(() => {
    window.api.reports.pl(year).then(data => setRows(data as PLRow[]))
  }, [year])

  const totalRevenue = rows.filter(r => r.category === 'revenue').reduce((s, r) => s + r.amount, 0)
  const totalExpense = rows.filter(r => r.category === 'expense').reduce((s, r) => s + r.amount, 0)
  const netIncome    = totalRevenue - totalExpense

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ダッシュボード</h1>
        <span style={{ color: 'var(--text2)' }}>{year}年</span>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">売上合計</div>
          <div className="value income">{fmt(totalRevenue)}</div>
        </div>
        <div className="summary-card">
          <div className="label">経費合計</div>
          <div className="value expense">{fmt(totalExpense)}</div>
        </div>
        <div className="summary-card">
          <div className="label">利益</div>
          <div className="value profit">{fmt(netIncome)}</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>収支内訳</h2>
        {rows.length === 0
          ? <p style={{ color: 'var(--text2)' }}>仕訳データがありません。仕訳入力から登録してください。</p>
          : (
            <table className="table">
              <thead><tr><th>勘定科目</th><th>種別</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.account_name}</td>
                    <td><span className={`badge badge-${r.category}`}>{r.category === 'revenue' ? '収益' : '費用'}</span></td>
                    <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString('ja-JP')} 円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}