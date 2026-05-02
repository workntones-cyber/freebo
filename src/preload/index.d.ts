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
}

declare global {
  interface Window {
    api: IApi
  }
}