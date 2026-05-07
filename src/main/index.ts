import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, getDb, seedIfEmpty } from './db'
import fs from 'fs'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../resources/icon.jpeg'),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.setTitle('freebo')
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ==============================
// IPC handlers
// ==============================

// 設定
ipcMain.handle('settings:getAll', () => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
})

ipcMain.handle('settings:set', (_, key: string, value: string) => {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
})

// 勘定科目
ipcMain.handle('accounts:getAll', () => {
  return getDb().prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY code').all()
})

ipcMain.handle('accounts:create', (_, data) => {
  const stmt = getDb().prepare(`
    INSERT INTO accounts (code, name, category, description, is_system, is_active)
    VALUES (@code, @name, @category, @description, @isSystem, 1)
  `)
  const result = stmt.run(data)
  return result.lastInsertRowid
})

ipcMain.handle('accounts:update', (_, data) => {
  getDb().prepare(`
    UPDATE accounts SET name=@name, category=@category, description=@description
    WHERE id=@id AND is_system=0
  `).run(data)
})

ipcMain.handle('accounts:delete', (_, id: number) => {
  getDb().prepare('UPDATE accounts SET is_active=0 WHERE id=? AND is_system=0').run(id)
})

// 仕訳
ipcMain.handle('journals:getAll', (_, year: number) => {
  return getDb().prepare(`
    SELECT j.*, GROUP_CONCAT(
      jl.type || ':' || a.name || ':' || jl.amount
    ) as lines_summary
    FROM journals j
    LEFT JOIN journal_lines jl ON jl.journal_id = j.id
    LEFT JOIN accounts a ON a.id = jl.account_id
    WHERE strftime('%Y', j.date) = ?
    GROUP BY j.id
    ORDER BY j.date DESC, j.id DESC
  `).all(String(year))
})

ipcMain.handle('journals:getById', (_, id: number) => {
  const journal = getDb().prepare('SELECT * FROM journals WHERE id = ?').get(id)
  const lines = getDb().prepare(`
    SELECT jl.*, a.name as account_name, a.code as account_code
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.journal_id = ?
  `).all(id)
  return { ...(journal as object), lines }
})

ipcMain.handle('journals:create', (_, data) => {
  const db = getDb()
  const insert = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO journals (date, description, memo, receipt_path, invoice_id, payment_method, currency, original_amount, exchange_rate)
      VALUES (@date, @description, @memo, @receiptPath, @invoiceId, @paymentMethod, @currency, @originalAmount, @exchangeRate)
    `).run(data)

    const journalId = result.lastInsertRowid
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (journal_id, type, account_id, amount)
      VALUES (?, ?, ?, ?)
    `)

    for (const line of data.lines) {
      insertLine.run(journalId, line.type, line.accountId, line.amount)
    }

    return journalId
  })
  return insert()
})

ipcMain.handle('journals:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM journals WHERE id = ?').run(id)
})

ipcMain.handle('journals:settle', async (_, {
  journalId, settledAt, settledAmount
}: {
  journalId: number
  settledAt: string
  settledAmount: number
  originalAmount: number
  exchangeRate: number
}) => {
  const db = getDb()

  const journal = db.prepare('SELECT * FROM journals WHERE id = ?').get(journalId) as {
    description: string
    invoice_id: number | null
  }
  const lines = db.prepare(`
    SELECT jl.*, a.category
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.journal_id = ?
  `).all(journalId) as { type: string; account_id: number; amount: number; category: string }[]

  const unpaidLine = lines.find(l => l.type === 'credit' && l.category === 'liability')
  if (!unpaidLine) throw new Error('未払金が見つかりません')

  const originalJPY = unpaidLine.amount
  const diff = settledAmount - originalJPY

  const settle = db.transaction(() => {
    db.prepare(`UPDATE journals SET is_settled=1, settled_at=? WHERE id=?`).run(settledAt, journalId)

    const newLines: { type: string; accountId: number; amount: number }[] = []
    const unpaidAccountId = unpaidLine.account_id
    newLines.push({ type: 'debit', accountId: unpaidAccountId, amount: originalJPY })

    if (diff !== 0) {
      const diffAccount = db.prepare(`SELECT id FROM accounts WHERE code='5195'`).get() as { id: number } | undefined
      const diffAccountId = diffAccount?.id ?? (db.prepare(`SELECT id FROM accounts WHERE code='5190'`).get() as { id: number }).id

      if (diff > 0) {
        newLines.push({ type: 'debit', accountId: diffAccountId, amount: diff })
      } else {
        newLines.push({ type: 'credit', accountId: diffAccountId, amount: Math.abs(diff) })
      }
    }

    const bankAccount = db.prepare(`SELECT id FROM accounts WHERE code='1020'`).get() as { id: number }
    newLines.push({ type: 'credit', accountId: bankAccount.id, amount: settledAmount })

    const result = db.prepare(`
      INSERT INTO journals (date, description, memo, payment_method, currency, is_settled, settled_at)
      VALUES (?, ?, ?, 'bank', 'JPY', 1, ?)
    `).run(
      settledAt,
      `${journal.description}（引き落とし）`,
      diff !== 0 ? `為替差${diff > 0 ? '損' : '益'} ${Math.abs(diff)}円含む` : null,
      settledAt
    )

    const newJournalId = result.lastInsertRowid
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (journal_id, type, account_id, amount) VALUES (?, ?, ?, ?)
    `)
    for (const line of newLines) {
      insertLine.run(newJournalId, line.type, line.accountId, line.amount)
    }

    return newJournalId
  })

  return settle()
})

ipcMain.handle('journals:update', (_, data: {
  id: number
  date: string
  description: string
  memo?: string
  paymentMethod: string
  currency: string
  originalAmount?: number
  exchangeRate?: number
  lines: { type: string; accountId: number; amount: number }[]
}) => {
  const db = getDb()
  const update = db.transaction(() => {
    db.prepare(`
      UPDATE journals SET
        date=@date, description=@description, memo=@memo,
        payment_method=@paymentMethod, currency=@currency,
        original_amount=@originalAmount, exchange_rate=@exchangeRate
      WHERE id=@id
    `).run(data)

    db.prepare('DELETE FROM journal_lines WHERE journal_id=?').run(data.id)
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (journal_id, type, account_id, amount) VALUES (?, ?, ?, ?)
    `)
    for (const line of data.lines) {
      insertLine.run(data.id, line.type, line.accountId, line.amount)
    }
  })
  update()
})

// 請求書
ipcMain.handle('invoices:getAll', () => {
  return getDb().prepare('SELECT * FROM invoices ORDER BY issue_date DESC').all()
})

ipcMain.handle('invoices:getById', (_, id: number) => {
  const invoice = getDb().prepare('SELECT * FROM invoices WHERE id = ?').get(id)
  const items = getDb().prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id)
  return { ...(invoice as object), items }
})

ipcMain.handle('invoices:create', (_, data) => {
  const db = getDb()
  const insert = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, client_name, client_address, issue_date, due_date, subtotal, total_amount, status, memo)
      VALUES (@invoiceNumber, @clientName, @clientAddress, @issueDate, @dueDate, @subtotal, @totalAmount, @status, @memo)
    `).run(data)

    const invoiceId = result.lastInsertRowid
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const item of data.items) {
      insertItem.run(invoiceId, item.description, item.quantity, item.unitPrice, item.amount)
    }

    return invoiceId
  })
  return insert()
})

ipcMain.handle('invoices:updateStatus', (_, id: number, status: string) => {
  getDb().prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id)
})

ipcMain.handle('invoices:delete', (_, id: number) => {
  const db = getDb()

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as {
    invoice_number: string
    client_name: string
  } | undefined

  if (invoice) {
    const invoiceData = db.prepare('SELECT issue_date FROM invoices WHERE id = ?').get(id) as { issue_date: string } | undefined
    const year = invoiceData ? parseInt(invoiceData.issue_date.slice(0, 4)) : new Date().getFullYear()
    // 請求書専用フォルダを参照
    const invoicesDir = path.join(app.getPath('userData'), 'exports', String(year), 'invoices')
    const oldName = `請求書_${invoice.invoice_number}_${invoice.client_name}.pdf`
    const newName = `[削除済み]請求書_${invoice.invoice_number}_${invoice.client_name}.pdf`
    const oldPath = path.join(invoicesDir, oldName)
    const newPath = path.join(invoicesDir, newName)

    try {
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath)
        console.log(`Renamed: ${oldName} → ${newName}`)
      } else {
        console.log(`PDF not found: ${oldPath}`)
      }
    } catch (e) {
      console.error('PDF rename failed:', e)
    }
  }

  db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
  db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
})

ipcMain.handle('invoices:update', (_, data: {
  id: number
  invoiceNumber: string
  clientName: string
  clientAddress?: string
  issueDate: string
  dueDate: string
  subtotal: number
  totalAmount: number
  memo?: string
  items: { description: string; quantity: number; unitPrice: number; amount: number }[]
}) => {
  const db = getDb()
  const update = db.transaction(() => {
    db.prepare(`
      UPDATE invoices SET
        invoice_number=@invoiceNumber, client_name=@clientName, client_address=@clientAddress,
        issue_date=@issueDate, due_date=@dueDate, subtotal=@subtotal,
        total_amount=@totalAmount, memo=@memo
      WHERE id=@id
    `).run(data)

    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(data.id)
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const item of data.items) {
      insertItem.run(data.id, item.description, item.quantity, item.unitPrice, item.amount)
    }
  })
  update()
})

// 帳票：P/L集計
ipcMain.handle('reports:pl', (_, year: number) => {
  return getDb().prepare(`
    SELECT a.name as account_name, a.category, SUM(jl.amount) as amount
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) = ?
      AND a.category IN ('revenue', 'expense')
      AND (
        (a.category = 'revenue' AND jl.type = 'credit') OR
        (a.category = 'expense' AND jl.type = 'debit')
      )
    GROUP BY a.id
    ORDER BY a.code
  `).all(String(year))
})

// 帳票：B/S集計
ipcMain.handle('reports:bs', (_, year: number) => {
  return getDb().prepare(`
    SELECT a.name as account_name, a.category, a.code,
      SUM(CASE WHEN jl.type = 'debit'  THEN jl.amount ELSE 0 END) -
      SUM(CASE WHEN jl.type = 'credit' THEN jl.amount ELSE 0 END) as balance
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) <= ?
      AND a.category IN ('asset', 'liability', 'equity')
    GROUP BY a.id
    HAVING balance != 0
    ORDER BY a.code
  `).all(String(year))
})

// 総勘定元帳
ipcMain.handle('reports:ledger', (_, year: number) => {
  const db = getDb()

  // 勘定科目ごとの取引一覧
  const accounts = db.prepare(`
    SELECT DISTINCT a.id, a.code, a.name, a.category
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) = ?
    ORDER BY a.code
  `).all(String(year)) as { id: number; code: string; name: string; category: string }[]

  const result = accounts.map(account => {
    const lines = db.prepare(`
      SELECT
        j.date, j.description,
        jl.type,
        jl.amount,
        SUM(CASE WHEN jl2.type = 'debit'  THEN jl2.amount ELSE 0 END) -
        SUM(CASE WHEN jl2.type = 'credit' THEN jl2.amount ELSE 0 END) as running_balance
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id
      JOIN journal_lines jl2 ON jl2.journal_id <= jl.journal_id
        AND jl2.account_id = jl.account_id
      WHERE jl.account_id = ?
        AND strftime('%Y', j.date) = ?
      GROUP BY jl.id
      ORDER BY j.date, jl.id
    `).all(account.id, String(year))

    return { ...account, lines }
  })

  return result
})

// e-Tax転記ガイド
ipcMain.handle('reports:etaxGuide', (_, year: number) => {
  const db = getDb()

  const plRows = db.prepare(`
    SELECT a.name as account_name, a.category, a.code, SUM(jl.amount) as amount
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) = ?
      AND a.category IN ('revenue', 'expense')
      AND (
        (a.category = 'revenue' AND jl.type = 'credit') OR
        (a.category = 'expense' AND jl.type = 'debit')
      )
    GROUP BY a.id
    ORDER BY a.code
  `).all(String(year)) as { account_name: string; category: string; code: string; amount: number }[]

  const totalRevenue = plRows.filter(r => r.category === 'revenue').reduce((s, r) => s + r.amount, 0)
  const totalExpense = plRows.filter(r => r.category === 'expense').reduce((s, r) => s + r.amount, 0)
  const blueDeduction = 650000
  const businessIncome = Math.max(0, totalRevenue - totalExpense - blueDeduction)

  return {
    year,
    totalRevenue,
    totalExpense,
    blueDeduction,
    businessIncome,
    plRows,
  }
})

// 帳票：事業主借の不足分を集計
ipcMain.handle('reports:ownerLoanCheck', (_, year: number) => {
  const db = getDb()

  const personalPayments = db.prepare(`
    SELECT a.code, a.name, SUM(jl.amount) as total
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) = ?
      AND jl.type = 'credit'
      AND a.code IN ('1010', '1020', '1021')
    GROUP BY a.id
  `).all(String(year)) as { code: string; name: string; total: number }[]

  const registeredLoan = db.prepare(`
    SELECT SUM(jl.amount) as total
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    JOIN journals j ON j.id = jl.journal_id
    WHERE strftime('%Y', j.date) = ?
      AND jl.type = 'credit'
      AND a.code IN ('2091', '2092', '2093')
  `).get(String(year)) as { total: number | null }

  const totalPersonal = personalPayments.reduce((s, r) => s + r.total, 0)
  const totalRegistered = registeredLoan.total ?? 0
  const shortage = totalPersonal - totalRegistered

  return { totalPersonal, totalRegistered, shortage, personalPayments }
})

// 帳票：事業主借の不足分を自動登録
ipcMain.handle('reports:ownerLoanAutoRegister', (_, {
  year, shortage, accountCode
}: {
  year: number
  shortage: number
  accountCode: string
}) => {
  const db = getDb()
  const ownerLoanAccount = db.prepare(`SELECT id FROM accounts WHERE code = ?`).get(accountCode) as { id: number }
  const cashAccount = db.prepare(`SELECT id FROM accounts WHERE code = '1010'`).get() as { id: number }
  const date = `${year}-12-31`

  const insert = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO journals (date, description, memo, payment_method, currency)
      VALUES (?, ?, ?, 'bank', 'JPY')
    `).run(
      date,
      `事業主借 自動登録（${year}年分）`,
      `個人払い経費の事業主借不足分 ${shortage.toLocaleString()}円を自動登録`
    )

    const journalId = result.lastInsertRowid
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (journal_id, type, account_id, amount) VALUES (?, ?, ?, ?)
    `)
    insertLine.run(journalId, 'debit', cashAccount.id, shortage)
    insertLine.run(journalId, 'credit', ownerLoanAccount.id, shortage)
    return journalId
  })

  return insert()
})

// 為替レート取得（フランクフルトAPI → 七十七銀行 → 手動入力）
ipcMain.handle('exchange:getRate', async (_, date: string) => {
  const tryFrankfurt = async (targetDate: string): Promise<{ rate: number; source: string; date: string } | null> => {
    try {
      const res = await fetch(`https://api.frankfurter.app/${targetDate}?from=USD&to=JPY`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      if (!res.ok) return null
      const data = await res.json() as { rates?: { JPY?: number }; date?: string }
      if (data.rates?.JPY) {
        return {
          rate: data.rates.JPY,
          source: `ECB（欧州中央銀行）参考レート`,
          date: data.date ?? targetDate
        }
      }
      return null
    } catch {
      return null
    }
  }

  const trySeventySevenBank = async (targetDate: string): Promise<{ rate: number; source: string; date: string } | null> => {
    try {
      const year = targetDate.slice(0, 4)
      const month = String(parseInt(targetDate.slice(5, 7)))
      const day = String(parseInt(targetDate.slice(8, 10)))
      const targetComment = `${year}/${month}/${day}`

      const res = await fetch(`https://www.77bank.co.jp/kawase/usd${year}.html`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      const buffer = await res.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let html = ''
      for (let i = 0; i < bytes.length; i++) {
        if ((bytes[i] >= 0x20 && bytes[i] <= 0x7E) || bytes[i] === 0x0A || bytes[i] === 0x0D) {
          html += String.fromCharCode(bytes[i])
        } else {
          html += ' '
        }
      }

      const regex = new RegExp(`<!-+\\s*${targetComment.replace(/\//g, '\\/')}\\s*-+>([\\d.]+)`)
      const match = html.match(regex)
      if (match) {
        return {
          rate: parseFloat(match[1]),
          source: '七十七銀行 TTM',
          date: targetDate
        }
      }
      return null
    } catch {
      return null
    }
  }

  // 最大7日遡って取得
  const getPastDates = (baseDate: string, days: number): string[] => {
    const dates: string[] = []
    for (let i = 0; i <= days; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }
    return dates
  }

  const dates = getPastDates(date, 7)

  // ① フランクフルトAPIで当日から遡って取得
  for (const d of dates) {
    const result = await tryFrankfurt(d)
    if (result) {
      console.log(`Rate from Frankfurt: ${result.rate} (${result.date})`)
      return result
    }
  }

  // ② 七十七銀行で当日から遡って取得
  for (const d of dates) {
    const result = await trySeventySevenBank(d)
    if (result) {
      console.log(`Rate from 77bank: ${result.rate} (${result.date})`)
      return result
    }
  }

  // ③ 両方失敗
  console.log('All rate sources failed')
  return null
})

// 領収書
ipcMain.handle('receipt:select', async (_, { journalDate, description }: { journalDate: string; description: string }) => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    title: '領収書を選択',
    filters: [
      { name: '画像・PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf', 'webp'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const srcPath = result.filePaths[0]
  const ext = path.extname(srcPath)
  const dateStr = journalDate.replace(/-/g, '')
  const safeName = description.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20)
  const fileName = `${dateStr}_${safeName}${ext}`

  const destDir = path.join(app.getPath('userData'), 'exports', 'receipts', journalDate.slice(0, 4))
  fs.mkdirSync(destDir, { recursive: true })

  const destPath = path.join(destDir, fileName)
  fs.copyFileSync(srcPath, destPath)

  return destPath
})

ipcMain.handle('receipt:open', async (_, filePath: string) => {
  shell.openPath(filePath)
})

// データリセット
ipcMain.handle('data:reset', () => {
  const db = getDb()
  const reset = db.transaction(() => {
    db.prepare('DELETE FROM journal_lines').run()
    db.prepare('DELETE FROM journals').run()
    db.prepare('DELETE FROM invoice_items').run()
    db.prepare('DELETE FROM invoices').run()
    // オートインクリメントのリセット
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('journals','journal_lines','invoices','invoice_items')").run()
  })
  reset()
})

// 領収書パスの一括更新（移行用）
ipcMain.handle('receipt:migratePaths', () => {
  const db = getDb()
  const oldBase = 'C:\\Users\\infon\\freebo\\exports\\receipts\\'
  const newBase = path.join(app.getPath('userData'), 'exports', 'receipts') + '\\'

  const rows = db.prepare('SELECT id, receipt_path FROM journals WHERE receipt_path IS NOT NULL').all() as { id: number; receipt_path: string }[]

  let updated = 0
  for (const row of rows) {
    if (row.receipt_path.startsWith(oldBase)) {
      const newPath = row.receipt_path.replace(oldBase, newBase)
      db.prepare('UPDATE journals SET receipt_path = ? WHERE id = ?').run(newPath, row.id)
      updated++
    }
  }
  return updated
})

// 完全初期化
ipcMain.handle('data:fullReset', (_, deleteFiles: boolean) => {
  const db = getDb()

  const reset = db.transaction(() => {
    // 全データ削除
    db.prepare('DELETE FROM journal_lines').run()
    db.prepare('DELETE FROM journals').run()
    db.prepare('DELETE FROM invoice_items').run()
    db.prepare('DELETE FROM invoices').run()
    db.prepare('DELETE FROM depreciation_records').run()
    db.prepare('DELETE FROM fixed_assets').run()
    db.prepare('DELETE FROM accounts').run()
    db.prepare('DELETE FROM settings').run()
    db.prepare("DELETE FROM sqlite_sequence").run()
  })
  reset()

  // ファイル削除（オプション）
  if (deleteFiles) {
    const exportsDir = path.join(app.getPath('userData'), 'exports')
    try {
      if (fs.existsSync(exportsDir)) {
        fs.rmSync(exportsDir, { recursive: true, force: true })
      }
    } catch (e) {
      console.error('File deletion failed:', e)
    }
  }

  // DBを再初期化（勘定科目・設定のデフォルト値を再投入）
  seedIfEmpty()
  // seedIfEmptyは直接呼べないので、アプリ再起動を促す
})

// 固定資産
ipcMain.handle('assets:getAll', () => {
  return getDb().prepare('SELECT * FROM fixed_assets WHERE is_active = 1 ORDER BY acquired_date DESC').all()
})

ipcMain.handle('assets:create', (_, data: {
  name: string
  category: string
  acquiredDate: string
  acquisitionCost: number
  usefulLife: number
  depreciationRate: number
}) => {
  const result = getDb().prepare(`
    INSERT INTO fixed_assets (name, category, acquired_date, acquisition_cost, useful_life, depreciation_rate)
    VALUES (@name, @category, @acquiredDate, @acquisitionCost, @usefulLife, @depreciationRate)
  `).run(data)
  return result.lastInsertRowid
})

ipcMain.handle('assets:delete', (_, id: number) => {
  getDb().prepare('UPDATE fixed_assets SET is_active = 0 WHERE id = ?').run(id)
})

ipcMain.handle('assets:getDepreciation', (_, assetId: number) => {
  return getDb().prepare('SELECT * FROM depreciation_records WHERE asset_id = ? ORDER BY year').all(assetId)
})

ipcMain.handle('assets:registerDepreciation', (_, {
  assetId, year, amount
}: {
  assetId: number
  year: number
  amount: number
}) => {
  const db = getDb()

  // 既に登録済みか確認
  const existing = db.prepare('SELECT id FROM depreciation_records WHERE asset_id = ? AND year = ?').get(assetId, year)
  if (existing) throw new Error('この年度の償却はすでに登録されています')

  // 資産情報を取得
  const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(assetId) as {
    name: string
    acquisition_cost: number
  }

  // 減価償却費の勘定科目を取得（なければ雑費）
  const depAccount = db.prepare(`SELECT id FROM accounts WHERE name LIKE '%減価償却%'`).get() as { id: number } | undefined
  const expenseAccountId = depAccount?.id ?? (db.prepare(`SELECT id FROM accounts WHERE code='5190'`).get() as { id: number }).id

  // 減価償却累計額の勘定科目を取得（なければ固定資産から直接減らす）
  const insert = db.transaction(() => {
    // 仕訳を作成
    const journalResult = db.prepare(`
      INSERT INTO journals (date, description, memo, payment_method, currency)
      VALUES (?, ?, ?, 'bank', 'JPY')
    `).run(
      `${year}-12-31`,
      `減価償却費（${asset.name}）`,
      `${year}年分 定額法 ${amount.toLocaleString()}円`
    )

    const journalId = journalResult.lastInsertRowid

    // 借方：減価償却費
    db.prepare(`INSERT INTO journal_lines (journal_id, type, account_id, amount) VALUES (?, 'debit', ?, ?)`).run(journalId, expenseAccountId, amount)

    // 貸方：固定資産（資産を直接減らす）
    const assetAccount = db.prepare(`SELECT id FROM accounts WHERE name LIKE '%工具%' OR name LIKE '%備品%' OR code='1040'`).get() as { id: number } | undefined
    const creditAccountId = assetAccount?.id ?? expenseAccountId
    db.prepare(`INSERT INTO journal_lines (journal_id, type, account_id, amount) VALUES (?, 'credit', ?, ?)`).run(journalId, creditAccountId, amount)

    // 償却記録を保存
    db.prepare(`
      INSERT INTO depreciation_records (asset_id, year, amount, journal_id)
      VALUES (?, ?, ?, ?)
    `).run(assetId, year, amount, journalId)

    return journalId
  })

  return insert()
})

// 領収書一覧
ipcMain.handle('receipt:getAll', () => {
  const rows = getDb().prepare(`
    SELECT j.id, j.date, j.description, j.receipt_path, j.payment_method,
      GROUP_CONCAT(
        CASE WHEN jl.type = 'debit' AND a.category = 'expense' THEN a.name END
      ) as expense_name,
      SUM(CASE WHEN jl.type = 'debit' AND a.category = 'expense' THEN jl.amount ELSE 0 END) as amount
    FROM journals j
    LEFT JOIN journal_lines jl ON jl.journal_id = j.id
    LEFT JOIN accounts a ON a.id = jl.account_id
    WHERE j.receipt_path IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM journal_lines jl2
      JOIN accounts a2 ON a2.id = jl2.account_id
      WHERE jl2.journal_id = j.id
      AND jl2.type = 'debit'
      AND a2.category = 'expense'
    )
    GROUP BY j.id
    ORDER BY j.date DESC
  `).all()
  return rows
})

ipcMain.handle('receipt:openFolder', () => {
  const dir = path.join(app.getPath('userData'), 'exports', 'receipts')
  fs.mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
})

ipcMain.handle('invoice:openFolder', (_, year: number) => {
  const dir = path.join(app.getPath('userData'), 'exports', String(year), 'invoices')
  fs.mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
})


// PDF出力
ipcMain.handle('pdf:export', async (_, { fileName, year, type, data }: {
  fileName: string
  year: number
  type: 'pl' | 'bs' | 'ledger' | 'invoice'
  data: unknown
}) => {
  // 請求書は専用フォルダへ
  const exportsDir = type === 'invoice'
    ? path.join(app.getPath('userData'), 'exports', String(year), 'invoices')
    : path.join(app.getPath('userData'), 'exports', String(year))

  fs.mkdirSync(exportsDir, { recursive: true })
  const filePath = path.join(exportsDir, fileName)

  // 印刷用HTMLを生成
  const html = generatePrintHtml(type, data, year)

  // 一時HTMLファイルに書き出し
  const tmpHtml = path.join(app.getPath('temp'), 'freebo_print.html')
  fs.writeFileSync(tmpHtml, html, 'utf-8')

  // 非表示ウィンドウでPDF生成
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { javascript: true }
  })

  await printWin.loadURL(`file://${tmpHtml}`)
  await new Promise(resolve => setTimeout(resolve, 500))

  const pdfBuffer = await printWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  })

  printWin.close()
  fs.writeFileSync(filePath, pdfBuffer)
  shell.openPath(filePath) 

  return filePath
})

function generatePrintHtml(type: string, data: unknown, year: number): string {
  const baseStyle = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Meiryo', 'Yu Gothic', sans-serif; font-size: 11px; color: #1a1d2e; padding: 20px; }
      h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
      h2 { font-size: 13px; font-weight: 700; margin: 16px 0 8px; color: #3b6fe0; border-bottom: 2px solid #3b6fe0; padding-bottom: 4px; }
      h3 { font-size: 12px; font-weight: 700; margin: 12px 0 6px; color: #d94f4f; border-bottom: 1px solid #d94f4f; padding-bottom: 2px; }
      .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1a1d2e; padding-bottom: 12px; }
      .subtitle { font-size: 12px; color: #5a6080; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #eef0f7; color: #5a6080; font-size: 10px; text-align: left; padding: 6px 8px; border-bottom: 1px solid #dde0ef; }
      td { padding: 6px 8px; border-bottom: 1px solid #dde0ef; }
      tr:last-child td { border-bottom: none; }
      .amount { text-align: right; font-variant-numeric: tabular-nums; }
      .total td { font-weight: 700; background: #f5f6fa; border-top: 2px solid #dde0ef; }
      .net td { font-weight: 700; font-size: 14px; }
      .page-break { page-break-before: always; }
      .section { margin-bottom: 24px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .badge-debit { display: inline-block; padding: 1px 6px; border-radius: 99px; background: rgba(59,111,224,0.1); color: #3b6fe0; font-size: 10px; }
      .badge-credit { display: inline-block; padding: 1px 6px; border-radius: 99px; background: rgba(40,168,112,0.1); color: #28a870; font-size: 10px; }
    </style>
  `

  const fmt = (n: number) => n.toLocaleString('ja-JP') + ' 円'

  if (type === 'pl') {
    const rows = data as { account_name: string; category: string; amount: number }[]
    const revenues = rows.filter(r => r.category === 'revenue')
    const expenses = rows.filter(r => r.category === 'expense')
    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0)
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0)
    const netIncome = totalRevenue - totalExpense

    return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
      <div class="header">
        <div>
          <h1>損益計算書（P/L）</h1>
          <div class="subtitle">${year}年 1月1日 〜 ${year}年 12月31日</div>
        </div>
        <div class="subtitle">freebo 出力日：${new Date().toLocaleDateString('ja-JP')}</div>
      </div>
      <div class="section">
        <h2>収益</h2>
        <table>
          <thead><tr><th>勘定科目</th><th class="amount">金額</th></tr></thead>
          <tbody>
            ${revenues.map(r => `<tr><td>${r.account_name}</td><td class="amount">${fmt(r.amount)}</td></tr>`).join('')}
            <tr class="total"><td>収益合計</td><td class="amount">${fmt(totalRevenue)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <h3>費用</h3>
        <table>
          <thead><tr><th>勘定科目</th><th class="amount">金額</th></tr></thead>
          <tbody>
            ${expenses.map(r => `<tr><td>${r.account_name}</td><td class="amount">${fmt(r.amount)}</td></tr>`).join('')}
            <tr class="total"><td>費用合計</td><td class="amount">${fmt(totalExpense)}</td></tr>
          </tbody>
        </table>
      </div>
      <table>
        <tbody>
          <tr class="net"><td>当期純利益</td><td class="amount" style="color:${netIncome >= 0 ? '#28a870' : '#d94f4f'}">${fmt(netIncome)}</td></tr>
        </tbody>
      </table>
    </body></html>`
  }

  if (type === 'bs') {
    const rows = data as { account_name: string; category: string; code: string; balance: number }[]
    const assets      = rows.filter(r => r.category === 'asset')
    const liabilities = rows.filter(r => r.category === 'liability')
    const equity      = rows.filter(r => r.category === 'equity')
    const totalAssets      = assets.reduce((s, r) => s + r.balance, 0)
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0)
    const totalEquity      = equity.reduce((s, r) => s + r.balance, 0)

    return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
      <div class="header">
        <div>
          <h1>貸借対照表（B/S）</h1>
          <div class="subtitle">${year}年 12月31日 現在</div>
        </div>
        <div class="subtitle">freebo 出力日：${new Date().toLocaleDateString('ja-JP')}</div>
      </div>
      <div class="grid">
        <div>
          <h2>資産の部</h2>
          <table>
            <thead><tr><th>勘定科目</th><th class="amount">残高</th></tr></thead>
            <tbody>
              ${assets.map(r => `<tr><td>${r.account_name}</td><td class="amount">${fmt(r.balance)}</td></tr>`).join('')}
              <tr class="total"><td>資産合計</td><td class="amount">${fmt(totalAssets)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2 style="color:#d94f4f;border-color:#d94f4f">負債の部</h2>
          <table>
            <thead><tr><th>勘定科目</th><th class="amount">残高</th></tr></thead>
            <tbody>
              ${liabilities.map(r => `<tr><td>${r.account_name}</td><td class="amount">${fmt(r.balance)}</td></tr>`).join('')}
              <tr class="total"><td>負債合計</td><td class="amount">${fmt(totalLiabilities)}</td></tr>
            </tbody>
          </table>
          <h2 style="color:#28a870;border-color:#28a870;margin-top:16px">資本の部</h2>
          <table>
            <thead><tr><th>勘定科目</th><th class="amount">残高</th></tr></thead>
            <tbody>
              ${equity.map(r => `<tr><td>${r.account_name}</td><td class="amount">${fmt(r.balance)}</td></tr>`).join('')}
              <tr class="total"><td>資本合計</td><td class="amount">${fmt(totalEquity)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </body></html>`
  }

  if (type === 'ledger') {
    const accounts = data as { id: number; code: string; name: string; category: string; lines: { date: string; description: string; type: string; amount: number; running_balance: number }[] }[]

    const categoryLabel: Record<string, string> = { asset: '資産', liability: '負債', equity: '資本', revenue: '収益', expense: '費用' }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
      <div class="header">
        <div>
          <h1>総勘定元帳</h1>
          <div class="subtitle">${year}年 1月1日 〜 ${year}年 12月31日</div>
        </div>
        <div class="subtitle">freebo 出力日：${new Date().toLocaleDateString('ja-JP')}</div>
      </div>
      ${accounts.map((account, i) => `
        ${i > 0 ? '<div class="page-break"></div>' : ''}
        <div class="section">
          <h2>${account.name}（${account.code}）<span style="font-weight:normal;font-size:11px;color:#5a6080;margin-left:8px">${categoryLabel[account.category] ?? ''}</span></h2>
          <table>
            <thead>
              <tr>
                <th style="width:90px">日付</th>
                <th>摘要</th>
                <th style="width:60px;text-align:center">区分</th>
                <th class="amount" style="width:110px">金額</th>
                <th class="amount" style="width:120px">残高</th>
              </tr>
            </thead>
            <tbody>
              ${account.lines.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#5a6080">取引なし</td></tr>'
                : account.lines.map(l => `
                  <tr>
                    <td>${l.date}</td>
                    <td>${l.description}</td>
                    <td style="text-align:center"><span class="${l.type === 'debit' ? 'badge-debit' : 'badge-credit'}">${l.type === 'debit' ? '借方' : '貸方'}</span></td>
                    <td class="amount">${l.amount.toLocaleString('ja-JP')} 円</td>
                    <td class="amount" style="color:${l.running_balance < 0 ? '#d94f4f' : 'inherit'}">${l.running_balance.toLocaleString('ja-JP')} 円</td>
                  </tr>
                `).join('')
              }
              ${account.lines.length > 0 ? `
                <tr class="total">
                  <td colspan="3">合計</td>
                  <td class="amount">${account.lines.reduce((s, l) => s + l.amount, 0).toLocaleString('ja-JP')} 円</td>
                  <td class="amount">${(account.lines[account.lines.length - 1]?.running_balance ?? 0).toLocaleString('ja-JP')} 円</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      `).join('')}
    </body></html>`
  }

 if (type === 'invoice') {
    const inv = data as {
      invoice_number: string
      client_name: string
      client_address: string
      issue_date: string
      due_date: string
      total_amount: number
      memo: string
      items: { description: string; quantity: number; unit_price: number; amount: number }[]
    }

    // 設定から発行者情報を取得
    const settings = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const s = Object.fromEntries(settings.map(r => [r.key, r.value]))

    const issuerName = s.businessName ? `${s.businessName}　${s.ownerName}` : s.ownerName
    const hasBank = s.bankName && s.bankNumber && s.bankHolder

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Meiryo', 'Yu Gothic', sans-serif; font-size: 11px; color: #1a1a1a; background: white; padding: 32px; }
        .title { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 24px; letter-spacing: 8px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
        .header { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
        .client-name { font-size: 18px; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #1a1a1a; padding-bottom: 4px; }
        .client-address { font-size: 11px; color: #555; margin-top: 4px; }
        .total-box { border: 2px solid #1a1a1a; padding: 12px 16px; margin-top: 8px; }
        .total-box .label { font-size: 11px; color: #555; margin-bottom: 4px; }
        .total-box .amount { font-size: 22px; font-weight: 700; }
        .info-table { width: 100%; border-collapse: collapse; }
        .info-table td { padding: 4px 8px; font-size: 11px; border-bottom: 1px solid #eee; }
        .info-table td:first-child { color: #555; width: 80px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f0f0f0; color: #333; font-size: 11px; text-align: left; padding: 8px 10px; border: 1px solid #ccc; }
        td { padding: 8px 10px; border: 1px solid #ddd; font-size: 11px; }
        .amount { text-align: right; font-variant-numeric: tabular-nums; }
        .total-row td { font-weight: 700; background: #f8f8f8; border-top: 2px solid #1a1a1a; }
        .issuer { margin-top: 24px; padding: 16px; border: 1px solid #ccc; background: #fafafa; }
        .issuer-title { font-size: 11px; color: #555; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .issuer-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        .issuer-info { font-size: 11px; color: #333; line-height: 1.8; }
        .bank-box { margin-top: 16px; padding: 12px 16px; border: 1px solid #ccc; background: #fafafa; }
        .bank-title { font-size: 11px; color: #555; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .bank-info { font-size: 12px; color: #1a1a1a; line-height: 2; }
        .memo-box { margin-top: 16px; padding: 12px; border: 1px solid #ddd; background: #fafafa; }
        .memo-title { font-size: 11px; color: #555; margin-bottom: 4px; }
      </style>
    </head><body>
      <div class="title">請　求　書</div>

      <div class="header">
        <!-- 左：クライアント情報 -->
        <div>
          <div class="client-name">${inv.client_name}　御中</div>
          ${inv.client_address ? `<div class="client-address">${inv.client_address}</div>` : ''}
          <div class="total-box" style="margin-top:16px">
            <div class="label">ご請求金額</div>
            <div class="amount">¥ ${inv.total_amount.toLocaleString('ja-JP')} -</div>
          </div>
        </div>

        <!-- 右：請求書情報 -->
        <div>
          <table class="info-table">
            <tr><td>請求書番号</td><td>${inv.invoice_number}</td></tr>
            <tr><td>発行日</td><td>${inv.issue_date}</td></tr>
            <tr><td>支払期限</td><td>${inv.due_date}</td></tr>
          </table>

          <!-- 発行者情報 -->
          <div class="issuer" style="margin-top:12px">
            <div class="issuer-title">発行者</div>
            <div class="issuer-name">${issuerName || '（設定画面で氏名を入力してください）'}</div>
            <div class="issuer-info">
              ${s.postalCode ? `〒${s.postalCode}<br>` : ''}
              ${s.address ? `${s.address}<br>` : ''}
              ${s.phone ? `TEL: ${s.phone}<br>` : ''}
              ${s.email ? `Email: ${s.email}` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- 明細 -->
      <table>
        <thead>
          <tr>
            <th>品目・摘要</th>
            <th style="width:60px;text-align:center">数量</th>
            <th class="amount" style="width:120px">単価</th>
            <th class="amount" style="width:120px">金額</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map(it => `
            <tr>
              <td>${it.description}</td>
              <td style="text-align:center">${it.quantity}</td>
              <td class="amount">¥ ${it.unit_price.toLocaleString('ja-JP')}</td>
              <td class="amount">¥ ${it.amount.toLocaleString('ja-JP')}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align:right">合計金額</td>
            <td class="amount">¥ ${inv.total_amount.toLocaleString('ja-JP')} -</td>
          </tr>
        </tbody>
      </table>

      <!-- 振込先 -->
      ${hasBank ? `
        <div class="bank-box">
          <div class="bank-title">お振込先</div>
          <div class="bank-info">
            ${s.bankName}　${s.bankBranch}<br>
            ${s.bankType}預金　${s.bankNumber}<br>
            口座名義：${s.bankHolder}
          </div>
        </div>
      ` : `
        <div class="bank-box" style="color:#d94f4f">
          ⚠️ 振込先情報が未設定です。設定画面から振込先を入力してください。
        </div>
      `}

      <!-- 備考 -->
      ${inv.memo ? `
        <div class="memo-box">
          <div class="memo-title">備考</div>
          <div>${inv.memo}</div>
        </div>
      ` : ''}
    </body></html>`
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body><p>不明なタイプです</p></body></html>`
}

// ==============================
// バックアップ
// ==============================

async function checkAutoBackup(): Promise<void> {
  const db = getDb()
  const autoEnabled = db.prepare("SELECT value FROM settings WHERE key = 'backupAutoEnabled'").get() as { value: string } | undefined
  if (!autoEnabled || autoEnabled.value !== 'true') return

  const autoDay = parseInt(
    (db.prepare("SELECT value FROM settings WHERE key = 'backupAutoDay'").get() as { value: string } | undefined)?.value ?? '1'
  )
  const today = new Date()

  // 当月すでに自動バックアップ済みか確認
  const row = db.prepare("SELECT value FROM settings WHERE key = 'backupHistory'").get() as { value: string } | undefined
  const entries = row ? JSON.parse(row.value) : []
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const alreadyDone = entries.some((e: { date: string; type: string }) =>
    e.type === 'auto' && e.date.startsWith(thisMonth)
  )
  if (alreadyDone) return

  // 設定日を過ぎていなければスキップ
  if (today.getDate() < autoDay) return

  // 自動バックアップ実行
  const backupDir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const timestamp = today.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `freebo_backup_${timestamp}_auto.db`
  const destPath = path.join(backupDir, fileName)
  const srcPath = path.join(app.getPath('userData'), 'freebo.db')
  fs.copyFileSync(srcPath, destPath)

  const newEntry = {
    fileName,
    path: destPath,
    date: today.toISOString(),
    type: 'auto',
    size: fs.statSync(destPath).size,
  }
  entries.unshift(newEntry)
  if (entries.length > 20) entries.pop()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backupHistory', ?)").run(JSON.stringify(entries))

  console.log(`Auto backup created: ${fileName}`)
}

ipcMain.handle('backup:create', (_, manual: boolean) => {
  const backupDir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })

  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const type = manual ? 'manual' : 'auto'
  const fileName = `freebo_backup_${timestamp}_${type}.db`
  const destPath = path.join(backupDir, fileName)
  const srcPath = path.join(app.getPath('userData'), 'freebo.db')
  fs.copyFileSync(srcPath, destPath)

  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'backupHistory'").get() as { value: string } | undefined
  const entries = row ? JSON.parse(row.value) : []
  const newEntry = {
    fileName,
    path: destPath,
    date: now.toISOString(),
    type,
    size: fs.statSync(destPath).size,
  }
  entries.unshift(newEntry)
  if (entries.length > 20) entries.pop()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backupHistory', ?)").run(JSON.stringify(entries))

  return newEntry
})

ipcMain.handle('backup:getHistory', () => {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'backupHistory'").get() as { value: string } | undefined
  return row ? JSON.parse(row.value) : []
})

ipcMain.handle('backup:restore', (_, filePath: string) => {
  const srcPath = path.join(app.getPath('userData'), 'freebo.db')
  fs.copyFileSync(filePath, srcPath)
})

ipcMain.handle('backup:delete', (_, fileName: string) => {
  const db = getDb()
  const backupDir = path.join(app.getPath('userData'), 'backups')
  const filePath = path.join(backupDir, fileName)

  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (e) {
    console.error('Backup delete failed:', e)
  }

  const row = db.prepare("SELECT value FROM settings WHERE key = 'backupHistory'").get() as { value: string } | undefined
  const entries = row ? JSON.parse(row.value) : []
  const filtered = entries.filter((e: { fileName: string }) => e.fileName !== fileName)
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backupHistory', ?)").run(JSON.stringify(filtered))
})

ipcMain.handle('backup:deleteAll', () => {
  const db = getDb()
  const backupDir = path.join(app.getPath('userData'), 'backups')

  try {
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
  } catch (e) {
    console.error('Backup deleteAll failed:', e)
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backupHistory', '[]')").run()
})

ipcMain.handle('backup:openFolder', () => {
  const backupDir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  shell.openPath(backupDir)
})



// ==============================
// アプリ起動
// ==============================

app.whenReady().then(() => {
  initDb()

  electronApp.setAppUserModelId('com.freebo')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // 自動バックアップチェック（起動3秒後に実行）
  setTimeout(() => checkAutoBackup(), 3000)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
