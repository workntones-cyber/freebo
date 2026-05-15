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
    if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_assets'`).get()) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fixed_assets (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          name            TEXT    NOT NULL,
          category        TEXT    NOT NULL,
          acquired_date   TEXT    NOT NULL,
          acquisition_cost INTEGER NOT NULL,
          useful_life     INTEGER NOT NULL,
          depreciation_rate REAL  NOT NULL,
          is_active       INTEGER NOT NULL DEFAULT 1,
          created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS depreciation_records (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id        INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
          year            INTEGER NOT NULL,
          amount          INTEGER NOT NULL,
          journal_id      INTEGER,
          created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
      `)
    }
    // navel連携カラム追加
    try { db.prepare(`ALTER TABLE invoices ADD COLUMN navel_billing_id INTEGER`).run() } catch {}
    try { db.prepare(`ALTER TABLE invoices ADD COLUMN navel_invoice_number TEXT`).run() } catch {}
    try { db.prepare(`ALTER TABLE invoices ADD COLUMN navel_synced_at TEXT`).run() } catch {}
  })
  migrate()

  // 初回のみデフォルトデータを投入
  seedIfEmpty()
}

export function seedIfEmpty(): void {
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
    ['postalCode', ''],
    ['address', ''],
    ['phone', ''],
    ['email', ''],
    ['bankName', ''],
    ['bankBranch', ''],
    ['bankType', '普通'],
    ['bankNumber', ''],
    ['bankHolder', ''],
    ['nationalHealthInsurance', '0'],
    ['nationalPension', '0'],
    ['lifeInsurance', '0'],
    ['medicalExpense', '0'],
    ['otherDeduction', '0'],
  ]

  const insertSettings = db.transaction(() => {
    for (const [key, value] of defaults) {
      setSetting.run(key, value)
    }
  })

  insertSettings()
}