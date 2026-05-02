import { useEffect, useState } from 'react'
import HelpPanel from '../components/HelpPanel'

interface Account { id: number; code: string; name: string; category: string; description: string }
interface Line { type: 'debit' | 'credit'; accountId: number; amount: string }

const helpTexts: Record<string, { title: string; description: string; example?: string }> = {
  debit:  { title: '借方（かりかた）', description: 'お金の使い道・資産の増加・負債の減少を記録する左側の欄です。', example: '普通預金が増えた → 借方に「普通預金」' },
  credit: { title: '貸方（かしかた）', description: 'お金の出どころ・収益の発生・負債の増加を記録する右側の欄です。', example: '売上が発生した → 貸方に「売上高」' },
  description: { title: '摘要', description: 'この取引が何かを説明するメモです。後から見てわかるように書きましょう。', example: '〇〇株式会社 4月分業務委託料' },
}

export default function JournalForm({ onSaved }: { onSaved: () => void }): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>([
    { type: 'debit',  accountId: 0, amount: '' },
    { type: 'credit', accountId: 0, amount: '' },
  ])
  const [help, setHelp] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { window.api.accounts.getAll().then(d => setAccounts(d as Account[])) }, [])

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
      lines: lines.map(l => ({ type: l.type, accountId: Number(l.accountId), amount: Number(l.amount) }))
    })
    setDescription(''); setMemo('')
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">仕訳入力</h1>
      </div>

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
            <input className="form-input" placeholder="例：〇〇株式会社 4月分業務委託料" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

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