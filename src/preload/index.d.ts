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
  }
  exchange: {
    getRate: (date: string) => Promise<number | null>
  }
  invoices: {
    getAll: () => Promise<unknown[]>
    getById: (id: number) => Promise<unknown>
    create: (data: unknown) => Promise<number>
    updateStatus: (id: number, status: string) => Promise<void>
  }
  reports: {
    pl: (year: number) => Promise<unknown[]>
  }
  pdf: {
    export: (fileName: string, year: number) => Promise<string>
  }
}

declare global {
  interface Window {
    api: IApi
  }
}