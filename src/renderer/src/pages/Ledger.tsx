import { useEffect, useState } from 'react'

interface LedgerLine {
  date: string
  description: string
  type: string
  amount: number
  running_balance: number
}

interface LedgerAccount {
  id: number
  code: string
  name: string
  category: string
  lines: LedgerLine[]
}

const categoryLabel: Record<string, string> = {
  asset: '資産', liability: '負債', equity: '資本', revenue: '収益', expense: '費用'
}

export default function Ledger(): JSX.Element {
  const year = new Date().getFullYear()
  const [accounts, setAccounts] = useState<LedgerAccount[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api.reports.ledger(year).then(d => {
      const data = d as LedgerAccount[]
      setAccounts(data)
      if (data.length > 0) setSelected(data[0].id)
    })
  }, [year])

  const handleExport = async () => {
    setExporting(true)
    try {
      await window.api.pdf.export(`総勘定元帳_${year}.pdf`, year, 'ledger', accounts)
    } finally {
      setExporting(false)
    }
  }

  const current = accounts.find(a => a.id === selected)

  const fmt = (n: number) => n.toLocaleString('ja-JP')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">総勘定元帳</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text2)' }}>{year}年</span>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? '生成中...' : '📄 PDFで保存'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        {/* 左：勘定科目一覧 */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          {accounts.length === 0
            ? <p style={{ color: 'var(--text2)', padding: 16, fontSize: 13 }}>データがありません</p>
            : ['asset', 'liability', 'equity', 'revenue', 'expense'].map(cat => {
              const group = accounts.filter(a => a.category === cat)
              if (!group.length) return null
              return (
                <div key={cat}>
                  <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                    {categoryLabel[cat]}
                  </div>
                  {group.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '10px 16px', border: 'none', cursor: 'pointer',
                        borderLeft: selected === a.id ? '3px solid var(--accent)' : '3px solid transparent',
                        background: selected === a.id ? 'var(--bg3)' : 'transparent',
                        color: selected === a.id ? 'var(--text)' : 'var(--text2)',
                        fontSize: 13, textAlign: 'left', borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span>{a.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.lines.length}件</span>
                    </button>
                  ))}
                </div>
              )
            })
          }
        </div>

        {/* 右：取引明細 */}
        <div>
          {current ? (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{current.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>{current.code}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>（{categoryLabel[current.category]}）</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{current.lines.length}件</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>日付</th>
                    <th>摘要</th>
                    <th style={{ width: 80, textAlign: 'center' }}>区分</th>
                    <th style={{ width: 120, textAlign: 'right' }}>金額</th>
                    <th style={{ width: 130, textAlign: 'right' }}>残高</th>
                  </tr>
                </thead>
                <tbody>
                  {current.lines.length === 0
                    ? <tr><td colSpan={5} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>取引がありません</td></tr>
                    : current.lines.map((line, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text2)' }}>{line.date}</td>
                        <td>{line.description}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 99,
                            background: line.type === 'debit' ? 'rgba(91,141,238,0.15)' : 'rgba(62,207,142,0.15)',
                            color: line.type === 'debit' ? 'var(--accent)' : 'var(--accent2)'
                          }}>
                            {line.type === 'debit' ? '借方' : '貸方'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmt(line.amount)} 円</td>
                        <td style={{ textAlign: 'right', color: line.running_balance >= 0 ? 'var(--text)' : 'var(--danger)' }}>
                          {fmt(line.running_balance)} 円
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
                {current.lines.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 700 }}>
                      <td colSpan={3} style={{ padding: '10px 12px', borderTop: '2px solid var(--border)' }}>合計</td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', borderTop: '2px solid var(--border)' }}>
                        {fmt(current.lines.reduce((s, l) => s + l.amount, 0))} 円
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', borderTop: '2px solid var(--border)', color: current.lines[current.lines.length - 1]?.running_balance >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {fmt(current.lines[current.lines.length - 1]?.running_balance ?? 0)} 円
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="card" style={{ color: 'var(--text2)', textAlign: 'center', padding: 48 }}>
              左の勘定科目を選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  )
}