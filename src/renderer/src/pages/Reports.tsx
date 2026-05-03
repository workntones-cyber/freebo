import { useEffect, useRef, useState } from 'react'

interface PLRow { account_name: string; category: string; amount: number }
interface BSRow { account_name: string; category: string; code: string; balance: number }

type Tab = 'pl' | 'bs'

const categoryLabel: Record<string, string> = {
  asset: '資産', liability: '負債', equity: '資本'
}

interface OwnerLoanCheck {
  totalPersonal: number
  totalRegistered: number
  shortage: number
  personalPayments: { code: string; name: string; total: number }[]
}

export default function Reports(): JSX.Element {
  const year = new Date().getFullYear()
  const [tab, setTab] = useState<Tab>('pl')
  const [plRows, setPlRows] = useState<PLRow[]>([])
  const [bsRows, setBsRows] = useState<BSRow[]>([])
  const [exporting, setExporting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const [ownerLoan, setOwnerLoan] = useState<OwnerLoanCheck | null>(null)
  const [ownerLoanModal, setOwnerLoanModal] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('2092')
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    window.api.reports.pl(year).then(d => setPlRows(d as PLRow[]))
    window.api.reports.bs(year).then(d => setBsRows(d as BSRow[]))
    window.api.reports.ownerLoanCheck(year).then(d => {
      const result = d as OwnerLoanCheck
      if (result.shortage > 0) setOwnerLoan(result)
    })
  }, [year])

  const revenues = plRows.filter(r => r.category === 'revenue')
  const expenses = plRows.filter(r => r.category === 'expense')
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0)
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0)
  const netIncome    = totalRevenue - totalExpense

  const assets      = bsRows.filter(r => r.category === 'asset')
  const liabilities = bsRows.filter(r => r.category === 'liability')
  const equity      = bsRows.filter(r => r.category === 'equity')
  const totalAssets      = assets.reduce((s, r) => s + r.balance, 0)
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0)
  const totalEquity      = equity.reduce((s, r) => s + r.balance, 0)

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  const handleExport = async () => {
    setExporting(true)
    try {
      const fileName = tab === 'pl' ? `損益計算書_${year}.pdf` : `貸借対照表_${year}.pdf`
      await window.api.pdf.export(fileName, year)
    } finally {
      setExporting(false)
    }
  }

  const handleOwnerLoanRegister = async () => {
    if (!ownerLoan) return
    setRegistering(true)
    try {
      await window.api.reports.ownerLoanAutoRegister({
        year, shortage: ownerLoan.shortage, accountCode: selectedAccount
      })
      setOwnerLoanModal(false)
      setOwnerLoan(null)
      // 仕訳帳を再読み込み
      window.api.reports.pl(year).then(d => setPlRows(d as PLRow[]))
      window.api.reports.bs(year).then(d => setBsRows(d as BSRow[]))
    } finally {
      setRegistering(false)
    }
  }

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 24px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
        borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: tab === id ? 'var(--text)' : 'var(--text2)',
        transition: 'all .15s'
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">帳票</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text2)' }}>{year}年</span>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? '生成中...' : '📄 PDFで保存'}
          </button>
        </div>
      </div>

      {/* 事業主借不足の通知 */}
      {ownerLoan && ownerLoan.shortage > 0 && (
        <div style={{
          background: '#2a1f00', border: '1px solid #5a4000', borderRadius: 'var(--radius)',
          padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <span style={{ color: '#f0c040', fontWeight: 700 }}>⚠️ 事業主借が不足しています</span>
            <span style={{ color: 'var(--text2)', fontSize: 13, marginLeft: 12 }}>
              個人払い：{ownerLoan.totalPersonal.toLocaleString()}円 ／
              登録済み：{ownerLoan.totalRegistered.toLocaleString()}円 ／
              不足：{ownerLoan.shortage.toLocaleString()}円
            </span>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setOwnerLoanModal(true)}>
            自動登録する
          </button>
        </div>
      )}

      {/* タブ */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <TabButton id="pl" label="損益計算書（P/L）" />
        <TabButton id="bs" label="貸借対照表（B/S）" />
      </div>

      <div ref={printRef}>
        {/* P/L */}
        {tab === 'pl' && (
          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 12, color: 'var(--accent2)' }}>収益</h2>
            <table className="table" style={{ marginBottom: 24 }}>
              <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
              <tbody>
                {revenues.length === 0
                  ? <tr><td colSpan={2} style={{ color: 'var(--text2)' }}>データなし</td></tr>
                  : revenues.map((r, i) => (
                    <tr key={i}>
                      <td>{r.account_name}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
                    </tr>
                  ))
                }
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
                {expenses.length === 0
                  ? <tr><td colSpan={2} style={{ color: 'var(--text2)' }}>データなし</td></tr>
                  : expenses.map((r, i) => (
                    <tr key={i}>
                      <td>{r.account_name}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
                    </tr>
                  ))
                }
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
        )}

        {/* B/S */}
        {tab === 'bs' && (
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* 左：資産 */}
              <div>
                <h2 style={{ fontSize: 15, marginBottom: 12, color: 'var(--accent)' }}>資産の部</h2>
                <table className="table" style={{ marginBottom: 16 }}>
                  <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>残高</th></tr></thead>
                  <tbody>
                    {assets.length === 0
                      ? <tr><td colSpan={2} style={{ color: 'var(--text2)' }}>データなし</td></tr>
                      : assets.map((r, i) => (
                        <tr key={i}>
                          <td>{r.account_name}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(r.balance)}</td>
                        </tr>
                      ))
                    }
                    <tr style={{ fontWeight: 700 }}>
                      <td>資産合計</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmt(totalAssets)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 右：負債・資本 */}
              <div>
                <h2 style={{ fontSize: 15, marginBottom: 12, color: 'var(--danger)' }}>負債の部</h2>
                <table className="table" style={{ marginBottom: 16 }}>
                  <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>残高</th></tr></thead>
                  <tbody>
                    {liabilities.length === 0
                      ? <tr><td colSpan={2} style={{ color: 'var(--text2)' }}>データなし</td></tr>
                      : liabilities.map((r, i) => (
                        <tr key={i}>
                          <td>{r.account_name}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(r.balance)}</td>
                        </tr>
                      ))
                    }
                    <tr style={{ fontWeight: 700 }}>
                      <td>負債合計</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmt(totalLiabilities)}</td>
                    </tr>
                  </tbody>
                </table>

                <h2 style={{ fontSize: 15, marginBottom: 12, marginTop: 16, color: 'var(--accent2)' }}>資本の部</h2>
                <table className="table">
                  <thead><tr><th>勘定科目</th><th style={{ textAlign: 'right' }}>残高</th></tr></thead>
                  <tbody>
                    {equity.length === 0
                      ? <tr><td colSpan={2} style={{ color: 'var(--text2)' }}>データなし</td></tr>
                      : equity.map((r, i) => (
                        <tr key={i}>
                          <td>{r.account_name}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(r.balance)}</td>
                        </tr>
                      ))
                    }
                    {/* 当期純利益を資本に加算 */}
                    <tr>
                      <td style={{ color: 'var(--text2)' }}>当期純利益</td>
                      <td style={{ textAlign: 'right', color: netIncome >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>{fmt(netIncome)}</td>
                    </tr>
                    <tr style={{ fontWeight: 700 }}>
                      <td>資本合計</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent2)' }}>{fmt(totalEquity + netIncome)}</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ borderTop: '2px solid var(--border)', paddingTop: 12, marginTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>負債・資本合計</span>
                  <span style={{ color: totalAssets === totalLiabilities + totalEquity + netIncome ? 'var(--accent2)' : 'var(--danger)' }}>
                    {fmt(totalLiabilities + totalEquity + netIncome)}
                  </span>
                </div>
              </div>
            </div>

            {/* バランスチェック */}
            <div style={{ marginTop: 16, padding: 12, borderRadius: 'var(--radius)', background: 'var(--bg3)', fontSize: 13, textAlign: 'center' }}>
              {totalAssets === totalLiabilities + totalEquity + netIncome
                ? <span style={{ color: 'var(--accent2)' }}>✅ 貸借バランス一致</span>
                : <span style={{ color: 'var(--danger)' }}>⚠️ 貸借バランス不一致（資産：{fmt(totalAssets)} / 負債・資本：{fmt(totalLiabilities + totalEquity + netIncome)}）</span>
              }
            </div>
          </div>
        )}
      </div>
      {/* 事業主借自動登録モーダル */}
      {ownerLoanModal && ownerLoan && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">事業主借 自動登録</h2>

            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20, fontSize: 13 }}>
              <div style={{ marginBottom: 8, color: 'var(--text2)' }}>個人払いの内訳</div>
              {ownerLoan.personalPayments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{p.name}</span>
                  <span>{p.total.toLocaleString()} 円</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>不足額</span>
                <span style={{ color: '#f0c040' }}>{ownerLoan.shortage.toLocaleString()} 円</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">事業主借の種別</label>
              <select className="form-select" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
                <option value="2091">2091 事業主借（現金）</option>
                <option value="2092">2092 事業主借（個人口座）</option>
                <option value="2093">2093 事業主借（個人クレカ）</option>
              </select>
            </div>

            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 20, fontSize: 13, color: 'var(--text2)' }}>
              以下の仕訳が {year}/12/31 付けで自動登録されます：
              <div style={{ marginTop: 8, fontFamily: 'monospace' }}>
                借方：現金 {ownerLoan.shortage.toLocaleString()}円<br />
                貸方：{selectedAccount === '2091' ? '事業主借（現金）' : selectedAccount === '2092' ? '事業主借（個人口座）' : '事業主借（個人クレカ）'} {ownerLoan.shortage.toLocaleString()}円
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleOwnerLoanRegister} disabled={registering}>
                {registering ? '登録中...' : `${year}/12/31 に登録する`}
              </button>
              <button className="btn btn-ghost" onClick={() => setOwnerLoanModal(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}