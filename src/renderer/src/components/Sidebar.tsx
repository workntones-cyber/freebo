interface NavItem { label: string; icon: string; page: string }

const navItems: NavItem[] = [
  { label: 'ダッシュボード', icon: '📊', page: 'dashboard' },
  { label: '仕訳入力',       icon: '✏️',  page: 'journal-form' },
  { label: '仕訳帳',         icon: '📒', page: 'journal' },
  { label: '請求書',         icon: '🧾', page: 'invoice' },
  { label: '帳票',           icon: '📈', page: 'reports' },
  { label: '設定',           icon: '⚙️',  page: 'settings' },
]

interface Props { current: string; onChange: (page: string) => void }

export default function Sidebar({ current, onChange }: Props): JSX.Element {
  return (
    <nav style={{
      width: 'var(--sidebar-w)', background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0
    }}>
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>freebo</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>フリーランス会計</div>
      </div>

      {navItems.map(item => (
        <button
          key={item.page}
          onClick={() => onChange(item.page)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px', background: current === item.page ? 'var(--bg3)' : 'transparent',
            border: 'none', borderLeft: current === item.page ? '3px solid var(--accent)' : '3px solid transparent',
            color: current === item.page ? 'var(--text)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 14, textAlign: 'left', width: '100%', transition: 'all .15s'
          }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}