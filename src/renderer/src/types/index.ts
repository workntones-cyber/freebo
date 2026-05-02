// ==============================
// 勘定科目
// ==============================
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface Account {
  id: number
  code: string        // 勘定科目コード例：1010
  name: string        // 例：普通預金
  category: AccountCategory
  description: string // ヘルプパネル用の説明文
  isSystem: boolean   // システム標準科目は削除不可
  isActive: boolean
}

// ==============================
// 仕訳
// ==============================
export interface JournalLine {
  id?: number
  journalId?: number
  type: 'debit' | 'credit'   // 借方 or 貸方
  accountId: number
  accountName?: string        // 表示用
  amount: number
}

export interface Journal {
  id?: number
  date: string                // YYYY-MM-DD
  description: string         // 摘要
  memo?: string
  lines: JournalLine[]        // 複合仕訳対応：複数行
  receiptPath?: string        // 領収書ファイルパス
  invoiceId?: number          // 請求書から生成した場合
  createdAt?: string
}

// ==============================
// 請求書
// ==============================
export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export interface InvoiceItem {
  id?: number
  invoiceId?: number
  description: string   // 項目名
  quantity: number
  unitPrice: number
  amount: number        // quantity × unitPrice
}

export interface Invoice {
  id?: number
  invoiceNumber: string       // 請求書番号 例：INV-2024-001
  clientName: string          // クライアント名
  clientAddress?: string
  issueDate: string           // 発行日
  dueDate: string             // 支払期限
  items: InvoiceItem[]
  subtotal: number
  totalAmount: number
  status: InvoiceStatus       // draft/sent/paid
  memo?: string
  createdAt?: string
}

// ==============================
// 設定
// ==============================
export type TaxMode = 'exempt' | 'taxable_general' | 'taxable_simple' | 'taxable_tokuri'
export type DeclarationType = 'blue_65' | 'blue_10' | 'white'

export interface Settings {
  businessName: string          // 屋号
  ownerName: string             // 氏名
  openDate: string              // 開業日
  invoiceRegistrationNumber?: string  // インボイス登録番号
  taxMode: TaxMode              // 消費税モード
  declarationType: DeclarationType   // 申告種別
  withholding: boolean          // 源泉徴収あり/なし
}

// ==============================
// 帳票集計用
// ==============================
export interface PLReport {
  revenues: { accountName: string; amount: number }[]
  expenses: { accountName: string; amount: number }[]
  totalRevenue: number
  totalExpense: number
  netIncome: number
}

export interface BSReport {
  assets: { accountName: string; amount: number }[]
  liabilities: { accountName: string; amount: number }[]
  equity: { accountName: string; amount: number }[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
}