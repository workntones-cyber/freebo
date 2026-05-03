import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { schema, defaultAccounts } from './schema'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('DB未初期化')
  }
  return db
}

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'freebo.db')
  db = new Database(dbPath)

  // パフォーマンス設定
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // テーブル作成
  db.exec(schema)

  // マイグレーション：既存DBへのカラム追加
  const migrate = db.transaction(() => {
    const columns = (db.prepare(`PRAGMA table_info(journals)`).all() as { name: string }[]).map(c => c.name)

    if (!columns.includes('payment_method')) {
      db.exec(`ALTER TABLE journals ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'`)
    }
    if (!columns.includes('currency')) {
      db.exec(`ALTER TABLE journals ADD COLUMN currency TEXT NOT NULL DEFAULT 'JPY'`)
    }
    if (!columns.includes('original_amount')) {
      db.exec(`ALTER TABLE journals ADD COLUMN original_amount REAL`)
    }
    if (!columns.includes('exchange_rate')) {
      db.exec(`ALTER TABLE journals ADD COLUMN exchange_rate REAL`)
    }
    if (!columns.includes('is_settled')) {
      db.exec(`ALTER TABLE journals ADD COLUMN is_settled INTEGER NOT NULL DEFAULT 0`)
    }
    if (!columns.includes('settled_at')) {
      db.exec(`ALTER TABLE journals ADD COLUMN settled_at TEXT`)
    }
  })
  migrate()

  // 初回のみデフォルトデータを投入
  seedIfEmpty()
}

function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number }).count
  if (count > 0) return

  const insert = db.prepare(`
    INSERT INTO accounts (code, name, category, description, is_system, is_active)
    VALUES (@code, @name, @category, @description, @isSystem, 1)
  `)

  const insertMany = db.transaction(() => {
    for (const account of defaultAccounts) {
      insert.run({
        ...account,
        isSystem: account.isSystem ? 1 : 0
      })
    }
  })

  insertMany()

  // デフォルト設定
  const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  const defaults: [string, string][] = [
    ['businessName', ''],
    ['ownerName', ''],
    ['openDate', ''],
    ['invoiceRegistrationNumber', ''],
    ['taxMode', 'exempt'],
    ['declarationType', 'blue_65'],
    ['withholding', 'false'],
  ]

  const insertSettings = db.transaction(() => {
    for (const [key, value] of defaults) {
      setSetting.run(key, value)
    }
  })

  insertSettings()
}