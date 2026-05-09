export interface IApi {
  settings: {
    getAll: () => Promise<Record<string, string>>
    set: (key: string, value: string) => Promise<void>
  }
  accounts: {
    getAll: () => Promise<unknown[]>
    create: (data: unknown) => Promise<number>
    update: (data: unknown) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  journals: {
    getAll: (year: number) => Promise<unknown[]>
    getById: (id: number) => Promise<unknown>
    create: (data: unknown) => Promise<number>
    delete: (id: number) => Promise<void>
    settle: (data: unknown) => Promise<number>
    update: (data: unknown) => Promise<void>
    getYears: () => Promise<number[]>
  }
  exchange: {
    getRate: (date: string) => Promise<{ rate: number; source: string; date: string } | null>
  }
  invoices: {
    getAll: () => Promise<unknown[]>
    getById: (id: number) => Promise<unknown>
    create: (data: unknown) => Promise<number>
    updateStatus: (id: number, status: string) => Promise<void>
    update: (data: unknown) => Promise<void>
    delete: (id: number) => Promise<void>
    openFolder: (year: number) => Promise<void>
  }
  reports: {
    pl: (year: number) => Promise<unknown[]>
    bs: (year: number) => Promise<unknown[]>
    ownerLoanCheck: (year: number) => Promise<unknown>
    ownerLoanAutoRegister: (data: unknown) => Promise<number>
    ledger: (year: number) => Promise<unknown[]>
    etaxGuide: (year: number) => Promise<unknown>
  }
  data: {
    reset: () => Promise<void>
    fullReset: (deleteFiles: boolean) => Promise<void>
  }
  pdf: {
    export: (fileName: string, year: number, type: string, data: unknown) => Promise<string>
  }
  receipt: {
    select: (data: { journalDate: string; description: string }) => Promise<string | null>
    open: (filePath: string) => Promise<void>
    getAll: () => Promise<unknown[]>
    openFolder: () => Promise<void>
    migratePaths: () => Promise<number>
  }
  assets: {
    getAll: () => Promise<unknown[]>
    create: (data: unknown) => Promise<number>
    delete: (id: number) => Promise<void>
    getDepreciation: (assetId: number) => Promise<unknown[]>
    registerDepreciation: (data: unknown) => Promise<number>
  }
  backup: {
    create: (manual: boolean) => Promise<{ fileName: string; path: string; date: string; type: string; size: number }>
    getHistory: () => Promise<{ fileName: string; path: string; date: string; type: string; size: number }[]>
    restore: (filePath: string) => Promise<void>
    delete: (fileName: string) => Promise<void>
    deleteAll: () => Promise<void>
    openFolder: () => Promise<void>
  }
}

declare global {
  interface Window {
    api: IApi
  }
}