import { useState } from 'react'
import './assets/main.css'
import Sidebar     from './components/Sidebar'
import Dashboard   from './pages/Dashboard'
import Journal     from './pages/Journal'
import JournalForm from './pages/JournalForm'
import Invoice     from './pages/Invoice'
import InvoiceForm from './pages/InvoiceForm'
import Reports     from './pages/Reports'
import Settings    from './pages/Settings'

type Page = 'dashboard' | 'journal' | 'journal-form' | 'invoice' | 'invoice-form' | 'reports' | 'settings'

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard />
      case 'journal':      return <Journal />
      case 'journal-form': return <JournalForm onSaved={() => setPage('journal')} />
      case 'invoice':      return <Invoice onNew={() => setPage('invoice-form')} />
      case 'invoice-form': return <InvoiceForm onSaved={() => setPage('invoice')} onCancel={() => setPage('invoice')} />
      case 'reports':      return <Reports />
      case 'settings':     return <Settings />
    }
  }

  return (
    <div className="layout">
      <Sidebar current={page} onChange={p => setPage(p as Page)} />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}