# freebo 📒

**フリーランスエンジニアのための、シンプルな会計ソフト**

青色申告65万円控除を目指す個人事業主・フリーランス向けに設計されたローカル動作の会計アプリです。

---

## ✨ 主な機能

### 仕訳入力
- **簡単入力モード** — 「支払った」「受け取った」を選ぶだけで仕訳を自動生成
- **詳細入力モード** — 借方・貸方を自由に入力できる上級者向けモード
- **外貨対応（USD）** — 支払日のレートを自動取得して円換算
- **消費税対応** — 課税事業者向けに仮払・仮受消費税を自動計上
- **クレカ・電子決済** — 引き落とし処理ボタンで決済仕訳を自動生成
- **領収書添付** — 仕訳に領収書ファイルを添付・管理

### 請求書
- 請求書の作成・PDF出力
- ステータス管理（下書き・送付済み・入金済み）
- インボイス番号対応（課税事業者向け）
- 消費税の自動計算（標準税率・軽減税率）

### 帳票
- 損益計算書（P/L）・貸借対照表（B/S）
- PDF出力・CSV出力
- 消費税サマリー（仮払・仮受・納税予定額）

### 総勘定元帳
- 勘定科目ごとの取引履歴・残高確認
- PDF出力

### 固定資産・減価償却
- 固定資産の登録・管理
- 定額法による減価償却スケジュール自動計算
- 減価償却仕訳の自動生成

### e-Taxガイド・税額シミュレーション
- 確定申告の準備チェックリスト
- 所得税・住民税・個人事業税の概算シミュレーション

### バックアップ・復旧
- 手動バックアップ・自動バックアップ（毎月指定日）
- バックアップ履歴からの2段階確認復旧

---

## 💻 動作環境

| 項目 | 内容 |
|---|---|
| OS | Windows 10 / 11（64bit） |
| 動作 | ローカル動作（インターネット不要） |
| データ保存先 | `C:\Users\[ユーザー名]\AppData\Roaming\freebo\` |

---

## 📥 ダウンロード・インストール

1. [Releases](https://github.com/workntones-cyber/freebo/releases) から最新版をダウンロード
2. `win-unpacked.zip` を解凍して任意のフォルダに配置
3. `freebo.exe` を実行

> ⚠️ Windows Defenderなどのセキュリティソフトが警告を表示する場合があります。「詳細情報」→「実行」で起動できます。コード署名は現在未対応です。

---

## 🚀 開発者向け

### 必要な環境
- Node.js 20以上
- npm

### セットアップ

```bash
git clone https://github.com/workntones-cyber/freebo.git
cd freebo
npm install
npm run dev
```

### ビルド

```bash
npm run build:win
```

`dist\win-unpacked\freebo.exe` が生成されます。

---

## ⚠️ 免責事項

- 本ソフトウェアは**参考用**です。確定申告・納税については税理士・税務署にご確認ください
- 計算結果の正確性を保証するものではありません
- 本ソフトウェアの使用によって生じた損害について、開発者は一切の責任を負いません

---

## 📝 技術スタック

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

## 📄 ライセンス

MIT License

---

## 👤 作者

[@workntones-cyber](https://github.com/workntones-cyber)
