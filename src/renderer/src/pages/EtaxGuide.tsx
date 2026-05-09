import { useEffect, useState } from 'react'

interface EtaxGuide {
  year: number
  totalRevenue: number
  totalExpense: number
  blueDeduction: number
  businessIncome: number
  plRows: { account_name: string; category: string; code: string; amount: number }[]
}

interface CheckItem {
  id: string
  label: string
  done: boolean
}

export default function EtaxGuide({ year }: { year: number }): JSX.Element {
  const [guide, setGuide] = useState<EtaxGuide | null>(null)
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: 'mynumber', label: 'マイナンバーカード or e-Tax ID・パスワードを用意した', done: false },
    { id: 'insurance', label: '国民健康保険料の納付確認書を用意した', done: false },
    { id: 'pension', label: '国民年金の控除証明書を用意した', done: false },
    { id: 'life', label: '生命保険料控除証明書を用意した（ある場合）', done: false },
    { id: 'medical', label: '医療費の領収書を集計した（10万円超の場合）', done: false },
    { id: 'freebo', label: 'freeboの損益計算書・貸借対照表を確認した', done: false },
  ])

  useEffect(() => {
    window.api.reports.etaxGuide(year).then(d => setGuide(d as EtaxGuide))
  }, [year])

  const toggleCheck = (id: string) =>
    setChecks(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c))

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'
  const doneCount = checks.filter(c => c.done).length

  if (!guide) return <div style={{ padding: 32, color: 'var(--text2)' }}>読み込み中...</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">e-Tax ガイド</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{year}年</span>
      </div>

      {/* 準備チェックリスト */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15 }}>📋 申告前チェックリスト</h2>
          <span style={{ fontSize: 13, color: doneCount === checks.length ? 'var(--accent2)' : 'var(--text2)' }}>
            {doneCount} / {checks.length} 完了
          </span>
        </div>
        {checks.map(c => (
          <div
            key={c.id}
            onClick={() => toggleCheck(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: 4,
              background: c.done ? 'rgba(62,207,142,0.08)' : 'var(--bg3)',
              border: `1px solid ${c.done ? 'rgba(62,207,142,0.3)' : 'var(--border)'}`,
            }}
          >
            <span style={{ fontSize: 18 }}>{c.done ? '✅' : '⬜'}</span>
            <span style={{ fontSize: 14, color: c.done ? 'var(--text2)' : 'var(--text)', textDecoration: c.done ? 'line-through' : 'none' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      {/* 転記ガイド */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>📝 e-Taxへの転記内容</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
          以下の数値をe-Taxの「青色申告決算書」に入力してください。
        </p>

        {/* 収入・経費 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            損益計算書（1ページ目）
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>① 売上金額（収入金額）</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent2)' }}>{fmt(guide.totalRevenue)}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>freebo P/L「収益合計」より</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>② 経費合計</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>{fmt(guide.totalExpense)}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>freebo P/L「費用合計」より</div>
            </div>
          </div>

          {/* 経費内訳 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>経費の内訳（勘定科目ごと）</div>
            <table className="table">
              <thead>
                <tr>
                  <th>勘定科目</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th style={{ fontSize: 11 }}>e-Taxの入力欄</th>
                </tr>
              </thead>
              <tbody>
                {guide.plRows.filter(r => r.category === 'expense').map((r, i) => (
                  <tr key={i}>
                    <td>{r.account_name}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.amount)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text2)' }}>{getEtaxField(r.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 所得計算 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            所得金額の計算
          </h3>
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
              <span>売上金額</span>
              <span>{fmt(guide.totalRevenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
              <span>経費合計</span>
              <span>- {fmt(guide.totalExpense)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
              <span>青色申告特別控除</span>
              <span>- {fmt(guide.blueDeduction)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: 16 }}>
              <span>③ 事業所得金額</span>
              <span style={{ color: 'var(--accent)' }}>{fmt(guide.businessIncome)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
              ※ この金額を確定申告書Bの「事業所得」欄に入力してください
            </div>
          </div>
        </div>

        {/* 追加で必要な情報 */}
        <div>
          <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            別途手元の書類から入力が必要な項目
          </h3>
          {[
            { label: '社会保険料控除', desc: '国民健康保険料＋国民年金の合計額', source: '納付確認書・領収書' },
            { label: '生命保険料控除', desc: '生命保険・個人年金保険の保険料', source: '控除証明書（保険会社から郵送）' },
            { label: '医療費控除', desc: '医療費が10万円を超えた場合の超過分', source: '医療費の領収書' },
            { label: '基礎控除', desc: '一律48万円（自動入力）', source: 'e-Taxが自動計算' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{item.desc}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--accent)', alignSelf: 'center', minWidth: 180 }}>
                📄 {item.source}
              </div>
            </div>
          ))}
        </div>

        {/* e-Taxリンク */}
        <div style={{ marginTop: 24, padding: 16, background: 'var(--bg3)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>準備ができたらe-Taxへ</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>国税庁 確定申告書等作成コーナー</div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.open('https://www.keisan.nta.go.jp/', '_blank')}
          >
            e-Taxを開く →
          </button>
        </div>
      </div>
    </div>
  )
}

// 勘定科目コードからe-Taxの入力欄を返す
function getEtaxField(code: string): string {
  const map: Record<string, string> = {
    '5010': '消耗品費',
    '5020': '通信費',
    '5030': '旅費交通費',
    '5040': '新聞図書費',
    '5045': '研修費',
    '5050': '会議費',
    '5060': '接待交際費',
    '5070': '外注工賃',
    '5080': '地代家賃',
    '5090': '水道光熱費',
    '5100': '損害保険料',
    '5110': '租税公課',
    '5190': '雑費',
    '5195': '雑費',
  }
  return map[code] ?? '雑費'
}