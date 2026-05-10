import React, { useEffect, useState } from 'react'
import HelpPanel from '../components/HelpPanel'
import { useAppSettings } from '../App'

interface Account { id: number; code: string; name: string; category: string; description: string }
interface Line { type: 'debit' | 'credit'; accountId: number; amount: string }

type PaymentMethod = 'cash' | 'credit' | 'electronic' | 'bank'
type Currency = 'JPY' | 'USD'
type Mode = 'simple' | 'advanced'
type EntryType = 'expense' | 'income'

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '💴 現金',
  credit: '💳 クレジットカード',
  electronic: '📱 電子決済',
  bank: '🏦 銀行振込',
}

const paymentToCredit: Record<PaymentMethod, string> = {
  cash: '1010',
  credit: '2010',
  electronic: '2010',
  bank: '1020',
}

const incomeToDebit: Record<PaymentMethod, string> = {
  cash: '1010',
  credit: '1030',
  electronic: '1020',
  bank: '1020',
}

const expenseCategories = [
  { label: 'SaaS・ソフトウェア', code: '5010', description: 'サブスク・クラウドサービスなど' },
  { label: '通信費・ドメイン',   code: '5020', description: 'インターネット・サーバー代など' },
  { label: '交通費',             code: '5030', description: '電車・バス・タクシーなど' },
  { label: '書籍・学習',         code: '5040', description: '技術書・Udemyなど' },
  { label: '資格・受験料',       code: '5045', description: '試験受験料・セミナーなど' },
  { label: '会議費',             code: '5050', description: 'カフェでの打ち合わせなど' },
  { label: '接待交際費',         code: '5060', description: 'クライアントとの食事など' },
  { label: '外注費',             code: '5070', description: '他のフリーランスへの発注など' },
  { label: '地代家賃',           code: '5080', description: '家賃の事業按分など' },
  { label: 'その他経費',         code: '5190', description: 'どれにも当てはまらない場合' },
]

const incomeCategories = [
  { label: '開発・制作（請負）',     code: '4010', description: 'サイト制作・システム開発など' },
  { label: '月額稼働・SES',         code: '4010', description: '時間単価・常駐型の契約など' },
  { label: '保守・サポート（月額）', code: '4010', description: '継続的な保守・月額サポートなど' },
  { label: 'コンサル・顧問',         code: '4010', description: 'アドバイザリー・顧問契約など' },
  { label: 'その他の事業収入',       code: '4010', description: '上記以外の事業収入' },
  { label: 'アフィリエイト等',       code: '4090', description: 'ブログ・SNS収益など副次的な収入' },
]

const incomeReceiptLabels: Record<PaymentMethod, string> = {
  cash: '💴 現金で受取',
  credit: '🧾 売掛金（請求書発行済み）',
  electronic: '📱 電子決済で受取',
  bank: '🏦 銀行振込で受取',
}

const helpTexts: Record<string, { title: string; description: string; example?: string }> = {
  debit:       { title: '借方（かりかた）', description: 'お金の使い道・資産の増加・負債の減少を記録する左側の欄です。', example: '普通預金が増えた → 借方に「普通預金」' },
  credit:      { title: '貸方（かしかた）', description: 'お金の出どころ・収益の発生・負債の増加を記録する右側の欄です。', example: '売上が発生した → 貸方に「売上高」' },
  description: { title: '摘要', description: 'この取引が何かを説明するメモです。後から見てわかるように書きましょう。', example: '〇〇株式会社 4月分業務委託料' },
  paymentMethod: { title: '支払方法', description: 'クレジットカード・電子決済の場合、翌月以降に銀行から引き落とされます。', example: 'クレカで買った場合→後日「引き落とし処理」ボタンで決済仕訳を自動生成' },
  currency:    { title: '通貨', description: 'USDを選ぶと支払日のレートを自動取得して円換算します。', example: '200USD × 159.52円 = 31,904円' },
}

export default function JournalForm({ onSaved }: { onSaved: () => void }): JSX.Element {
  const settings = useAppSettings()
  const isTaxable = settings.taxMode !== 'exempt'
  const standardRate = parseInt(settings.standardTaxRate ?? '10')
  const reducedRate  = parseInt(settings.reducedTaxRate ?? '8')
  const [taxRate, setTaxRate] = useState<number | null>(null)
  const effectiveTaxRate = taxRate ?? standardRate

  const [mode, setMode]           = useState<Mode>('simple')
  const [entryType, setEntryType] = useState<EntryType>('expense')
  const [accounts, setAccounts]   = useState<Account[]>([])

  // 簡単入力
  const [simpleDate, setSimpleDate]         = useState(new Date().toISOString().slice(0, 10))
  const [simpleCategory, setSimpleCategory] = useState(expenseCategories[0].code)
  const [simpleIncomeCategoryLabel, setSimpleIncomeCategoryLabel] = useState(incomeCategories[0].label)
  const [simplePayment, setSimplePayment]   = useState<PaymentMethod>('credit')
  const [simpleReceipt, setSimpleReceipt]   = useState<PaymentMethod>('bank')
  const [simpleAmount, setSimpleAmount]     = useState('')
  const [simpleMemo, setSimpleMemo]         = useState('')
  const [simpleCurrency, setSimpleCurrency] = useState<Currency>('JPY')
  const [simpleOriginal, setSimpleOriginal] = useState('')
  const [simpleRate, setSimpleRate] = useState<{ rate: number; source: string; date: string } | null>(null)
  const [simpleRateLoading, setSimpleRateLoading] = useState(false)
  const [simpleError, setSimpleError]       = useState('')

  // 詳細入力
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [memo, setMemo]               = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [currency, setCurrency]       = useState<Currency>('JPY')
  const [originalAmount, setOriginalAmount] = useState('')
  const [exchangeRate, setExchangeRate]     = useState<number | null>(null)
  const [rateLoading, setRateLoading]       = useState(false)
  const [lines, setLines] = useState<Line[]>([
    { type: 'debit',  accountId: 0, amount: '' },
    { type: 'credit', accountId: 0, amount: '' },
  ])
  const [help, setHelp]           = useState<string | null>(null)
  const [error, setError]         = useState('')
  const [receiptPath, setReceiptPath] = useState<string | null>(null)

  useEffect(() => {
    window.api.accounts.getAll().then(d => setAccounts(d as Account[]))
  }, [])

  // 簡単入力レート取得
  useEffect(() => {
    if (simpleCurrency !== 'USD' || !simpleDate) return
    setSimpleRateLoading(true)
    setSimpleRate(null)
    window.api.exchange.getRate(simpleDate).then(result => {
      setSimpleRate(result)
      setSimpleRateLoading(false)
    })
  }, [simpleDate, simpleCurrency])

  // 詳細入力レート取得
  useEffect(() => {
    if (currency !== 'USD' || !date) return
    setRateLoading(true)
    setExchangeRate(null)
    window.api.exchange.getRate(date).then(result => {
      setExchangeRate(result?.rate ?? null)
      setRateLoading(false)
    })
  }, [date, currency])

  useEffect(() => {
    if (currency !== 'USD' || !originalAmount || !exchangeRate) return
    const jpy = Math.floor(parseFloat(originalAmount) * exchangeRate)
    if (!isNaN(jpy)) {
      setLines(prev => prev.map((l, i) => i === 0 ? { ...l, amount: String(jpy) } : l))
    }
  }, [originalAmount, exchangeRate, currency])

  // エントリタイプ切り替え時にカテゴリリセット
  useEffect(() => {
    if (entryType === 'expense') {
      setSimpleCategory(expenseCategories[0].code)
      setSimplePayment('credit')
    } else {
      setSimpleIncomeCategoryLabel(incomeCategories[0].label)
      setSimpleReceipt('bank')
    }
    setSimpleAmount(''); setSimpleOriginal(''); setSimpleMemo('')
    setSimpleCurrency('JPY'); setSimpleRate(null); setSimpleError('')
    setTaxRate(null)
  }, [entryType])

  const simpleJPY = simpleCurrency === 'USD' && simpleOriginal && simpleRate
    ? Math.floor(parseFloat(simpleOriginal) * simpleRate.rate)
    : Number(simpleAmount) || 0

  const taxAmount = isTaxable && taxRate !== null
    ? Math.floor(simpleJPY * effectiveTaxRate / (100 + effectiveTaxRate))
    : 0
  const preTaxAmount = simpleJPY - taxAmount

  // 消費税勘定科目（プレビューでも使用）
  const taxAccountCode = entryType === 'expense' ? '1060' : '2025'
  const taxAccount = isTaxable && taxRate !== null
    ? accounts.find(a => a.code === taxAccountCode)
    : null

  const handleSimpleSave = async () => {
    const amount = simpleJPY
    if (!simpleDate || !amount) { setSimpleError('日付と金額は必須です'); return }

    const debitCode  = entryType === 'expense' ? simpleCategory : incomeToDebit[simpleReceipt]
    const incomeCat  = incomeCategories.find(c => c.label === simpleIncomeCategoryLabel)
    const creditCode = entryType === 'expense' ? paymentToCredit[simplePayment] : (incomeCat?.code ?? '4010')

    const debitAccount  = accounts.find(a => a.code === debitCode)
    const creditAccount = accounts.find(a => a.code === creditCode)

    if (!debitAccount)  { setSimpleError('借方の勘定科目が見つかりません'); return }
    if (!creditAccount) { setSimpleError('貸方の勘定科目が見つかりません'); return }

    const cat = entryType === 'expense'
      ? expenseCategories.find(c => c.code === simpleCategory)
      : incomeCategories.find(c => c.label === simpleIncomeCategoryLabel)

    const rateNote = simpleCurrency === 'USD' && simpleRate
      ? `（レート：${simpleRate.rate}円/USD・出典：${simpleRate.source}・${simpleRate.date}）`
      : ''
    const desc = simpleMemo
      ? `${simpleMemo}${rateNote}`
      : `${cat?.label}${rateNote}`

    setSimpleError('')

    // 消費税の処理
    const taxAcc = isTaxable && taxRate !== null
      ? accounts.find(a => a.code === taxAccountCode)
      : null

    // 仕訳明細を構築
    const journalLines: { type: 'debit' | 'credit'; accountId: number; amount: number }[] = []

    if (entryType === 'expense') {
      journalLines.push({ type: 'debit',  accountId: debitAccount.id,  amount: taxAcc ? preTaxAmount : amount })
      if (taxAcc && taxAmount > 0) {
        journalLines.push({ type: 'debit', accountId: taxAcc.id, amount: taxAmount })
      }
      journalLines.push({ type: 'credit', accountId: creditAccount.id, amount: amount })
    } else {
      journalLines.push({ type: 'debit',  accountId: debitAccount.id,  amount: amount })
      journalLines.push({ type: 'credit', accountId: creditAccount.id, amount: taxAcc ? preTaxAmount : amount })
      if (taxAcc && taxAmount > 0) {
        journalLines.push({ type: 'credit', accountId: taxAcc.id, amount: taxAmount })
      }
    }

    await window.api.journals.create({
      date: simpleDate, description: desc, memo: simpleMemo,
      receiptPath: receiptPath, invoiceId: null,
      paymentMethod: entryType === 'expense' ? simplePayment : simpleReceipt,
      currency: simpleCurrency,
      originalAmount: simpleCurrency === 'USD' ? parseFloat(simpleOriginal) : null,
      exchangeRate: simpleCurrency === 'USD' ? simpleRate?.rate ?? null : null,
      lines: journalLines
    })

    setSimpleAmount(''); setSimpleMemo(''); setSimpleOriginal('')
    setSimpleCurrency('JPY'); setSimpleRate(null); setSimpleError('')
    setReceiptPath(null); setTaxRate(null)
    onSaved()
  }

  // 詳細入力
  const addLine    = (type: 'debit' | 'credit') => setLines([...lines, { type, accountId: 0, amount: '' }])
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
      date, description, memo, receiptPath, invoiceId: null,
      paymentMethod, currency,
      originalAmount: originalAmount ? parseFloat(originalAmount) : null,
      exchangeRate,
      lines: lines.map(l => ({ type: l.type, accountId: Number(l.accountId), amount: Number(l.amount) }))
    })
    setDescription(''); setMemo(''); setOriginalAmount('')
    setCurrency('JPY'); setPaymentMethod('cash'); setExchangeRate(null)
    setReceiptPath(null)
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

  const selectedExpenseCat = expenseCategories.find(c => c.code === simpleCategory)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">仕訳入力</h1>
      </div>

      {/* モード切り替え */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {(['simple', 'advanced'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '8px 24px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: mode === m ? 'var(--text)' : 'var(--text2)', transition: 'all .15s'
          }}>
            {m === 'simple' ? '🟢 簡単入力' : '⚙️ 詳細入力'}
          </button>
        ))}
      </div>

      {/* 簡単入力モード */}
      {mode === 'simple' && (
        <div className="card">
          {/* 支払い or 収入 */}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>何を記録しますか？</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setEntryType('expense')}
                style={{
                  flex: 1, padding: '16px', borderRadius: 'var(--radius)', cursor: 'pointer',
                  border: entryType === 'expense' ? '2px solid var(--danger)' : '1px solid var(--border)',
                  background: entryType === 'expense' ? 'rgba(224,92,92,0.1)' : 'transparent',
                  color: entryType === 'expense' ? 'var(--danger)' : 'var(--text2)',
                  fontSize: 16, fontWeight: 700,
                }}
              >
                💸 支払った（経費）
              </button>
              <button
                onClick={() => setEntryType('income')}
                style={{
                  flex: 1, padding: '16px', borderRadius: 'var(--radius)', cursor: 'pointer',
                  border: entryType === 'income' ? '2px solid var(--accent2)' : '1px solid var(--border)',
                  background: entryType === 'income' ? 'rgba(62,207,142,0.1)' : 'transparent',
                  color: entryType === 'income' ? 'var(--accent2)' : 'var(--text2)',
                  fontSize: 16, fontWeight: 700,
                }}
              >
                💰 受け取った（収入）
              </button>
            </div>
          </div>

          {/* 日付 */}
          <div className="form-group">
            <label className="form-label">📅 いつ</label>
            <input type="date" className="form-input" style={{ maxWidth: 200 }}
              value={simpleDate} onChange={e => setSimpleDate(e.target.value)} />
          </div>

          {/* 経費カテゴリ */}
          {entryType === 'expense' && (
            <div className="form-group">
              <label className="form-label">🛒 何に使った</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {expenseCategories.map(cat => (
                  <button key={cat.code + cat.label} onClick={() => setSimpleCategory(cat.code)} style={{
                    padding: '10px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                    border: simpleCategory === cat.code && selectedExpenseCat?.label === cat.label
                      ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: simpleCategory === cat.code && selectedExpenseCat?.label === cat.label
                      ? 'var(--bg3)' : 'transparent',
                    color: simpleCategory === cat.code && selectedExpenseCat?.label === cat.label
                      ? 'var(--text)' : 'var(--text2)',
                    fontSize: 13, textAlign: 'left'
                  }}>
                    <div style={{ fontWeight: 600 }}>{cat.label}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{cat.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 収入カテゴリ */}
          {entryType === 'income' && (
            <div className="form-group">
              <label className="form-label">📋 何の収入</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {incomeCategories.map(cat => (
                  <button key={cat.label} onClick={() => {
                    setSimpleIncomeCategoryLabel(cat.label)
                  }} style={{
                    padding: '10px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                    border: simpleIncomeCategoryLabel === cat.label
                      ? '2px solid var(--accent2)' : '1px solid var(--border)',
                    background: simpleIncomeCategoryLabel === cat.label
                      ? 'var(--bg3)' : 'transparent',
                    color: simpleIncomeCategoryLabel === cat.label
                      ? 'var(--text)' : 'var(--text2)',
                    fontSize: 13, textAlign: 'left'
                  }}>
                    <div style={{ fontWeight: 600 }}>{cat.label}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{cat.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 支払方法 / 受取方法 */}
          <div className="form-group">
            <label className="form-label">
              {entryType === 'expense' ? '💳 どうやって払った' : '🏦 どうやって受け取った'}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {entryType === 'expense'
                ? (Object.keys(paymentLabels) as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setSimplePayment(m)} style={{
                    padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                    border: simplePayment === m ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: simplePayment === m ? 'var(--bg3)' : 'transparent',
                    color: simplePayment === m ? 'var(--text)' : 'var(--text2)',
                  }}>{paymentLabels[m]}</button>
                ))
                : (Object.keys(incomeReceiptLabels) as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setSimpleReceipt(m)} style={{
                    padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                    border: simpleReceipt === m ? '2px solid var(--accent2)' : '1px solid var(--border)',
                    background: simpleReceipt === m ? 'var(--bg3)' : 'transparent',
                    color: simpleReceipt === m ? 'var(--text)' : 'var(--text2)',
                  }}>{incomeReceiptLabels[m]}</button>
                ))
              }
            </div>
            {entryType === 'expense' && (simplePayment === 'credit' || simplePayment === 'electronic') && (
              <p style={{ fontSize: 12, color: '#f0c040', marginTop: 6 }}>
                ⚠️ 後日、引き落とし処理が必要です。仕訳帳に通知が表示されます。
              </p>
            )}
            {entryType === 'income' && simpleReceipt === 'credit' && (
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                💡 請求書を発行済みで、まだ入金されていない場合に選びます。入金時に別途処理が必要です。
              </p>
            )}
          </div>

          {/* 金額・通貨 */}
          <div className="form-group">
            <label className="form-label">💰 いくら</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => { setSimpleCurrency('JPY'); setSimpleOriginal('') }}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
                  border: simpleCurrency === 'JPY' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: simpleCurrency === 'JPY' ? 'var(--bg3)' : 'transparent',
                  color: simpleCurrency === 'JPY' ? 'var(--text)' : 'var(--text2)',
                }}
              >🇯🇵 円（JPY）</button>
              <button
                onClick={() => { setSimpleCurrency('USD'); setSimpleAmount('') }}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
                  border: simpleCurrency === 'USD' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: simpleCurrency === 'USD' ? 'var(--bg3)' : 'transparent',
                  color: simpleCurrency === 'USD' ? 'var(--text)' : 'var(--text2)',
                }}
              >🇺🇸 ドル（USD）</button>
            </div>

            {simpleCurrency === 'JPY' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" className="form-input" style={{ maxWidth: 200 }}
                  placeholder="例：7830" value={simpleAmount}
                  onChange={e => setSimpleAmount(e.target.value)} />
                <span style={{ color: 'var(--text2)' }}>円</span>
              </div>
            ) : (
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <div>
                    <label className="form-label">ドル金額</label>
                    <input type="number" className="form-input" placeholder="例：200"
                      value={simpleOriginal} onChange={e => setSimpleOriginal(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">レート（{simpleDate}）</label>
                    <div style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: simpleRate ? 'var(--accent2)' : 'var(--text2)' }}>
                      {simpleRateLoading ? '取得中...'
                        : simpleRate
                          ? <span style={{ color: 'var(--accent2)' }}>
                              {simpleRate.rate} 円/USD
                              <span style={{ fontSize: 11, color: 'var(--text2)', display: 'block' }}>
                                {simpleRate.source}（{simpleRate.date}）
                              </span>
                            </span>
                          : '取得できませんでした（手動で入力してください）'
                      }
                    </div>
                  </div>
                  <div>
                    <label className="form-label">円換算額</label>
                    <div style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 700 }}>
                      {simpleOriginal && simpleRate
                        ? `${Math.floor(parseFloat(simpleOriginal) * simpleRate.rate).toLocaleString()} 円`
                        : '---'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 収入時の注意書き */}
          {entryType === 'income' && (
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
              💡 このアプリで請求書を作成した場合は「請求書」画面から管理することを推奨します。<br />
              既存の請求書がある場合はここから添付できます。
            </div>
          )}

          {/* 消費税（課税事業者のみ・金額入力後に表示） */}
          {isTaxable && simpleJPY > 0 && (
            <div className="form-group">
              <label className="form-label">消費税</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={taxRate !== null}
                    onChange={e => setTaxRate(e.target.checked ? standardRate : null)} />
                  <span style={{ fontSize: 13 }}>消費税を計上する</span>
                </label>
                {taxRate !== null && (
                  <select className="form-select" style={{ width: 120 }} value={effectiveTaxRate}
                    onChange={e => setTaxRate(parseInt(e.target.value))}>
                    <option value={standardRate}>{standardRate}%（標準）</option>
                    <option value={reducedRate}>{reducedRate}%（軽減）</option>
                  </select>
                )}
              </div>
              {taxRate !== null && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                  消費税額：{taxAmount.toLocaleString()} 円 / 税抜額：{preTaxAmount.toLocaleString()} 円（税込から逆算）
                </div>
              )}
            </div>
          )}

          {/* メモ */}
          <div className="form-group">
            <label className="form-label">📝 メモ（任意）</label>
            <input className="form-input"
              placeholder={entryType === 'expense'
                ? `例：${selectedExpenseCat?.description}`
                : '例：〇〇株式会社 4月分業務委託料'}
              value={simpleMemo} onChange={e => setSimpleMemo(e.target.value)} />
          </div>

          {/* 領収書・請求書 */}
          <div className="form-group">
            <label className="form-label">
              {entryType === 'expense' ? '📎 領収書（任意）' : '📎 請求書を添付（任意）'}
            </label>
            {receiptPath ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--accent2)' }}>✅ {receiptPath.split('\\').pop()}</span>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => window.api.receipt.open(receiptPath)}>開く</button>
                <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => setReceiptPath(null)}>削除</button>
              </div>
            ) : (
                <button className="btn btn-ghost" onClick={async () => {
                  if (!simpleDate) { setSimpleError('先に日付を入力してください'); return }
                  const catLabel = entryType === 'expense'
                    ? expenseCategories.find(c => c.code === simpleCategory)?.label || '経費'
                    : simpleIncomeCategoryLabel || '収入'
                  const desc = simpleMemo || catLabel
                  const result = await window.api.receipt.select({ journalDate: simpleDate, description: desc })
                  if (result) setReceiptPath(result)
                }}>
                  📎 ファイルを選択
                </button>
            )}
          </div>

          {/* プレビュー */}
          {simpleJPY > 0 && (
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
              <div style={{ color: 'var(--text2)', marginBottom: 8, fontSize: 12 }}>📋 自動生成される仕訳</div>
              {entryType === 'expense' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  <div>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 8 }}>借方</span>
                    {selectedExpenseCat?.label}　{(taxAccount ? preTaxAmount : simpleJPY).toLocaleString()} 円
                  </div>
                  {taxAccount && taxAmount > 0 && (
                    <div>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 8 }}>借方</span>
                      仮払消費税　{taxAmount.toLocaleString()} 円
                    </div>
                  )}
                  <div>
                    <span style={{ color: 'var(--accent2)', fontWeight: 700, marginRight: 8 }}>貸方</span>
                    {simplePayment === 'cash' ? '現金' : simplePayment === 'credit' || simplePayment === 'electronic' ? '未払金' : '普通預金'}　{simpleJPY.toLocaleString()} 円
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  <div>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 8 }}>借方</span>
                    {simpleReceipt === 'cash' ? '現金' : simpleReceipt === 'credit' ? '売掛金' : '普通預金'}　{simpleJPY.toLocaleString()} 円
                  </div>
                  <div>
                    <span style={{ color: 'var(--accent2)', fontWeight: 700, marginRight: 8 }}>貸方</span>
                    {simpleIncomeCategoryLabel}　{(taxAccount ? preTaxAmount : simpleJPY).toLocaleString()} 円
                  </div>
                  {taxAccount && taxAmount > 0 && (
                    <div>
                      <span style={{ color: 'var(--accent2)', fontWeight: 700, marginRight: 8 }}>貸方</span>
                      仮受消費税　{taxAmount.toLocaleString()} 円
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {simpleError && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{simpleError}</p>}
          <button className="btn btn-primary" onClick={handleSimpleSave} disabled={simpleJPY === 0}
            style={{ fontSize: 16, padding: '12px 32px' }}>
            {entryType === 'expense' ? '💸 経費を記録する' : '💰 収入を記録する'}
          </button>
        </div>
      )}

      {/* 詳細入力モード */}
      {mode === 'advanced' && (
        <div className="card">
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
              <input className="form-input" placeholder="例：〇〇株式会社 4月分業務委託料"
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                支払方法
                <span className="help-icon" onClick={() => setHelp('paymentMethod')}>?</span>
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(Object.keys(paymentLabels) as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)} style={{
                    padding: '6px 12px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                    border: paymentMethod === m ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: paymentMethod === m ? 'var(--bg3)' : 'transparent',
                    color: paymentMethod === m ? 'var(--text)' : 'var(--text2)',
                  }}>{paymentLabels[m]}</button>
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

          {currency === 'USD' && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">金額（USD）</label>
                  <input type="number" className="form-input" placeholder="例：11.51"
                    value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} />
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

          {(paymentMethod === 'credit' || paymentMethod === 'electronic') && (
            <div style={{ background: '#2a1f00', border: '1px solid #5a4000', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 13, color: '#f0c040' }}>
              ⚠️ クレカ・電子決済の場合、引き落とし時に別途仕訳が必要です。仕訳帳に未決済マークが表示されます。
            </div>
          )}

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
                  <input type="number" className="form-input" placeholder="金額" value={line.amount}
                    onChange={e => updateLine(realIndex, 'amount', e.target.value)} />
                  {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeLine(realIndex)}>✕</button>}
                </div>
              )
            })}
            <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addLine('debit')}>＋ 借方を追加</button>
          </div>

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
                  <input type="number" className="form-input" placeholder="金額" value={line.amount}
                    onChange={e => updateLine(realIndex, 'amount', e.target.value)} />
                  {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeLine(realIndex)}>✕</button>}
                </div>
              )
            })}
            <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addLine('credit')}>＋ 貸方を追加</button>
          </div>

          <div style={{ display: 'flex', gap: 24, padding: '12px 0', borderTop: '1px solid var(--border)', marginBottom: 16 }}>
            <span>借方合計：<strong style={{ color: 'var(--accent)' }}>{debitTotal.toLocaleString()} 円</strong></span>
            <span>貸方合計：<strong style={{ color: 'var(--accent2)' }}>{creditTotal.toLocaleString()} 円</strong></span>
            {debitTotal > 0 && <span style={{ color: isBalanced ? 'var(--accent2)' : 'var(--danger)' }}>{isBalanced ? '✅ 一致' : '⚠ 不一致'}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">メモ（任意）</label>
            <input className="form-input" placeholder="補足メモ" value={memo} onChange={e => setMemo(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">領収書（任意）</label>
            {receiptPath ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--accent2)' }}>✅ {receiptPath.split('\\').pop()}</span>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => window.api.receipt.open(receiptPath)}>開く</button>
                <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => setReceiptPath(null)}>削除</button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={async () => {
                if (!date || !description) { setError('先に日付と摘要を入力してください'); return }
                const result = await window.api.receipt.select({ journalDate: date, description })
                if (result) setReceiptPath(result)
              }}>
                📎 ファイルを選択
              </button>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
          <button className="btn btn-primary" onClick={handleSave} disabled={!isBalanced}>仕訳を保存</button>
        </div>
      )}

      {help && helpTexts[help] && (
        <HelpPanel {...helpTexts[help]} onClose={() => setHelp(null)} />
      )}
    </div>
  )
}
