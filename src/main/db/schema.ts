export const schema = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    is_system   INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS journals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    memo         TEXT,
    receipt_path TEXT,
    invoice_id   INTEGER,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS journal_lines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL CHECK(type IN ('debit','credit')),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    amount     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number    TEXT    NOT NULL UNIQUE,
    client_name       TEXT    NOT NULL,
    client_address    TEXT,
    issue_date        TEXT    NOT NULL,
    due_date          TEXT    NOT NULL,
    subtotal          INTEGER NOT NULL DEFAULT 0,
    total_amount      INTEGER NOT NULL DEFAULT 0,
    status            TEXT    NOT NULL DEFAULT 'draft',
    memo              TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description  TEXT    NOT NULL,
    quantity     REAL    NOT NULL DEFAULT 1,
    unit_price   INTEGER NOT NULL,
    amount       INTEGER NOT NULL
  );

    -- 固定資産
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

  -- 減価償却明細
  CREATE TABLE IF NOT EXISTS depreciation_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
    year            INTEGER NOT NULL,
    amount          INTEGER NOT NULL,
    journal_id      INTEGER,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`

export const defaultAccounts = [
  // 資産
  { code: '1010', name: '現金',       category: 'asset',    isSystem: true,  description: '財布の中の現金。コンビニや交通費など現金で払ったときに使います。' },
  { code: '1020', name: '普通預金',   category: 'asset',    isSystem: true,  description: '銀行口座のお金。振込入金や引き落としはここで管理します。' },
  { code: '1030', name: '売掛金',     category: 'asset',    isSystem: true,  description: '請求したけどまだ入金されていないお金。入金されたら普通預金に振り替えます。' },
  { code: '1040', name: '前払費用',   category: 'asset',    isSystem: false, description: '年間契約など、先払いした費用のうちまだサービスを受けていない分。' },
  { code: '1090', name: '事業主貸',   category: 'asset',    isSystem: true,  description: '事業のお金を生活費として使ったときに使う科目。給与の代わりと考えてください。' },
  // 負債
  { code: '2010', name: '未払金',     category: 'liability', isSystem: true,  description: 'クレジットカードで買った費用など、まだ支払っていないお金。引き落とし時に消えます。' },
  { code: '2020', name: '前受金',     category: 'liability', isSystem: false, description: '仕事が終わる前に受け取った着手金など。仕事完了後に売上に振り替えます。' },
  { code: '2090', name: '事業主借',   category: 'liability', isSystem: true,  description: '個人のお金を事業に入れたときに使う科目。事業主貸の逆です。' },
  // 資本
  { code: '3010', name: '元入金',     category: 'equity',   isSystem: true,  description: '事業を始めたときの元手のお金。会社でいう資本金にあたります。' },
  // 収益
  { code: '4010', name: '売上高',     category: 'revenue',  isSystem: true,  description: '受託開発やSESなど、本業の収入。請求書を発行したタイミングで計上します。' },
  { code: '4090', name: '雑収入',     category: 'revenue',  isSystem: false, description: 'アフィリエイト収入など、本業以外の収入。' },
  // 費用
  { code: '5010', name: '消耗品費',   category: 'expense',  isSystem: false, description: 'SaaSサブスク・写真素材・少額のソフトウェアなど10万円未満の物品や継続サービス。' },
  { code: '5020', name: '通信費',     category: 'expense',  isSystem: false, description: 'インターネット回線・スマホ代・ドメイン代・サーバー代など。' },
  { code: '5030', name: '旅費交通費', category: 'expense',  isSystem: false, description: '電車・バス・タクシー代、出張時の宿泊費など。' },
  { code: '5040', name: '新聞図書費', category: 'expense',  isSystem: false, description: '技術書・Udemy・オンライン学習サービスなど学習に使った費用。' },
  { code: '5045', name: '研修費', category: 'expense', isSystem: false, description: '資格取得・試験受験料・セミナー参加費など、スキルアップのための費用。' },
  { code: '5050', name: '会議費',     category: 'expense',  isSystem: false, description: 'クライアントとの打ち合わせ時のカフェ代など。一人の場合は交際費になります。' },
  { code: '5060', name: '接待交際費', category: 'expense',  isSystem: false, description: 'クライアントや取引先との食事代など。' },
  { code: '5070', name: '外注費',     category: 'expense',  isSystem: false, description: '他のフリーランスへの発注費用。' },
  { code: '5080', name: '地代家賃',   category: 'expense',  isSystem: false, description: '自宅兼事務所の家賃を事業用に按分した金額。' },
  { code: '5090', name: '水道光熱費', category: 'expense',  isSystem: false, description: '電気・水道代などを事業用に按分した金額。' },
  { code: '5190', name: '雑費',       category: 'expense',  isSystem: false, description: 'どれにも当てはまらない費用' },
  { code: '5195', name: '減価償却費', category: 'expense',  isSystem: false, description: '固定資産の減価償却費' },
  { code: '5196', name: '為替差損',   category: 'expense',  isSystem: false, description: '外貨建て取引の為替差損' },
]