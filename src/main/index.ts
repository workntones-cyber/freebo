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

    // バイト列から直接ASCII部分を抽出
    const bytes = new Uint8Array(buffer)
    let html = ''
    for (let i = 0; i < bytes.length; i++) {
      // ASCII範囲（0x20-0x7E）と改行のみ抽出
      if ((bytes[i] >= 0x20 && bytes[i] <= 0x7E) || bytes[i] === 0x0A || bytes[i] === 0x0D) {
        html += String.fromCharCode(bytes[i])
      } else {
        html += ' '  // 非ASCII文字はスペースに置換
      }
    }

    const idx = html.indexOf(targetComment)
    console.log('Index:', idx)
    if (idx >= 0) console.log('Context:', html.slice(idx - 10, idx + 30))

    const regex = new RegExp(`<!-+\\s*${targetComment.replace(/\//g, '\\/')}\\s*-+>([\\d.]+)`)
    const match = html.match(regex)
    console.log('Match:', match?.[1])

    if (match) return parseFloat(match[1])
    return null
  } catch (e) {
    console.error('Fetch error:', e)
    return null
  }
})

// 仕訳：引き落とし処理
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

  // 元の仕訳を取得
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

  // 未払金の金額（元の円換算額）
  const unpaidLine = lines.find(l => l.type === 'credit' && l.category === 'liability')
  if (!unpaidLine) throw new Error('未払金が見つかりません')

  const originalJPY = unpaidLine.amount
  const diff = settledAmount - originalJPY  // 為替差損益

  // 引き落とし仕訳を生成
  const settle = db.transaction(() => {
    // 元の仕訳を決済済みにする
    db.prepare(`
      UPDATE journals SET is_settled=1, settled_at=? WHERE id=?
    `).run(settledAt, journalId)

    // 引き落とし仕訳の明細を構成
    const newLines: { type: string; accountId: number; amount: number }[] = []

    // 未払金を借方に（元の金額）
    const unpaidAccountId = unpaidLine.account_id
    newLines.push({ type: 'debit', accountId: unpaidAccountId, amount: originalJPY })

    if (diff !== 0) {
      // 為替差損益の勘定科目を取得（なければ雑費で代用）
      const diffAccount = db.prepare(`SELECT id FROM accounts WHERE code='5195'`).get() as { id: number } | undefined
      const diffAccountId = diffAccount?.id ?? (db.prepare(`SELECT id FROM accounts WHERE code='5190'`).get() as { id: number }).id

      if (diff > 0) {
        // 為替差損（支払額が多い）→ 借方に追加
        newLines.push({ type: 'debit', accountId: diffAccountId, amount: diff })
      } else {
        // 為替差益（支払額が少ない）→ 貸方に追加
        newLines.push({ type: 'credit', accountId: diffAccountId, amount: Math.abs(diff) })
      }
    }

    // 普通預金を貸方に（実際の引き落とし額）
    const bankAccount = db.prepare(`SELECT id FROM accounts WHERE code='1020'`).get() as { id: number }
    newLines.push({ type: 'credit', accountId: bankAccount.id, amount: settledAmount })

    // 新しい仕訳を作成
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

// 仕訳：更新（支払方法・通貨情報含む）
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

// PDF出力
ipcMain.handle('pdf:export', async (event, { fileName, year }: { fileName: string; year: number }) => {
  const exportsDir = path.join(app.getAppPath(), 'exports', String(year))
  
  // フォルダ作成
  fs.mkdirSync(exportsDir, { recursive: true })

  const filePath = path.join(exportsDir, fileName)

  // PDF生成
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('ウィンドウが見つかりません')

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
  })

  fs.writeFileSync(filePath, pdfBuffer)

  // フォルダをエクスプローラーで開く
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