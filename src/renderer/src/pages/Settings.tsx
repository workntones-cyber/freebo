import { useEffect, useState } from 'react'

export default function Settings({ showToast }: { showToast: (msg: string, type?: 'success' | 'error' | 'info') => void }): JSX.Element {
  const [form, setForm] = useState({
    businessName: '', ownerName: '', openDate: '',
    postalCode: '', address: '', phone: '', email: '',
    declarationType: 'blue_65', taxMode: 'exempt', withholding: 'false',
    bankName: '', bankBranch: '', bankType: '普通', bankNumber: '', bankHolder: '',
    nationalHealthInsurance: '0', nationalPension: '0',
    lifeInsurance: '0', medicalExpense: '0', otherDeduction: '0',
  })
  const [saved, setSaved] = useState(false)
  const [resetConfirm, setResetConfirm] = useState<false | 'data' | 'full'>(false)
  const [resetWord, setResetWord]       = useState('')
  const [resetting, setResetting]       = useState(false)
  const [deleteFiles, setDeleteFiles]   = useState(false)

  useEffect(() => {
    window.api.settings.getAll().then(d => setForm(f => ({ ...f, ...d })))
  }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    for (const [k, v] of Object.entries(form)) await window.api.settings.set(k, v)
    showToast('設定を保存しました')
  }

  const handleReset = async () => {
    if (resetWord !== 'DELETE') return
    setResetting(true)
    try {
      await window.api.data.reset()
      setResetConfirm(false)
      setResetWord('')
      alert('仕訳・請求書データを削除しました。\n\n※領収書ファイル（exports/receipts/）は削除されていません。\n\nアプリを再起動してください。')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">設定</h1></div>

      {/* 事業者情報 */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 16 }}>事業者情報</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">屋号</label>
            <input className="form-input" value={form.businessName} onChange={e => set('businessName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">氏名</label>
            <input className="form-input" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">開業日</label>
            <input type="date" className="form-input" value={form.openDate} onChange={e => set('openDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">郵便番号</label>
            <input className="form-input" placeholder="例：123-4567" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">住所</label>
          <input className="form-input" placeholder="例：東京都渋谷区〇〇1-2-3" value={form.address} onChange={e => set('address', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">電話番号</label>
            <input className="form-input" placeholder="例：090-1234-5678" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">メールアドレス</label>
            <input className="form-input" placeholder="例：example@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
      </div>

      {/* 振込先情報 */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>振込先情報</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>請求書PDFに自動で記載されます。</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">銀行名</label>
            <input className="form-input" placeholder="例：三菱UFJ銀行" value={form.bankName} onChange={e => set('bankName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">支店名</label>
            <input className="form-input" placeholder="例：渋谷支店" value={form.bankBranch} onChange={e => set('bankBranch', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">口座種別</label>
            <select className="form-select" value={form.bankType} onChange={e => set('bankType', e.target.value)}>
              <option value="普通">普通</option>
              <option value="当座">当座</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">口座番号</label>
            <input className="form-input" placeholder="例：1234567" value={form.bankNumber} onChange={e => set('bankNumber', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">口座名義（カタカナ）</label>
            <input className="form-input" placeholder="例：ヤマダ タロウ" value={form.bankHolder} onChange={e => set('bankHolder', e.target.value)} />
          </div>
        </div>
      </div>

      {/* 会計設定 */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 16 }}>会計設定</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">申告種別</label>
            <select className="form-select" value={form.declarationType} onChange={e => set('declarationType', e.target.value)}>
              <option value="blue_65">青色申告（65万円控除）</option>
              <option value="blue_10">青色申告（10万円控除）</option>
              <option value="white">白色申告</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">消費税</label>
            <select className="form-select" value={form.taxMode} onChange={e => set('taxMode', e.target.value)}>
              <option value="exempt">免税事業者</option>
              <option value="taxable_general">課税事業者（一般課税）</option>
              <option value="taxable_simple">課税事業者（簡易課税）</option>
              <option value="taxable_tokuri">課税事業者（2割特例）</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">源泉徴収</label>
            <select className="form-select" value={form.withholding} onChange={e => set('withholding', e.target.value)}>
              <option value="false">なし（全額受取）</option>
              <option value="true">あり（10.21%控除）</option>
            </select>
          </div>
        </div>
      </div>

      {/* 控除額 */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>控除額（税額シミュレーション用）</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          手元の書類を見ながら年間の支払額を入力してください。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">国民健康保険料（年間）</label>
            <input type="number" className="form-input" value={form.nationalHealthInsurance}
              onChange={e => set('nationalHealthInsurance', e.target.value)} placeholder="例：200000" />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>市区町村からの通知書を確認</span>
          </div>
          <div className="form-group">
            <label className="form-label">国民年金保険料（年間）</label>
            <input type="number" className="form-input" value={form.nationalPension}
              onChange={e => set('nationalPension', e.target.value)} placeholder="例：199320" />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>年金機構からの控除証明書を確認</span>
          </div>
          <div className="form-group">
            <label className="form-label">生命保険料控除（年間）</label>
            <input type="number" className="form-input" value={form.lifeInsurance}
              onChange={e => set('lifeInsurance', e.target.value)} placeholder="例：40000" />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>保険会社からの控除証明書を確認（上限12万円）</span>
          </div>
          <div className="form-group">
            <label className="form-label">医療費控除（年間・10万円超の超過分）</label>
            <input type="number" className="form-input" value={form.medicalExpense}
              onChange={e => set('medicalExpense', e.target.value)} placeholder="例：50000" />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>医療費合計 - 10万円</span>
          </div>
          <div className="form-group">
            <label className="form-label">その他控除</label>
            <input type="number" className="form-input" value={form.otherDeduction}
              onChange={e => set('otherDeduction', e.target.value)} placeholder="例：0" />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>ふるさと納税・障害者控除など</span>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave}>保存する</button>

{/* デンジャーゾーン */}
      <div className="card" style={{ marginTop: 32, border: '1px solid var(--danger)' }}>
        <h2 style={{ fontSize: 15, marginBottom: 8, color: 'var(--danger)' }}>⚠️ デンジャーゾーン</h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
          以下の操作は取り消しできません。十分に注意してください。
        </p>

        {/* データのみ削除 */}
        <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>仕訳・請求書データを削除する</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
            仕訳・請求書のデータのみ削除します。設定・勘定科目は残ります。<br />
            ※ 領収書ファイル・PDFは削除されません。
          </p>
          {!resetConfirm ? (
            <button className="btn btn-danger" onClick={() => setResetConfirm('data')}>
              データを削除する
            </button>
          ) : resetConfirm === 'data' ? (
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
              <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>本当に削除しますか？</p>
              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12 }}>
                確認のため <strong style={{ color: 'var(--text)' }}>DELETE</strong> と入力してください。
              </p>
              <input className="form-input" placeholder="DELETE" value={resetWord}
                onChange={e => setResetWord(e.target.value)}
                style={{ marginBottom: 12, maxWidth: 200 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-danger"
                  onClick={async () => {
                    if (resetWord !== 'DELETE') return
                    setResetting(true)
                    try {
                      await window.api.data.reset()
                      setResetConfirm(false)
                      setResetWord('')
                      alert('仕訳・請求書データを削除しました。\n\n※領収書ファイルは削除されていません。\n\nアプリを再起動してください。')
                    } finally {
                      setResetting(false)
                    }
                  }}
                  disabled={resetWord !== 'DELETE' || resetting}>
                  {resetting ? '削除中...' : '削除する'}
                </button>
                <button className="btn btn-ghost"
                  onClick={() => { setResetConfirm(false); setResetWord('') }}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 完全初期化 */}
        <div style={{ padding: 16, border: '1px solid var(--danger)', borderRadius: 'var(--radius)', background: 'rgba(224,92,92,0.05)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 4, color: 'var(--danger)' }}>🔥 完全初期化する</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
            すべてのデータ・設定・勘定科目をリセットし、インストール直後の状態に戻します。<br />
            領収書・PDFファイルの削除は選択できます。
          </p>
          {!resetConfirm ? (
            <button className="btn btn-danger" onClick={() => setResetConfirm('full')}>
              完全初期化する
            </button>
          ) : resetConfirm === 'full' ? (
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
              <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>
                ⚠️ すべてのデータが失われます。本当に実行しますか？
              </p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={deleteFiles}
                    onChange={e => setDeleteFiles(e.target.checked)} />
                  領収書・PDFファイルも削除する
                </label>
                {deleteFiles && (
                  <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, marginLeft: 24 }}>
                    ※ exports/ フォルダ内のすべてのファイルが削除されます
                  </p>
                )}
              </div>

              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12 }}>
                確認のため <strong style={{ color: 'var(--text)' }}>FULLRESET</strong> と入力してください。
              </p>
              <input className="form-input" placeholder="FULLRESET" value={resetWord}
                onChange={e => setResetWord(e.target.value)}
                style={{ marginBottom: 12, maxWidth: 200 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-danger"
                  onClick={async () => {
                    if (resetWord !== 'FULLRESET') return
                    setResetting(true)
                    try {
                      await window.api.data.fullReset(deleteFiles)
                      setResetConfirm(false)
                      setResetWord('')
                      alert('完全初期化が完了しました。\n\nアプリを再起動してください。')
                    } finally {
                      setResetting(false)
                    }
                  }}
                  disabled={resetWord !== 'FULLRESET' || resetting}>
                  {resetting ? '初期化中...' : '完全初期化を実行する'}
                </button>
                <button className="btn btn-ghost"
                  onClick={() => { setResetConfirm(false); setResetWord('') }}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>{}

    </div>
  )
}