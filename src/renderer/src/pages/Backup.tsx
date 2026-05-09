import { useEffect, useState } from 'react'

interface BackupEntry {
  fileName: string
  path: string
  date: string
  type: 'manual' | 'auto'
  size: number
}

export default function Backup({ showToast }: { showToast: (msg: string, type?: 'success' | 'error' | 'info') => void }): JSX.Element {
  const [history, setHistory]           = useState<BackupEntry[]>([])
  const [autoEnabled, setAutoEnabled]   = useState(false)
  const [autoDay, setAutoDay]           = useState(1)
  const [creating, setCreating]         = useState(false)
  const [locking, setLocking]           = useState(false)

  // 復旧確認ステップ
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [restoreStep, setRestoreStep]     = useState<1 | 2>(1)
  const [restoreWord, setRestoreWord]     = useState('')

  // バックアップ全削除
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [deleteAllWord, setDeleteAllWord]       = useState('')

  const loadHistory = () =>
    window.api.backup.getHistory().then(d => setHistory(d as BackupEntry[]))

  useEffect(() => {
    loadHistory()
    window.api.settings.getAll().then(s => {
      setAutoEnabled(s.backupAutoEnabled === 'true')
      setAutoDay(parseInt(s.backupAutoDay ?? '1'))
    })
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    setLocking(true)
    try {
      await window.api.backup.create(true)
      await loadHistory()
      showToast('バックアップを作成しました')
    } finally {
      setCreating(false)
      setLocking(false)
    }
  }

  const handleAutoSave = async () => {
    await window.api.settings.set('backupAutoEnabled', String(autoEnabled))
    await window.api.settings.set('backupAutoDay', String(autoDay))
    showToast('自動バックアップの設定を保存しました')
  }

  const handleDelete = async (entry: BackupEntry) => {
    if (!confirm(`バックアップ「${entry.fileName}」を削除しますか？`)) return
    await window.api.backup.delete(entry.fileName)
    showToast('バックアップを削除しました', 'info')
    loadHistory()
  }

  const handleRestoreStep1 = (entry: BackupEntry) => {
    setRestoreTarget(entry)
    setRestoreStep(1)
    setRestoreWord('')
  }

  const handleRestoreStep2 = () => {
    setRestoreStep(2)
    setRestoreWord('')
  }

  const handleRestoreExecute = async () => {
    if (!restoreTarget || restoreWord !== '復旧') return
    setLocking(true)
    try {
      await window.api.backup.restore(restoreTarget.path)
      setRestoreTarget(null)
      setRestoreWord('')
      alert('復旧が完了しました。\n\nアプリを再起動してください。')
    } finally {
      setLocking(false)
    }
  }

  const handleDeleteAll = async () => {
    if (deleteAllWord !== 'DELETEBACKUP') return
    await window.api.backup.deleteAll()
    setDeleteAllConfirm(false)
    setDeleteAllWord('')
    loadHistory()
  }

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div>
      {/* 画面ロック */}
      {locking && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>処理中...</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>完了するまでお待ちください</div>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">バックアップ</h1>
        <button className="btn btn-ghost" onClick={() => window.api.backup.openFolder()}>
          📁 フォルダを開く
        </button>
      </div>

      {/* 自動バックアップ設定 */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>自動バックアップ</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
          ⚠️ 自動バックアップはfreeboが起動している時のみ実行されます。設定日にfreeboを起動していない場合は、次回起動時に実行されます。
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={e => setAutoEnabled(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontWeight: 600 }}>自動バックアップを有効にする</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>毎月</span>
            <input
              type="number"
              className="form-input"
              style={{ width: 70 }}
              min={1} max={28}
              value={autoDay}
              onChange={e => setAutoDay(parseInt(e.target.value))}
              disabled={!autoEnabled}
            />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>日に実行</span>
          </div>
          <button className="btn btn-ghost" onClick={handleAutoSave}>設定を保存</button>
        </div>
      </div>

      {/* 手動バックアップ */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>手動バックアップ</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
          今すぐバックアップを作成します。大切なデータを登録した後や、アップデート前に実行することを推奨します。
        </p>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          {creating ? '作成中...' : '📦 今すぐバックアップを作成する'}
        </button>
      </div>

      {/* バックアップ履歴 */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15 }}>バックアップ履歴</h2>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{history.length}件（最大20件）</span>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
            バックアップがありません。「今すぐバックアップを作成する」から作成してください。
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日時</th>
                <th style={{ width: 80, textAlign: 'center' }}>種別</th>
                <th style={{ width: 80, textAlign: 'right' }}>サイズ</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontSize: 13 }}>{fmtDate(entry.date)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{entry.fileName}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: entry.type === 'manual' ? 'rgba(59,111,224,0.15)' : 'rgba(40,168,112,0.15)',
                      color: entry.type === 'manual' ? 'var(--accent)' : 'var(--accent2)',
                    }}>
                      {entry.type === 'manual' ? '手動' : '自動'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)' }}>{fmt(entry.size)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '3px 10px', fontSize: 12 }}
                        onClick={() => handleRestoreStep1(entry)}
                      >
                        復旧
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '3px 10px', fontSize: 12 }}
                        onClick={() => handleDelete(entry)}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* バックアップ全削除（デンジャーゾーン） */}
      <div className="card" style={{ marginTop: 32, border: '1px solid var(--danger)' }}>
        <h2 style={{ fontSize: 15, marginBottom: 8, color: 'var(--danger)' }}>⚠️ バックアップをすべて削除する</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
          すべてのバックアップファイルと履歴を削除します。この操作は元に戻せません。
        </p>
        {!deleteAllConfirm ? (
          <button className="btn btn-danger" onClick={() => setDeleteAllConfirm(true)}>
            バックアップをすべて削除する
          </button>
        ) : (
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16 }}>
            <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>本当に削除しますか？</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              確認のため <strong style={{ color: 'var(--text)' }}>DELETEBACKUP</strong> と入力してください。
            </p>
            <input
              className="form-input"
              placeholder="DELETEBACKUP"
              value={deleteAllWord}
              onChange={e => setDeleteAllWord(e.target.value)}
              style={{ marginBottom: 12, maxWidth: 200 }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-danger"
                onClick={handleDeleteAll}
                disabled={deleteAllWord !== 'DELETEBACKUP'}
              >
                すべて削除する
              </button>
              <button className="btn btn-ghost"
                onClick={() => { setDeleteAllConfirm(false); setDeleteAllWord('') }}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 復旧モーダル */}
      {restoreTarget && (
        <div className="modal-overlay">
          <div className="modal">
            {restoreStep === 1 ? (
              <>
                <h2 className="modal-title">⚠️ バックアップから復旧</h2>
                <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>復旧するバックアップ</div>
                  <div style={{ fontWeight: 700 }}>{fmtDate(restoreTarget.date)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{restoreTarget.fileName}</div>
                </div>
                <p style={{ fontSize: 14, marginBottom: 8 }}>
                  <strong style={{ color: 'var(--danger)' }}>{fmtDate(restoreTarget.date)}</strong> 時点のデータに戻します。
                </p>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                  それ以降に登録したデータはすべて失われます。続けますか？
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-danger" onClick={handleRestoreStep2}>続ける</button>
                  <button className="btn btn-ghost" onClick={() => setRestoreTarget(null)}>キャンセル</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="modal-title">🔥 最終確認</h2>
                <p style={{ fontSize: 14, color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>
                  この操作は元に戻せません。本当によろしいですか？
                </p>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                  確認のため <strong style={{ color: 'var(--text)' }}>復旧</strong> と入力してください。
                </p>
                <input
                  className="form-input"
                  placeholder="復旧"
                  value={restoreWord}
                  onChange={e => setRestoreWord(e.target.value)}
                  style={{ marginBottom: 16, maxWidth: 200 }}
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className="btn btn-danger"
                    onClick={handleRestoreExecute}
                    disabled={restoreWord !== '復旧'}
                  >
                    復旧を実行する
                  </button>
                  <button className="btn btn-ghost" onClick={() => setRestoreTarget(null)}>キャンセル</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}