import { useEffect, useState } from 'react'

interface PLRow { account_name: string; category: string; amount: number }

interface Deadline {
  label: string
  date: string
  daysLeft: number
  urgent: boolean
}

function getDeadlines(): Deadline[] {
  const today = new Date()
  const year = today.getFullYear()

  const events = [
    { label: '確定申告・所得税納付', month: 3,  day: 15 },
    { label: '消費税申告・納付',     month: 3,  day: 31 },
    { label: '住民税 第1期',         month: 6,  day: 30 },
    { label: '個人事業税 第1期',     month: 8,  day: 31 },
    { label: '住民税 第2期',         month: 8,  day: 31 },
    { label: '住民税 第3期',         month: 10, day: 31 },
    { label: '個人事業税 第2期',     month: 11, day: 30 },
    { label: '住民税 第4期',         month: 1,  day: 31 },
  ]

  return events
    .map(e => {
      // 翌年1月の場合は来年の日付
      const targetYear = e.month === 1 ? year + 1 : year
      const date = new Date(targetYear, e.month - 1, e.day)
      const daysLeft = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return {
        label: e.label,
        date: `${targetYear}/${String(e.month).padStart(2, '0')}/${String(e.day).padStart(2, '0')}`,
        daysLeft,
        urgent: daysLeft <= 30 && daysLeft >= 0,
      }
    })
    .filter(e => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 4)
}

export default function Dashboard({ year }: { year: number }): JSX.Element {
  const [rows, setRows] = useState<PLRow[]>([])
  const deadlines = getDeadlines()

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
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{year}年</span>
      </div>

      {/* 期限通知 */}
      {deadlines.some(d => d.urgent) && (
        <div style={{ marginBottom: 24 }}>
          {deadlines.filter(d => d.urgent).map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: d.daysLeft <= 7 ? 'rgba(224,92,92,0.15)' : '#2a1f00',
              border: `1px solid ${d.daysLeft <= 7 ? 'var(--danger)' : '#5a4000'}`,
              borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18 }}>{d.daysLeft <= 7 ? '🚨' : '🔔'}</span>
                <div>
                  <span style={{ fontWeight: 600, color: d.daysLeft <= 7 ? 'var(--danger)' : '#f0c040' }}>
                    {d.label}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text2)', marginLeft: 8 }}>
                    {d.date}
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                background: d.daysLeft <= 7 ? 'var(--danger)' : '#5a4000',
                color: '#fff'
              }}>
                あと{d.daysLeft}日
              </span>
            </div>
          ))}
        </div>
      )}

      {/* サマリカード */}
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

      {/* 収支内訳 */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>収支内訳</h2>
        {rows.length === 0
          ? <p style={{ color: 'var(--text2)' }}>仕訳データがありません。仕訳入力から登録してください。</p>
          : (
            <table className="table">
              <thead>
                <tr>
                  <th>勘定科目</th>
                  <th>種別</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.account_name}</td>
                    <td>
                      <span className={`badge badge-${r.category}`}>
                        {r.category === 'revenue' ? '収益' : '費用'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString('ja-JP')} 円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {/* 直近の期限一覧 */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>📅 直近の納税・申告スケジュール</h2>
        <table className="table">
          <thead>
            <tr>
              <th>イベント</th>
              <th>期限</th>
              <th style={{ textAlign: 'right' }}>残り日数</th>
            </tr>
          </thead>
          <tbody>
            {deadlines.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td style={{ color: 'var(--text2)' }}>{d.date}</td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 12, padding: '2px 10px', borderRadius: 99, fontWeight: 600,
                    background: d.daysLeft <= 7 ? 'rgba(224,92,92,0.2)' : d.urgent ? 'rgba(240,192,64,0.2)' : 'var(--bg3)',
                    color: d.daysLeft <= 7 ? 'var(--danger)' : d.urgent ? '#f0c040' : 'var(--text2)',
                  }}>
                    あと{d.daysLeft}日
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}