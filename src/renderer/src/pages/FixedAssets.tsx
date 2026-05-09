import { useEffect, useState } from 'react'

interface FixedAsset {
  id: number
  name: string
  category: string
  acquired_date: string
  acquisition_cost: number
  useful_life: number
  depreciation_rate: number
  is_active: number
}

interface DepreciationRecord {
  id: number
  asset_id: number
  year: number
  amount: number
  journal_id: number
}

const ASSET_PRESETS = [
  { category: 'PC（業務用・サーバー以外）', usefulLife: 4, depreciationRate: 0.250 },
  { category: 'PC（サーバー用）',           usefulLife: 5, depreciationRate: 0.200 },
  { category: 'モニター・ディスプレイ',     usefulLife: 5, depreciationRate: 0.200 },
  { category: 'プリンター・スキャナー',     usefulLife: 5, depreciationRate: 0.200 },
  { category: 'デジタルカメラ',             usefulLife: 5, depreciationRate: 0.200 },
  { category: 'スマートフォン',             usefulLife: 10, depreciationRate: 0.100 },
  { category: '机・椅子（木製）',           usefulLife: 8, depreciationRate: 0.125 },
  { category: '机・椅子（金属製）',         usefulLife: 15, depreciationRate: 0.067 },
  { category: '書棚・ラック',               usefulLife: 8, depreciationRate: 0.125 },
  { category: 'カスタム',                   usefulLife: 0, depreciationRate: 0 },
]

export default function FixedAssets({ year }: { year: number }): JSX.Element {
  const currentYear = year
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null)
  const [deprecRecords, setDeprecRecords] = useState<DepreciationRecord[]>([])
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')

  // フォーム
  const [name, setName] = useState('')
  const [category, setCategory] = useState(ASSET_PRESETS[0].category)
  const [acquiredDate, setAcquiredDate] = useState('')
  const [acquisitionCost, setAcquisitionCost] = useState('')
  const [usefulLife, setUsefulLife] = useState(ASSET_PRESETS[0].usefulLife)
  const [depreciationRate, setDepreciationRate] = useState(ASSET_PRESETS[0].depreciationRate)

  const load = () => window.api.assets.getAll().then(d => setAssets(d as FixedAsset[]))
  useEffect(() => { load() }, [])

  const handlePresetChange = (cat: string) => {
    setCategory(cat)
    const preset = ASSET_PRESETS.find(p => p.category === cat)
    if (preset && preset.usefulLife > 0) {
      setUsefulLife(preset.usefulLife)
      setDepreciationRate(preset.depreciationRate)
    }
  }

  const handleCreate = async () => {
    if (!name || !acquiredDate || !acquisitionCost) { setError('名称・取得日・取得価額は必須です'); return }
    if (Number(acquisitionCost) < 100000) { setError('固定資産は10万円以上の資産が対象です'); return }
    if (usefulLife <= 0 || depreciationRate <= 0) { setError('耐用年数と償却率を入力してください'); return }
    setError('')
    await window.api.assets.create({
      name, category, acquiredDate,
      acquisitionCost: Number(acquisitionCost),
      usefulLife, depreciationRate
    })
    setShowForm(false)
    setName(''); setAcquiredDate(''); setAcquisitionCost('')
    setCategory(ASSET_PRESETS[0].category)
    setUsefulLife(ASSET_PRESETS[0].usefulLife)
    setDepreciationRate(ASSET_PRESETS[0].depreciationRate)
    load()
  }

  const handleSelectAsset = async (asset: FixedAsset) => {
    setSelectedAsset(asset)
    const records = await window.api.assets.getDepreciation(asset.id)
    setDeprecRecords(records as DepreciationRecord[])
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この固定資産を削除しますか？\n\n※関連する減価償却仕訳も自動で削除されます。\n※この操作は取り消せません。')) return
    await window.api.assets.delete(id)
    setSelectedAsset(null)
    load()
  }

  const handleRegisterDepreciation = async (year: number) => {
    if (!selectedAsset) return
    setRegistering(true)
    try {
      const amount = calcDepreciation(selectedAsset, year)
      await window.api.assets.registerDepreciation({ assetId: selectedAsset.id, year, amount })
      const records = await window.api.assets.getDepreciation(selectedAsset.id)
      setDeprecRecords(records as DepreciationRecord[])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '登録に失敗しました')
    } finally {
      setRegistering(false)
    }
  }

  // 各年の償却額を計算
  const calcDepreciation = (asset: FixedAsset, year: number): number => {
    const acquiredYear = parseInt(asset.acquired_date.slice(0, 4))
    const elapsed = year - acquiredYear
    if (elapsed < 0 || elapsed >= asset.useful_life) return 0
    // 最終年は残存簿価を全額償却
    if (elapsed === asset.useful_life - 1) {
      const totalDeprec = Math.floor(asset.acquisition_cost * asset.depreciation_rate) * (asset.useful_life - 1)
      return asset.acquisition_cost - totalDeprec - 1 // 備忘価額1円を残す
    }
    return Math.floor(asset.acquisition_cost * asset.depreciation_rate)
  }

  // 償却スケジュールを生成
  const getSchedule = (asset: FixedAsset) => {
    const acquiredYear = parseInt(asset.acquired_date.slice(0, 4))
    return Array.from({ length: asset.useful_life }, (_, i) => {
      const year = acquiredYear + i
      const amount = calcDepreciation(asset, year)
      const record = deprecRecords.find(r => r.year === year)
      return { year, amount, registered: !!record }
    })
  }

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">固定資産・減価償却</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>＋ 資産を登録</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* 左：資産一覧 */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          {assets.length === 0
            ? <p style={{ color: 'var(--text2)', padding: 16, fontSize: 13 }}>登録された固定資産はありません</p>
            : assets.map(a => (
              <button
                key={a.id}
                onClick={() => handleSelectAsset(a)}
                style={{
                  display: 'block', width: '100%', padding: '12px 16px', border: 'none', cursor: 'pointer',
                  borderLeft: selectedAsset?.id === a.id ? '3px solid var(--accent)' : '3px solid transparent',
                  background: selectedAsset?.id === a.id ? 'var(--bg3)' : 'transparent',
                  color: 'var(--text)', textAlign: 'left', borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{a.category}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmt(a.acquisition_cost)} / 耐用{a.useful_life}年</div>
              </button>
            ))
          }
        </div>

        {/* 右：償却スケジュール */}
        <div>
          {selectedAsset ? (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700 }}>{selectedAsset.name}</h2>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                    {selectedAsset.category} ／ 取得日：{selectedAsset.acquired_date} ／ 取得価額：{fmt(selectedAsset.acquisition_cost)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    耐用年数：{selectedAsset.useful_life}年 ／ 償却率：{selectedAsset.depreciation_rate}
                  </div>
                </div>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(selectedAsset.id)}>
                  削除
                </button>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>年度</th>
                    <th style={{ textAlign: 'right' }}>償却額</th>
                    <th style={{ textAlign: 'right' }}>累計償却額</th>
                    <th style={{ textAlign: 'right' }}>帳簿価額</th>
                    <th style={{ width: 140 }}>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {getSchedule(selectedAsset).map((row, i, arr) => {
                    const cumulative = arr.slice(0, i + 1).reduce((s, r) => s + r.amount, 0)
                    const bookValue = selectedAsset.acquisition_cost - cumulative
                    const isCurrentYear = row.year === currentYear
                    return (
                      <tr key={row.year} style={{ background: isCurrentYear ? 'rgba(91,141,238,0.08)' : undefined }}>
                        <td style={{ fontWeight: isCurrentYear ? 700 : 400 }}>
                          {row.year}年
                          {isCurrentYear && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 6 }}>今年</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmt(row.amount)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(cumulative)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(bookValue)}</td>
                        <td>
                          {row.registered
                            ? <span style={{ fontSize: 12, color: 'var(--accent2)' }}>✅ 仕訳登録済み</span>
                            : isCurrentYear
                              ? (
                                <button
                                  className="btn btn-primary"
                                  style={{ fontSize: 12, padding: '4px 10px' }}
                                  onClick={() => handleRegisterDepreciation(row.year)}
                                  disabled={registering}
                                >
                                  {registering ? '登録中...' : '仕訳を登録'}
                                </button>
                              )
                              : row.year < currentYear
                                ? (
                                  <button
                                    className="btn btn-ghost"
                                    style={{ fontSize: 12, padding: '4px 10px' }}
                                    onClick={() => handleRegisterDepreciation(row.year)}
                                    disabled={registering}
                                  >
                                    過去分を登録
                                  </button>
                                )
                                : <span style={{ fontSize: 12, color: 'var(--text2)' }}>未来</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ color: 'var(--text2)', textAlign: 'center', padding: 48 }}>
              左の資産を選択すると償却スケジュールが表示されます
            </div>
          )}
        </div>
      </div>

      {/* 資産登録モーダル */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">固定資産を登録</h2>

            <div className="form-group">
              <label className="form-label">資産名</label>
              <input className="form-input" placeholder="例：MacBook Pro 14インチ" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">種類（耐用年数を自動設定）</label>
              <select className="form-select" value={category} onChange={e => handlePresetChange(e.target.value)}>
                {ASSET_PRESETS.map(p => (
                  <option key={p.category} value={p.category}>
                    {p.category}{p.usefulLife > 0 ? `（耐用${p.usefulLife}年・償却率${p.depreciationRate}）` : ''}
                  </option>
                ))}
              </select>
            </div>

            {category === 'カスタム' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">耐用年数（年）</label>
                  <input type="number" className="form-input" value={usefulLife} onChange={e => setUsefulLife(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">償却率</label>
                  <input type="number" className="form-input" step="0.001" value={depreciationRate} onChange={e => setDepreciationRate(Number(e.target.value))} />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">取得日</label>
                <input type="date" className="form-input" value={acquiredDate} onChange={e => setAcquiredDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">取得価額（円）</label>
                <input type="number" className="form-input" placeholder="例：200000" value={acquisitionCost} onChange={e => setAcquisitionCost(e.target.value)} />
              </div>
            </div>

            {acquisitionCost && Number(acquisitionCost) >= 100000 && usefulLife > 0 && (
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', marginBottom: 4 }}>毎年の償却額（定額法）</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                  {Math.floor(Number(acquisitionCost) * depreciationRate).toLocaleString()} 円 / 年
                </div>
                <div style={{ color: 'var(--text2)', marginTop: 4 }}>
                  {Number(acquisitionCost).toLocaleString()}円 × {depreciationRate} = {Math.floor(Number(acquisitionCost) * depreciationRate).toLocaleString()}円
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleCreate}>登録する</button>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setError('') }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}