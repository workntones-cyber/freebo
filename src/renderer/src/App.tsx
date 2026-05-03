import { useState, useEffect } from 'react'
import './assets/main.css'
import Sidebar     from './components/Sidebar'
import Dashboard   from './pages/Dashboard'
import Journal     from './pages/Journal'
import JournalForm from './pages/JournalForm'
import Invoice     from './pages/Invoice'
import InvoiceForm from './pages/InvoiceForm'
import Reports     from './pages/Reports'
import Ledger      from './pages/Ledger'
import Settings    from './pages/Settings'
import EtaxGuide   from './pages/EtaxGuide'
import TaxSimulator from './pages/TaxSimulator'
import FixedAssets from './pages/FixedAssets'

type Page = 'dashboard' | 'journal' | 'journal-form' | 'invoice' | 'invoice-form' | 'reports' | 'ledger' | 'etax' | 'tax' | 'fixed-assets' | 'settings'
type Theme = 'dark' | 'light'

export default function App(): JSX.Element {
  const [page,  setPage]  = useState<Page>('dashboard')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('freebo-theme') as Theme) ?? 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('freebo-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard />
      case 'journal':      return <Journal onNew={() => setPage('journal-form')} />
      case 'journal-form': return <JournalForm onSaved={() => setPage('journal')} />
      case 'invoice':      return <Invoice onNew={() => setPage('invoice-form')} />
      case 'invoice-form': return <InvoiceForm onSaved={() => setPage('invoice')} onCancel={() => setPage('invoice')} />
      case 'reports':      return <Reports />
      case 'ledger':       return <Ledger />
      case 'etax':         return <EtaxGuide />
      case 'tax':          return <TaxSimulator />
      case 'fixed-assets': return <FixedAssets />
      case 'settings':     return <Settings />
    }
  }

  return (
    <div className="layout">
      <Sidebar current={page} onChange={p => setPage(p as Page)} theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}