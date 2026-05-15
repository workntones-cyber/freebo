import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // 設定
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },

  // 勘定科目
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    create: (data: unknown) => ipcRenderer.invoke('accounts:create', data),
    update: (data: unknown) => ipcRenderer.invoke('accounts:update', data),
    delete: (id: number) => ipcRenderer.invoke('accounts:delete', id),
  },

  // 仕訳
  journals: {
    getAll: (year: number) => ipcRenderer.invoke('journals:getAll', year),
    getById: (id: number) => ipcRenderer.invoke('journals:getById', id),
    create: (data: unknown) => ipcRenderer.invoke('journals:create', data),
    delete: (id: number) => ipcRenderer.invoke('journals:delete', id),
    // 仕訳追加分
    settle: (data: unknown) => ipcRenderer.invoke('journals:settle', data),
    update: (data: unknown) => ipcRenderer.invoke('journals:update', data),
    getYears: () => ipcRenderer.invoke('journals:getYears'),
  },

  // 請求書
  invoices: {
    getAll: () => ipcRenderer.invoke('invoices:getAll'),
    getById: (id: number) => ipcRenderer.invoke('invoices:getById', id),
    create: (data: unknown) => ipcRenderer.invoke('invoices:create', data),
    updateStatus: (id: number, status: string) => ipcRenderer.invoke('invoices:updateStatus', id, status),
    update: (data: unknown) => ipcRenderer.invoke('invoices:update', data),
    delete: (id: number) => ipcRenderer.invoke('invoices:delete', id),
    openFolder: (year: number) => ipcRenderer.invoke('invoice:openFolder', year),
  },

  // 帳票
  reports: {
    pl: (year: number) => ipcRenderer.invoke('reports:pl', year),
    bs: (year: number) => ipcRenderer.invoke('reports:bs', year),
    ownerLoanCheck: (year: number) => ipcRenderer.invoke('reports:ownerLoanCheck', year),
    ownerLoanAutoRegister: (data: unknown) => ipcRenderer.invoke('reports:ownerLoanAutoRegister', data),
    ledger: (year: number) => ipcRenderer.invoke('reports:ledger', year),
    etaxGuide: (year: number) => ipcRenderer.invoke('reports:etaxGuide', year),
  },

  // PDF
  pdf: {
    export: (fileName: string, year: number, type: string, data: unknown) =>
      ipcRenderer.invoke('pdf:export', { fileName, year, type, data }),
  },

  
  data: {
    reset: () => ipcRenderer.invoke('data:reset'),
    fullReset: (deleteFiles: boolean) => ipcRenderer.invoke('data:fullReset', deleteFiles),
  },

  // 領収書
  receipt: {
    select: (data: { journalDate: string; description: string }) => ipcRenderer.invoke('receipt:select', data),
    open: (filePath: string) => ipcRenderer.invoke('receipt:open', filePath),
    getAll: () => ipcRenderer.invoke('receipt:getAll'),
    openFolder: () => ipcRenderer.invoke('receipt:openFolder'),
    migratePaths: () => ipcRenderer.invoke('receipt:migratePaths'),
  },

    // 固定資産
  assets: {
    getAll: () => ipcRenderer.invoke('assets:getAll'),
    create: (data: unknown) => ipcRenderer.invoke('assets:create', data),
    delete: (id: number) => ipcRenderer.invoke('assets:delete', id),
    getDepreciation: (assetId: number) => ipcRenderer.invoke('assets:getDepreciation', assetId),
    registerDepreciation: (data: unknown) => ipcRenderer.invoke('assets:registerDepreciation', data),
  },

  // 為替レート
  exchange: {
    getRate: (date: string) => ipcRenderer.invoke('exchange:getRate', date),
  },

  // バックアップ
  backup: {
    create: (manual: boolean) => ipcRenderer.invoke('backup:create', manual),
    getHistory: () => ipcRenderer.invoke('backup:getHistory'),
    restore: (filePath: string) => ipcRenderer.invoke('backup:restore', filePath),
    delete: (fileName: string) => ipcRenderer.invoke('backup:delete', fileName),
    deleteAll: () => ipcRenderer.invoke('backup:deleteAll'),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  },
  // CSV
  csv: {
    export: (type: string, year: number, data: unknown[]) => ipcRenderer.invoke('csv:export', { type, year, data }),
  },
  navel: {
    sync: () => ipcRenderer.invoke('navel:sync'),
    isAvailable: () => ipcRenderer.invoke('navel:isAvailable'),
    onSynced: (callback: (count: number) => void) =>
      ipcRenderer.on('navel:synced', (_, count) => callback(count)),
  },
})