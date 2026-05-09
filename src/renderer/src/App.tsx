import { useState, useEffect } from 'react'
import './assets/main.css'
import Sidebar      from './components/Sidebar'
import Dashboard    from './pages/Dashboard'
import Journal      from './pages/Journal'
import JournalForm  from './pages/JournalForm'
import Invoice      from './pages/Invoice'
import InvoiceForm  from './pages/InvoiceForm'
import Reports      from './pages/Reports'
import Ledger       from './pages/Ledger'
import Settings     from './pages/Settings'
import EtaxGuide    from './pages/EtaxGuide'
import TaxSimulator from './pages/TaxSimulator'
import FixedAssets  from './pages/FixedAssets'
import Receipts     from './pages/Receipts'
import Backup       from './pages/Backup'

type Page = 'dashboard' | 'journal' | 'journal-form' | 'invoice' | 'invoice-form' | 'reports' | 'ledger' | 'etax' | 'tax' | 'fixed-assets' | 'receipts' | 'settings' | 'backup'
type Theme = 'dark' | 'light'

export default function App(): JSX.Element {
  const [page,  setPage]  = useState<Page>('dashboard')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('freebo-theme') as Theme) ?? 'dark'
  })
  const [year, setYear]   = useState(new Date().getFullYear())
  const [years, setYears] = useState<number[]>([new Date().getFullYear()])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('freebo-theme', theme)
  }, [theme])

  useEffect(() => {
    window.api.journals.getYears().then(d => setYears(d as number[]))
  }, [])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard year={year} />
      case 'journal':      return <Journal onNew={() => setPage('journal-form')} year={year} />
      case 'journal-form': return <JournalForm onSaved={() => setPage('journal')} />
      case 'invoice':      return <Invoice onNew={() => setPage('invoice-form')} />
      case 'invoice-form': return <InvoiceForm onSaved={() => setPage('invoice')} onCancel={() => setPage('invoice')} />
      case 'reports':      return <Reports year={year} />
      case 'ledger':       return <Ledger year={year} />
      case 'etax':         return <EtaxGuide year={year} />
      case 'tax':          return <TaxSimulator year={year} />
      case 'fixed-assets': return <FixedAssets year={year} />
      case 'receipts':     return <Receipts year={year} />
      case 'settings':     return <Settings />
      case 'backup':       return <Backup />
    }
  }

  return (
    <div className="layout">
      <Sidebar
        current={page}
        onChange={p => setPage(p as Page)}
        theme={theme}
        onToggleTheme={toggleTheme}
        year={year}
        years={years}
        onYearChange={setYear}
      />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}