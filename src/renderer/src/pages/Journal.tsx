import { useEffect, useState } from 'react'
import HelpPanel from '../components/HelpPanel'

interface JournalRow {
  id: number
  date: string
  description: string
  lines_summary: string
  payment_method: string
  currency: string
  original_amount: number | null
  exchange_rate: number | null
  is_settled: number
  settled_at: string | null
  receipt_path: string | null
}

interface JournalDetail {
  id: number
  date: string
  description: string
  memo: string
  payment_method: string
  currency: string
  original_amount: number | null
  exchange_rate: number | null
  receipt_path: string | null 
  lines: { id: number; type: string; account_id: number; account_name: string; amount: number }[]
}

interface Account { id: number; code: string; name: string; category: string; description: string }

interface SettleForm {
  journalId: number
  description: string
  originalJPY: number
  settledAt: string
  settledAmount: string
  rate: number | null
  rateLoading: boolean
}

interface EditLine { type: 'debit' | 'credit'; accountId: number; amount: string }

const paymentLabels: Record<string, string> = {
  cash: '現金', credit: '💳 クレカ', electronic: '📱 電子決済', bank: '銀行振込',
}

const helpTexts: Record<string, { title: string; description: string; example?: string }> = {
  debit:  { title: '借方（かりかた）', description: 'お金の使い道・資産の増加・負債の減少を記録する左側の欄です。', example: '普通預金が増えた → 借方に「普通預金」' },
  credit: { title: '貸方（かしかた）', description: 'お金の出どころ・収益の発生・負債の増加を記録する右側の欄です。', example: '売上が発生した → 貸方に「売上高」' },
}

export default function Journal({ onNew, year, showToast }: { onNew: () => void; year: number; showToast: (msg: string, type?: 'success' | 'error' | 'info') => void }): JSX.Element {
  const [rows, setRows] = useState<JournalRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [settleForm, setSettleForm] = useState<SettleForm | null>(null)
  const [settling, setSettling] = useState(false)
  const [editData, setEditData] = useState<JournalDetail | null>(null)
  const [editLines, setEditLines] = useState<EditLine[]>([])
  const [editError, setEditError] = useState('')
  const [help, setHelp] = useState<string | null>(null)

  const load = () => window.api.journals.getAll(year).then(d => setRows(d as JournalRow[]))

  useEffect(() => {
    load()
    window.api.accounts.getAll().then(d => setAccounts(d as Account[]))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return
    await window.api.journals.delete(id)
    showToast('仕訳を削除しました', 'info')
    load()
  }

  // 編集モーダルを開く
  const openEdit = async (id: number) => {
    const detail = await window.api.journals.getById(id) as JournalDetail
    setEditData(detail)
    setEditLines(detail.lines.map(l => ({
      type: l.type as 'debit' | 'credit',
      accountId: l.account_id,
      amount: String(l.amount)
    })))
    setEditError('')
  }

  // 編集保存
  const handleEditSave = async () => {
    if (!editData) return
    if (!editData.date || !editData.description) { setEditError('日付と摘要は必須です'); return }

    const debitTotal  = editLines.filter(l => l.type === 'debit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
    const creditTotal = editLines.filter(l => l.type === 'credit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
    if (debitTotal !== creditTotal || debitTotal === 0) { setEditError('借方と貸方の合計が一致していません'); return }
    if (editLines.some(l => !l.accountId)) { setEditError('すべての行の勘定科目を選択してください'); return }

    setEditError('')
    await window.api.journals.update({
      id: editData.id,
      date: editData.date,
      description: editData.description,
      memo: editData.memo,
      paymentMethod: editData.payment_method,
      currency: editData.currency,
      originalAmount: editData.original_amount ?? undefined,
      exchangeRate: editData.exchange_rate ?? undefined,
      lines: editLines.map(l => ({ type: l.type, accountId: Number(l.accountId), amount: Number(l.amount) }))
    })
    setEditData(null)
    showToast('仕訳を更新しました')
    load()
  }

  const addEditLine = (type: 'debit' | 'credit') =>
    setEditLines(prev => [...prev, { type, accountId: 0, amount: '' }])
  const removeEditLine = (i: number) =>
    setEditLines(prev => prev.filter((_, idx) => idx !== i))
  const updateEditLine = (i: number, field: keyof EditLine, value: string | number) =>
    setEditLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))

  const debitTotal  = editLines.filter(l => l.type === 'debit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const creditTotal = editLines.filter(l => l.type === 'credit').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const isBalanced  = debitTotal > 0 && debitTotal === creditTotal

  // 引き落とし処理
  const openSettle = async (row: JournalRow) => {
    const detail = await window.api.journals.getById(row.id) as { lines: { type: string; amount: number }[] }
    const unpaidLine = detail.lines.find(l => l.type === 'credit')
    const originalJPY = unpaidLine?.amount ?? 0
    const today = new Date().toISOString().slice(0, 10)
    setSettleForm({ journalId: row.id, description: row.description, originalJPY, settledAt: today, settledAmount: '', rate: null, rateLoading: false })
  }

  const handleSettleDateChange = async (date: string) => {
    if (!settleForm) return
    setSettleForm(f => f ? { ...f, settledAt: date, rate: null, rateLoading: true } : f)
    const result = await window.api.exchange.getRate(date)
    const rate = result?.rate ?? null
    setSettleForm(f => f ? { ...f, rate, rateLoading: false } : f)
  }

  const handleSettle = async () => {
    if (!settleForm || !settleForm.settledAmount) return
    setSettling(true)
    try {
      await window.api.journals.settle({
        journalId: settleForm.journalId, settledAt: settleForm.settledAt,
        settledAmount: Number(settleForm.settledAmount), originalAmount: settleForm.originalJPY, exchangeRate: settleForm.rate,
      })
      setSettleForm(null)
      showToast('引き落とし仕訳を生成しました')
      load()
    } finally {
      setSettling(false)
    }
  }

  const diff = settleForm ? Number(settleForm.settledAmount || 0) - settleForm.originalJPY : 0
  const unsettledCount = rows.filter(r => (r.payment_method === 'credit' || r.payment_method === 'electronic') && !r.is_settled).length

  const AccountSelect = ({ line, index }: { line: EditLine; index: number }) => (
    <select className="form-select" value={line.accountId} onChange={e => updateEditLine(index, 'accountId', e.target.value)}>
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
        <h1 className="page-title">仕訳帳</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {unsettledCount > 0 && (
            <span style={{ background: '#2a1f00', border: '1px solid #5a4000', color: '#f0c040', padding: '4px 12px', borderRadius: 'var(--radius)', fontSize: 13 }}>
              ⚠️ 未決済 {unsettledCount}件
            </span>
          )}
          <span style={{ color: 'var(--text2)' }}>{year}年</span>
          <button className="btn btn-ghost" onClick={async () => {
            await window.api.csv.export('journals', year, rows)
          }}>📥 CSV出力</button>
          <button className="btn btn-primary" onClick={onNew}>＋ 仕訳入力</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>日付</th>
              <th>摘要</th>
              <th style={{ width: 110 }}>支払方法</th>
              <th>借方 / 貸方</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>仕訳データがありません</td></tr>
              : rows.map(r => {
                const needsSettle = (r.payment_method === 'credit' || r.payment_method === 'electronic') && !r.is_settled
                return (
                  <tr key={r.id} style={{ background: needsSettle ? 'rgba(90,64,0,0.15)' : undefined }}>
                    <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {needsSettle && <span title="引き落とし未処理">⚠️</span>}
                        <span>{r.description}</span>
                        {r.currency === 'USD' && r.original_amount && (
                          <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>
                            ${r.original_amount} @ {r.exchange_rate}
                          </span>
                        )}
                        {r.receipt_path && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '2px 6px', fontSize: 11 }}
                            onClick={() => window.api.receipt.open(r.receipt_path!)}
                            title="領収書を開く"
                          >📎</button>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {paymentLabels[r.payment_method] ?? r.payment_method}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {r.lines_summary?.split(',').map((l, i) => {
                        const [type, name, amount] = l.split(':')
                        return <div key={i}>{type === 'debit' ? '借' : '貸'}）{name} {Number(amount).toLocaleString()}円</div>
                      })}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {needsSettle && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '3px 8px', fontSize: 11, width: '100%', justifyContent: 'center' }}
                            onClick={() => openSettle(r)}
                          >
                            💳 引き落とし
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '3px 8px', fontSize: 11, flex: 1, justifyContent: 'center' }}
                            onClick={() => openEdit(r.id)}
                          >
                            編集
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '3px 8px', fontSize: 11, flex: 1, justifyContent: 'center' }}
                            onClick={() => handleDelete(r.id)}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>

      {/* 編集モーダル */}
      {editData && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 700 }}>
            <h2 className="modal-title">仕訳を編集</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">日付</label>
                <input type="date" className="form-input" value={editData.date}
                  onChange={e => setEditData(d => d ? { ...d, date: e.target.value } : d)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">摘要</label>
                <input className="form-input" value={editData.description}
                  onChange={e => setEditData(d => d ? { ...d, description: e.target.value } : d)} />
              </div>
            </div>

            {/* 借方 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>借方（左）</span>
                <span className="help-icon" onClick={() => setHelp('debit')}>?</span>
              </div>
              {editLines.filter(l => l.type === 'debit').map((line, i) => {
                const realIndex = editLines.indexOf(line)
                return (
                  <div key={realIndex} className="journal-line-row">
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>借方</span>
                    <AccountSelect line={line} index={realIndex} />
                    <input type="number" className="form-input" value={line.amount}
                      onChange={e => updateEditLine(realIndex, 'amount', e.target.value)} />
                    {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeEditLine(realIndex)}>✕</button>}
                  </div>
                )
              })}
              <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addEditLine('debit')}>＋ 借方を追加</button>
            </div>

            {/* 貸方 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--accent2)', fontWeight: 700, fontSize: 13 }}>貸方（右）</span>
                <span className="help-icon" onClick={() => setHelp('credit')}>?</span>
              </div>
              {editLines.filter(l => l.type === 'credit').map((line, i) => {
                const realIndex = editLines.indexOf(line)
                return (
                  <div key={realIndex} className="journal-line-row">
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>貸方</span>
                    <AccountSelect line={line} index={realIndex} />
                    <input type="number" className="form-input" value={line.amount}
                      onChange={e => updateEditLine(realIndex, 'amount', e.target.value)} />
                    {i > 0 && <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeEditLine(realIndex)}>✕</button>}
                  </div>
                )
              })}
              <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => addEditLine('credit')}>＋ 貸方を追加</button>
            </div>

            {/* バランス確認 */}
            <div style={{ display: 'flex', gap: 24, padding: '12px 0', borderTop: '1px solid var(--border)', marginBottom: 16 }}>
              <span>借方合計：<strong style={{ color: 'var(--accent)' }}>{debitTotal.toLocaleString()} 円</strong></span>
              <span>貸方合計：<strong style={{ color: 'var(--accent2)' }}>{creditTotal.toLocaleString()} 円</strong></span>
              {debitTotal > 0 && <span style={{ color: isBalanced ? 'var(--accent2)' : 'var(--danger)' }}>{isBalanced ? '✅ 一致' : '⚠ 不一致'}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">メモ</label>
              <input className="form-input" value={editData.memo ?? ''}
                onChange={e => setEditData(d => d ? { ...d, memo: e.target.value } : d)} />
            </div>

            <div className="form-group">
              <label className="form-label">領収書（任意）</label>
              {editData.receipt_path ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--accent2)' }}>
                    ✅ {editData.receipt_path.split('\\').pop()}
                  </span>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={() => window.api.receipt.open(editData.receipt_path!)}>
                    開く
                  </button>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={() => setEditData(d => d ? { ...d, receipt_path: null } : d)}>
                    削除
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost" onClick={async () => {
                  const result = await window.api.receipt.select({
                    journalDate: editData.date,
                    description: editData.description
                  })
                  if (result) setEditData(d => d ? { ...d, receipt_path: result } : d)
                }}>
                  📎 ファイルを選択
                </button>
              )}
            </div>

            {editError && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{editError}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={!isBalanced}>保存する</button>
              <button className="btn btn-ghost" onClick={() => setEditData(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* 引き落とし処理モーダル */}
      {settleForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">💳 引き落とし処理</h2>
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 20, fontSize: 13 }}>
              <div style={{ color: 'var(--text2)', marginBottom: 4 }}>対象仕訳</div>
              <div style={{ fontWeight: 600 }}>{settleForm.description}</div>
              <div style={{ color: 'var(--text2)', marginTop: 4 }}>計上済み金額：{settleForm.originalJPY.toLocaleString()} 円</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">引き落とし日</label>
                <input type="date" className="form-input" value={settleForm.settledAt}
                  onChange={e => handleSettleDateChange(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">参考レート（{settleForm.settledAt}）</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: settleForm.rate ? 'var(--accent2)' : 'var(--text2)' }}>
                  {settleForm.rateLoading
                    ? '取得中...'
                    : settleForm.rate
                      ? `${settleForm.rate} 円/USD`
                      : '---'
                  }
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">実際の引き落とし金額（円）</label>
              <input type="number" className="form-input" placeholder="例：33012" value={settleForm.settledAmount}
                onChange={e => setSettleForm(f => f ? { ...f, settledAmount: e.target.value } : f)} />
            </div>
            {settleForm.settledAmount && (
              <div style={{
                padding: 12, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13,
                background: diff === 0 ? 'var(--bg3)' : diff > 0 ? 'rgba(90,64,0,0.3)' : 'rgba(26,58,46,0.3)',
                border: `1px solid ${diff === 0 ? 'var(--border)' : diff > 0 ? '#5a4000' : '#1a3a2e'}`
              }}>
                {diff === 0 && <span style={{ color: 'var(--accent2)' }}>✅ 差額なし</span>}
                {diff > 0 && <span style={{ color: '#f0c040' }}>⚠️ 為替差損：{diff.toLocaleString()} 円</span>}
                {diff < 0 && <span style={{ color: 'var(--accent2)' }}>✅ 為替差益：{Math.abs(diff).toLocaleString()} 円</span>}
                <div style={{ color: 'var(--text2)', marginTop: 4 }}>差額は自動で為替差損益として仕訳されます</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleSettle} disabled={settling}>
                {settling ? '処理中...' : '引き落とし仕訳を生成'}
              </button>
              <button className="btn btn-ghost" onClick={() => setSettleForm(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {help && helpTexts[help] && <HelpPanel {...helpTexts[help]} onClose={() => setHelp(null)} />}
    </div>
  )
}