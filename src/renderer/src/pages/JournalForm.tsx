import { useEffect, useState } from 'react'
import HelpPanel from '../components/HelpPanel'

interface Account { id: number; code: string; name: string; category: string; description: string }
interface Line { type: 'debit' | 'credit'; accountId: number; amount: string }

type PaymentMethod = 'cash' | 'credit' | 'electronic' | 'bank'
type Currency = 'JPY' | 'USD'

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '💴 現金',
  credit: '💳 クレジットカード',
  electronic: '📱 電子決済',
  bank: '🏦 銀行振込',
}

const helpTexts: Record<string, { title: string; description: string; example?: string }> = {
  debit:  { title: '借方（かりかた）', description: 'お金の使い道・資産の増加・負債の減少を記録する左側の欄です。', example: '普通預金が増えた → 借方に「普通預金」' },
  credit: { title: '貸方（かしかた）', description: 'お金の出どころ・収益の発生・負債の増加を記録する右側の欄です。', example: '売上が発生した → 貸方に「売上高」' },
  description: { title: '摘要', description: 'この取引が何かを説明するメモです。後から見てわかるように書きましょう。', example: '〇〇株式会社 4月分業務委託料' },
  paymentMethod: { title: '支払方法', description: 'クレジットカード・電子決済の場合、翌月以降に銀行から引き落とされます。仕訳帳に⚠️マークが付き、引き落とし処理のリマインドが表示されます。', example: 'クレカで買った場合→後日「引き落とし処理」ボタンで決済仕訳を自動生成' },
  currency: { title: '通貨', description: 'USDを選ぶと支払日のレートを自動取得して円換算します。', example: '200USD × 159.52円 = 31,904円' },
}

export default function JournalForm({ onSaved }: { onSaved: () => void }): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [currency, setCurrency] = useState<Currency>('JPY')
  const [originalAmount, setOriginalAmount] = useState('')
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [lines, setLines] = useState<Line[]>([
    { type: 'debit',  accountId: 0, amount: '' },
    { type: 'credit', accountId: 0, amount: '' },
  ])
  const [help, setHelp] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { window.api.accounts.getAll().then(d => setAccounts(d as Account[])) }, [])

  // 日付・通貨が変わったらレートを自動取得
  useEffect(() => {
    if (currency !== 'USD' || !date) return
    setRateLoading(true)
    setExchangeRate(null)
    window.api.exchange.getRate(date).then(rate => {
      setExchangeRate(rate)
      setRateLoading(false)
    })
  }, [date, currency])

  // USD金額が変わったら円換算を自動計算
  useEffect(() => {
    if (currency !== 'USD' || !originalAmount || !exchangeRate) return
    const jpy = Math.floor(parseFloat(originalAmount) * exchangeRate)
    if (!isNaN(jpy)) {
      setLines(prev => prev.map((l, i) => i === 0 ? { ...l, amount: String(jpy) } : l))
    }
  }, [originalAmount, exchangeRate, currency])

  const addLine = (type: 'debit' | 'credit') => setLines([...lines, { type, accountId: 0, amount: '' }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof Line, value: string | number) =>
    setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l))

  const debitTotal  = lines.filter(l => l.type === 'debit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const creditTotal = lines.filter(l => l.type === 'credit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const isBalanced  = debitTotal > 0 && debitTotal === creditTotal

  const handleSave = async () => {
    if (!date || !description) { setError('日付と摘要は必須です'); return }
    if (!isBalanced) { setError('借方と貸方の合計が一致していません'); return }
    if (lines.some(l => !l.accountId)) { setError('すべての行の勘定科目を選択してください'); return }
    setError('')
    await window.api.journals.create({
      date, description, memo, receiptPath: null, invoiceId: null,
      paymentMethod, currency,
      originalAmount: originalAmount ? parseFloat(originalAmount) : null,
      exchangeRate,
      lines: lines.map(l => ({ type: l.type, accountId: Number(l.accountId), amount: Number(l.amount) }))
    })
    setDescription(''); setMemo(''); setOriginalAmount('')
    setCurrency('JPY'); setPaymentMethod('cash'); setExchangeRate(null)
    setLines([{ type: 'debit', accountId: 0, amount: '' }, { type: 'credit', accountId: 0, amount: '' }])
    onSaved()
  }

  const AccountSelect = ({ line, index }: { line: Line; index: number }) => (
    <select className="form-select" value={line.accountId} onChange={e => updateLine(index, 'accountId', e.target.value)}>
      <option value={0}>勘定科目を選択</option>
      {['asset','liability','equity','revenue','expense'].map(cat => {
        const group = accounts.filter(a => a.category === cat)
        if (!group.length) return null
        const labels: Record<string, string> = { asset: '資産', liability: '負債', equity: '資本', revenue: '収益', expense: '費用' }
        return (
          <optgroup key={cat} label={labels[cat]}>
            {group.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </optgroup>
        )
      })}
    </select>
  )

  const needsSettlement = paymentMethod === 'credit' || paymentMethod === 'electronic'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">仕訳入力</h1>
      </div>

      <div className="card">
        {/* 基本情報 */}
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">日付</label>
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              摘要
              <span className="help-icon" onClick={() => setHelp('description')}>?</span>
            </label>
            <input className="form-input" placeholder="例：〇〇株式会社 4月分業務委託料" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        {/* 支払方法・通貨 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              支払方法
              <span className="help-icon" onClick={() => setHelp('paymentMethod')}>?</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(paymentLabels) as PaymentMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  style={{
                    padding: '6px 12px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                    border: paymentMethod === m ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: paymentMethod === m ? 'var(--bg3)' : 'transparent',
                    color: paymentMethod === m ? 'var(--text)' : 'var(--text2)',
                  }}
                >
                  {paymentLabels[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              通貨
              <span className="help-icon" onClick={() => setHelp('currency')}>?</span>
            </label>
            <select className="form-select" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
              <option value="JPY">🇯🇵 JPY（円）</option>
              <option value="USD">🇺🇸 USD（ドル）</option>
            </select>
          </div>
        </div>

        {/* USD入力時のレート表示 */}
        {currency === 'USD' && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">金額（USD）</label>
                <input type="number" className="form-input" placeholder="例：11.51" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">適用レート（{date}）</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: exchangeRate ? 'var(--accent2)' : 'var(--text2)' }}>
                  {rateLoading ? '取得中...' : exchangeRate ? `${exchangeRate} 円/USD` : '取得できませんでした'}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">円換算額</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 700 }}>
                  {originalAmount && exchangeRate
                    ? `${Math.floor(parseFloat(originalAmount) * exchangeRate).toLocaleString()} 円`
                    : '---'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* クレカ・電子決済の注意書き */}
        {needsSettlement && (
          <div style={{ background: '#2a1f00', border: '1px solid #5a4000', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 13, color: '#f0c040' }}>
            ⚠️ クレカ・電子決済の場合、引き落とし時に別途仕訳が必要です。仕訳帳に未決済マークが表示されます。
          </div>
        )}

        {/* 借方 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>借方（左）</span>
            <span className="help-icon" onClick={() => setHelp('debit')}>?</span>
          </div>
          {lines.filter(l => l.type === 'debit').map((line, i) => {
            const realIndex = lines.indexOf(line)
            return (
              <div key={realIndex} className="journal-line-row">
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>借方</span>
                <AccountSelect line={line} index={realIndex} />
                <input type="number" className="form-input" placeholder="金額" value={line.amount} onChange={e => updateLine(realIndex, 'amount', e.target.value)} />
                {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeLine(realIndex)}>✕</button>}
              </div>
            )
          })}
          <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addLine('debit')}>＋ 借方を追加</button>
        </div>

        {/* 貸方 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--accent2)', fontWeight: 700, fontSize: 13 }}>貸方（右）</span>
            <span className="help-icon" onClick={() => setHelp('credit')}>?</span>
          </div>
          {lines.filter(l => l.type === 'credit').map((line, i) => {
            const realIndex = lines.indexOf(line)
            return (
              <div key={realIndex} className="journal-line-row">
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>貸方</span>
                <AccountSelect line={line} index={realIndex} />
                <input type="number" className="form-input" placeholder="金額" value={line.amount} onChange={e => updateLine(realIndex, 'amount', e.target.value)} />
                {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeLine(realIndex)}>✕</button>}
              </div>
            )
          })}
          <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addLine('credit')}>＋ 貸方を追加</button>
        </div>

        {/* バランス確認 */}
        <div style={{ display: 'flex', gap: 24, padding: '12px 0', borderTop: '1px solid var(--border)', marginBottom: 16 }}>
          <span>借方合計：<strong style={{ color: 'var(--accent)' }}>{debitTotal.toLocaleString()} 円</strong></span>
          <span>貸方合計：<strong style={{ color: 'var(--accent2)' }}>{creditTotal.toLocaleString()} 円</strong></span>
          {debitTotal > 0 && <span style={{ color: isBalanced ? 'var(--accent2)' : 'var(--danger)' }}>{isBalanced ? '✅ 一致' : '⚠ 不一致'}</span>}
        </div>

        <div className="form-group">
          <label className="form-label">メモ（任意）</label>
          <input className="form-input" placeholder="補足メモ" value={memo} onChange={e => setMemo(e.target.value)} />
        </div>

        {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" onClick={handleSave} disabled={!isBalanced}>仕訳を保存</button>
      </div>

      {help && helpTexts[help] && (
        <HelpPanel {...helpTexts[help]} onClose={() => setHelp(null)} />
      )}
    </div>
  )
}