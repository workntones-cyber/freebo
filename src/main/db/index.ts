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