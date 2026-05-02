import { useEffect, useState } from 'react'

export default function Settings(): JSX.Element {
  const [form, setForm] = useState({ businessName: '', ownerName: '', openDate: '', declarationType: 'blue_65', taxMode: 'exempt', withholding: 'false' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getAll().then(d => setForm(f => ({ ...f, ...d })))
  }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    for (const [k, v] of Object.entries(form)) await window.api.settings.set(k, v)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">設定</h1></div>

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
        </div>
      </div>

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

      <button className="btn btn-primary" onClick={handleSave}>保存する</button>
      {saved && <span style={{ marginLeft: 12, color: 'var(--accent2)' }}>✅ 保存しました</span>}
    </div>
  )
}