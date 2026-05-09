import { useEffect, useState } from 'react'

interface SimData {
  totalRevenue: number
  totalExpense: number
  businessIncome: number
  blueDeduction: number
  nationalHealthInsurance: number
  nationalPension: number
  lifeInsurance: number
  medicalExpense: number
  otherDeduction: number
}

function calcTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  const brackets = [
    { limit: 1950000,  rate: 0.05, deduction: 0 },
    { limit: 3300000,  rate: 0.10, deduction: 97500 },
    { limit: 6950000,  rate: 0.20, deduction: 427500 },
    { limit: 9000000,  rate: 0.23, deduction: 636000 },
    { limit: 18000000, rate: 0.33, deduction: 1536000 },
    { limit: 40000000, rate: 0.40, deduction: 2796000 },
    { limit: Infinity, rate: 0.45, deduction: 4796000 },
  ]
  const bracket = brackets.find(b => taxableIncome <= b.limit)!
  return Math.floor(taxableIncome * bracket.rate - bracket.deduction)
}

export default function TaxSimulator({ year }: { year: number }): JSX.Element {
  const [data, setData] = useState<SimData | null>(null)
  const [customRevenue, setCustomRevenue] = useState<string>('')
  const [useCustom, setUseCustom] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.reports.etaxGuide(year),
      window.api.settings.getAll(),
    ]).then(([guide, settings]) => {
      const g = guide as { totalRevenue: number; totalExpense: number; businessIncome: number; blueDeduction: number }
      const s = settings as Record<string, string>
      setData({
        totalRevenue: g.totalRevenue,
        totalExpense: g.totalExpense,
        businessIncome: g.businessIncome,
        blueDeduction: g.blueDeduction,
        nationalHealthInsurance: Number(s.nationalHealthInsurance ?? 0),
        nationalPension: Number(s.nationalPension ?? 0),
        lifeInsurance: Number(s.lifeInsurance ?? 0),
        medicalExpense: Number(s.medicalExpense ?? 0),
        otherDeduction: Number(s.otherDeduction ?? 0),
      })
    })
  }, [year])

  if (!data) return <div style={{ padding: 32, color: 'var(--text2)' }}>読み込み中...</div>

  const revenue = useCustom && customRevenue ? Number(customRevenue) : data.totalRevenue
  const grossIncome = Math.max(0, revenue - data.totalExpense - data.blueDeduction)

  const socialInsurance = data.nationalHealthInsurance + data.nationalPension
  const totalDeduction = socialInsurance + data.lifeInsurance + data.medicalExpense + data.otherDeduction + 480000 // 基礎控除

  const taxableIncome = Math.max(0, grossIncome - totalDeduction)
  const incomeTax = calcTax(taxableIncome)
  const recoveryTax = Math.floor(incomeTax * 0.021)
  const totalIncomeTax = incomeTax + recoveryTax

  // 住民税（概算）
  const residentTax = taxableIncome > 0
    ? Math.floor(taxableIncome * 0.10) + 5000
    : 5000

  // 個人事業税（概算・290万円控除後）
  const businessTax = Math.max(0, grossIncome - 2900000) * 0.05

  const totalTax = totalIncomeTax + residentTax + businessTax
  const takeHome = revenue - data.totalExpense - totalTax
  const effectiveRate = revenue > 0 ? (totalTax / revenue * 100).toFixed(1) : '0.0'

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  const Row = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <span style={{ fontSize: 14 }}>{label}</span>
        {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 16, fontWeight: 600, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">税額シミュレーション</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{year}年分（概算）</span>
      </div>

      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        ※ あくまで概算です。実際の税額は控除の詳細や自治体によって異なります。
      </p>

      {/* 売上の切り替え */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>売上金額</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${!useCustom ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setUseCustom(false)}
          >
            実績値（{fmt(data.totalRevenue)}）
          </button>
          <button
            className={`btn ${useCustom ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setUseCustom(true)}
          >
            任意の金額で試算
          </button>
          {useCustom && (
            <input
              type="number"
              className="form-input"
              style={{ width: 200 }}
              placeholder="売上金額を入力"
              value={customRevenue}
              onChange={e => setCustomRevenue(e.target.value)}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 左：計算内訳 */}
        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 16 }}>計算内訳</h2>

          <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 700, marginBottom: 8 }}>事業所得の計算</div>
          <Row label="売上金額" value={fmt(revenue)} />
          <Row label="経費合計" value={`- ${fmt(data.totalExpense)}`} color="var(--danger)" />
          <Row label="青色申告特別控除" value={`- ${fmt(data.blueDeduction)}`} color="var(--danger)" />
          <Row label="事業所得" value={fmt(grossIncome)} color="var(--accent)" />

          <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 700, margin: '16px 0 8px' }}>所得控除</div>
          <Row label="社会保険料控除" value={`- ${fmt(socialInsurance)}`}
            sub={`国民健康保険 ${fmt(data.nationalHealthInsurance)} + 国民年金 ${fmt(data.nationalPension)}`}
            color="var(--danger)" />
          <Row label="生命保険料控除" value={`- ${fmt(data.lifeInsurance)}`} color="var(--danger)" />
          {data.medicalExpense > 0 && <Row label="医療費控除" value={`- ${fmt(data.medicalExpense)}`} color="var(--danger)" />}
          {data.otherDeduction > 0 && <Row label="その他控除" value={`- ${fmt(data.otherDeduction)}`} color="var(--danger)" />}
          <Row label="基礎控除" value="- 480,000 円" color="var(--danger)" />
          <Row label="控除合計" value={`- ${fmt(totalDeduction)}`} color="var(--danger)" />

          <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 700, margin: '16px 0 8px' }}>課税所得</div>
          <Row label="課税所得" value={fmt(taxableIncome)} color="var(--accent)" />
        </div>

        {/* 右：税額サマリ */}
        <div>
          {/* 税額内訳 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>税額内訳</h2>
            <Row label="所得税" value={fmt(incomeTax)}
              sub={`課税所得 ${fmt(taxableIncome)} に対して`} />
            <Row label="復興特別所得税" value={fmt(recoveryTax)}
              sub="所得税 × 2.1%" />
            <Row label="住民税（概算）" value={fmt(residentTax)}
              sub="所得割10% + 均等割5,000円" />
            <Row label="個人事業税（概算）" value={fmt(businessTax)}
              sub="290万円控除後 × 5%（事業所得290万円以下は0円）" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 0', fontWeight: 700, fontSize: 18 }}>
              <span>税金合計</span>
              <span style={{ color: 'var(--danger)' }}>{fmt(totalTax)}</span>
            </div>
          </div>

          {/* 手取り */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>手取り試算</h2>
            <Row label="売上" value={fmt(revenue)} color="var(--accent2)" />
            <Row label="経費" value={`- ${fmt(data.totalExpense)}`} color="var(--danger)" />
            <Row label="税金合計" value={`- ${fmt(totalTax)}`} color="var(--danger)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 0', fontWeight: 700, fontSize: 18 }}>
              <span>手取り（概算）</span>
              <span style={{ color: 'var(--accent2)' }}>{fmt(takeHome)}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
              実効税率（税金 ÷ 売上）：<strong style={{ color: 'var(--text)' }}>{effectiveRate}%</strong>
            </div>
          </div>

          {/* アドバイス */}
          <div className="card" style={{ background: 'var(--bg3)' }}>
            <h2 style={{ fontSize: 14, marginBottom: 12 }}>💡 節税のポイント</h2>
            {grossIncome > 0 && grossIncome < 1000000 && (
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                ✅ 事業所得が100万円以下のため、控除を活用すれば所得税はほぼゼロになる可能性があります。
              </p>
            )}
            {data.nationalHealthInsurance === 0 && (
              <p style={{ fontSize: 13, color: '#f0c040', marginBottom: 8 }}>
                ⚠️ 国民健康保険料が未入力です。設定画面から入力すると税額が下がります。
              </p>
            )}
            {data.nationalPension === 0 && (
              <p style={{ fontSize: 13, color: '#f0c040', marginBottom: 8 }}>
                ⚠️ 国民年金保険料が未入力です。2026年は月額16,980円（年間約203,760円）が目安です。
              </p>
            )}
            {grossIncome > 2000000 && (
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                💼 事業所得が200万円を超えています。小規模企業共済（iDeCo）への加入で所得控除を増やせます。
              </p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
              ※ 正確な税額は税理士または国税庁のe-Taxで確認してください。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}