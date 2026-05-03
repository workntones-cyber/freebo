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
  },

  // 請求書
  invoices: {
    getAll: () => ipcRenderer.invoke('invoices:getAll'),
    getById: (id: number) => ipcRenderer.invoke('invoices:getById', id),
    create: (data: unknown) => ipcRenderer.invoke('invoices:create', data),
    updateStatus: (id: number, status: string) => ipcRenderer.invoke('invoices:updateStatus', id, status),
  },

  // 帳票
  reports: {
    pl: (year: number) => ipcRenderer.invoke('reports:pl', year),
  },

  // PDF
  pdf: {
    export: (fileName: string, year: number) => ipcRenderer.invoke('pdf:export', { fileName, year }),
  },

  // 領収書
  receipt: {
    select: (data: { journalDate: string; description: string }) => ipcRenderer.invoke('receipt:select', data),
    open: (filePath: string) => ipcRenderer.invoke('receipt:open', filePath),
  },

  // 為替レート
  exchange: {
    getRate: (date: string) => ipcRenderer.invoke('exchange:getRate', date),
  },

})