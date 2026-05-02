import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, getDb } from './db'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
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
      INSERT INTO journals (date, description, memo, receipt_path, invoice_id)
      VALUES (@date, @description, @memo, @receiptPath, @invoiceId)
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

// P/L集計
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