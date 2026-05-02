import { useEffect, useState } from 'react'

interface JournalRow { id: number; date: string; description: string; lines_summary: string }

export default function Journal(): JSX.Element {
  const year = new Date().getFullYear()
  const [rows, setRows] = useState<JournalRow[]>([])

  const load = () => window.api.journals.getAll(year).then(d => setRows(d as JournalRow[]))
  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('この仕訳を削除しますか？')) return
    await window.api.journals.delete(id)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">仕訳帳</h1>
        <span style={{ color: 'var(--text2)' }}>{year}年</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>日付</th>
              <th>摘要</th>
              <th>借方 / 貸方</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={4} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>仕訳データがありません</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                  <td>{r.description}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {r.lines_summary?.split(',').map((l, i) => {
                      const [type, name, amount] = l.split(':')
                      return <div key={i}>{type === 'debit' ? '借' : '貸'}）{name} {Number(amount).toLocaleString()}円</div>
                    })}
                  </td>
                  <td>
                    <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleDelete(r.id)}>削除</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}