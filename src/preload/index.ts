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
})