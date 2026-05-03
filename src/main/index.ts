import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, getDb } from './db'
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
  return { ...journal, lines }
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
  journalId, settledAt, settledAmount, originalAmount, exchangeRate
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
  return { ...invoice, items }
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

// 為替レート取得
ipcMain.handle('exchange:getRate', async (_, date: string) => {
  console.log('exchange:getRate called', date)
  const year = date.slice(0, 4)
  const month = String(parseInt(date.slice(5, 7)))
  const day = String(parseInt(date.slice(8, 10)))
  const targetComment = `${year}/${month}/${day}`

  try {
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
    console.log('Target:', targetComment, 'Match:', match?.[1])

    if (match) return parseFloat(match[1])
    return null
  } catch (e) {
    console.error('Fetch error:', e)
    return null
  }
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

  const destDir = path.join(app.getAppPath(), 'exports', 'receipts', journalDate.slice(0, 4))
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

// PDF出力
ipcMain.handle('pdf:export', async (event, { fileName, year }: { fileName: string; year: number }) => {
  const exportsDir = path.join(app.getAppPath(), 'exports', String(year))
  fs.mkdirSync(exportsDir, { recursive: true })

  const filePath = path.join(exportsDir, fileName)

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('ウィンドウが見つかりません')

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
  })

  fs.writeFileSync(filePath, pdfBuffer)
  shell.openPath(exportsDir)

  return filePath
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

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
