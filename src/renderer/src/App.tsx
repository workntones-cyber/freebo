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
import Toast, { useToast, ToastMessage } from './components/Toast'
import { createContext, useContext } from 'react'

type Page = 'dashboard' | 'journal' | 'journal-form' | 'invoice' | 'invoice-form' | 'reports' | 'ledger' | 'etax' | 'tax' | 'fixed-assets' | 'receipts' | 'settings' | 'backup'
type Theme = 'dark' | 'light'

export default function App(): JSX.Element {
  const [page,  setPage]  = useState<Page>('dashboard')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('freebo-theme') as Theme) ?? 'dark'
  })
  const [year, setYear]   = useState(new Date().getFullYear())
  const [years, setYears] = useState<number[]>([new Date().getFullYear()])
  const { toasts, show: showToast, remove: removeToast } = useToast()

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
      case 'journal':      return <Journal onNew={() => setPage('journal-form')} year={year} showToast={showToast} />
      case 'journal-form': return <JournalForm onSaved={() => { setPage('journal'); showToast('仕訳を保存しました') }} />
      case 'invoice':      return <Invoice onNew={() => setPage('invoice-form')} showToast={showToast} />
      case 'invoice-form': return <InvoiceForm onSaved={() => { setPage('invoice'); showToast('請求書を保存しました') }} onCancel={() => setPage('invoice')} />
      case 'reports':      return <Reports year={year} showToast={showToast} />
      case 'ledger':       return <Ledger year={year} showToast={showToast} />
      case 'etax':         return <EtaxGuide year={year} />
      case 'tax':          return <TaxSimulator year={year} />
      case 'fixed-assets': return <FixedAssets year={year} showToast={showToast} />
      case 'receipts':     return <Receipts year={year} />
      case 'settings': return <Settings showToast={showToast} onSaved={loadSettings} />
      case 'backup':       return <Backup showToast={showToast} />
    }
  }

  const [appSettings, setAppSettings] = useState<AppSettings>({
    taxMode: 'exempt',
    declarationType: 'blue_65',
    withholding: 'false',
    invoiceRegistrationNumber: '',
    businessName: '',
    ownerName: '',
    postalCode: '',
    address: '',
    phone: '',
    email: '',
    bankName: '',
    bankBranch: '',
    bankType: '普通',
    bankNumber: '',
    bankHolder: '',
    standardTaxRate: '10',
    reducedTaxRate: '8',
  })

  const loadSettings = () => {
    window.api.settings.getAll().then(s => {
      setAppSettings(prev => ({ ...prev, ...s }))
    })
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // navel同期通知
  useEffect(() => {
    window.api.navel.onSynced((count: number) => {
      showToast(`navelから${count}件の請求書を取り込みました`, 'info')
    })
  }, [])

  return (
    <SettingsContext.Provider value={appSettings}>
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
        <Toast toasts={toasts} onRemove={removeToast} />
      </div>
    </SettingsContext.Provider>
  )
}
export interface AppSettings {
  taxMode: string
  declarationType: string
  withholding: string
  invoiceRegistrationNumber: string
  businessName: string
  ownerName: string
  postalCode: string
  address: string
  phone: string
  email: string
  bankName: string
  bankBranch: string
  bankType: string
  bankNumber: string
  bankHolder: string
  standardTaxRate: string
  reducedTaxRate: string
}

export const SettingsContext = createContext<AppSettings>({
  taxMode: 'exempt',
  declarationType: 'blue_65',
  withholding: 'false',
  invoiceRegistrationNumber: '',
  businessName: '',
  ownerName: '',
  postalCode: '',
  address: '',
  phone: '',
  email: '',
  bankName: '',
  bankBranch: '',
  bankType: '普通',
  bankNumber: '',
  bankHolder: '',
  standardTaxRate: '10',
  reducedTaxRate: '8',
})

export const useAppSettings = () => useContext(SettingsContext)