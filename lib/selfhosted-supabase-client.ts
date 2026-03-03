type FilterOp = 'eq' | 'neq' | 'in' | 'ilike' | 'lt' | 'gt' | 'lte' | 'gte' | 'not' | 'or'

type Filter = {
  op: FilterOp
  column?: string
  value?: unknown
  values?: unknown[]
  notOperator?: string
}

type Order = {
  column: string
  ascending?: boolean
  nullsFirst?: boolean
}

type SelectOptions = {
  count?: 'exact'
  head?: boolean
}

type OperationPayload = {
  action: 'select' | 'insert' | 'update' | 'delete'
  table: string
  select?: string
  options?: SelectOptions
  filters: Filter[]
  orders: Order[]
  limit?: number
  rangeFrom?: number
  rangeTo?: number
  payload?: Record<string, unknown> | Record<string, unknown>[]
  singleMode?: 'single' | 'maybeSingle'
}

class QueryBuilder {
  private readonly op: OperationPayload

  constructor(action: OperationPayload['action'], table: string, payload?: OperationPayload['payload']) {
    this.op = { action, table, payload, filters: [], orders: [] }
  }

  select(columns = '*', options?: SelectOptions) {
    this.op.select = columns
    this.op.options = options
    return this
  }

  eq(column: string, value: unknown) {
    this.op.filters.push({ op: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown) {
    this.op.filters.push({ op: 'neq', column, value })
    return this
  }

  in(column: string, values: unknown[]) {
    this.op.filters.push({ op: 'in', column, values })
    return this
  }

  ilike(column: string, value: string) {
    this.op.filters.push({ op: 'ilike', column, value })
    return this
  }

  lt(column: string, value: unknown) {
    this.op.filters.push({ op: 'lt', column, value })
    return this
  }

  gt(column: string, value: unknown) {
    this.op.filters.push({ op: 'gt', column, value })
    return this
  }

  lte(column: string, value: unknown) {
    this.op.filters.push({ op: 'lte', column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.op.filters.push({ op: 'gte', column, value })
    return this
  }

  not(column: string, operator: string, value: unknown) {
    this.op.filters.push({ op: 'not', column, notOperator: operator, value })
    return this
  }

  or(expression: string) {
    this.op.filters.push({ op: 'or', value: expression })
    return this
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.op.orders.push({ column, ...options })
    return this
  }

  limit(value: number) {
    this.op.limit = value
    return this
  }

  range(from: number, to: number) {
    this.op.rangeFrom = from
    this.op.rangeTo = to
    return this
  }

  single() {
    this.op.singleMode = 'single'
    return this.execute()
  }

  maybeSingle() {
    this.op.singleMode = 'maybeSingle'
    return this.execute()
  }

  async execute(): Promise<{ data: unknown; error: unknown; count?: number | null }> {
    try {
      const res = await fetch('/api/internal/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(this.op),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: unknown; count?: number | null }
      if (!res.ok || json.error) {
        return { data: null, error: json.error || { message: `Request failed (${res.status})` }, count: json.count ?? null }
      }
      return { data: json.data ?? null, error: null, count: json.count ?? null }
    } catch (error) {
      return { data: null, error, count: null }
    }
  }

  then<TResult1 = { data: unknown; error: unknown; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(
      onfulfilled as ((value: { data: unknown; error: unknown; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | undefined,
      onrejected as ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined
    )
  }
}

export const supabase = {
  auth: {
    async getUser() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!res.ok) return { data: { user: null }, error: { message: 'Not authenticated' } }
        const json = (await res.json()) as { user?: unknown }
        return { data: { user: json.user || null }, error: null }
      } catch (error) {
        return { data: { user: null }, error }
      }
    },
    async getSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!res.ok) return { data: { session: null }, error: { message: 'Not authenticated' } }
        const json = (await res.json()) as { user?: Record<string, unknown> | null }
        return { data: { session: json.user ? { user: json.user } : null }, error: null }
      } catch (error) {
        return { data: { session: null }, error }
      }
    },
  },
  storage: {
    async listBuckets() {
      return { data: [{ name: 'application-documents' }], error: null }
    },
    async createBucket(name: string, opts?: Record<string, unknown>) {
      void name
      void opts
      return { data: { ok: true }, error: null }
    },
    from(bucket: string) {
      void bucket
      return {
        async upload(path: string, file: File | Blob, options?: Record<string, unknown>) {
          void path
          void file
          void options
          return { data: null, error: { message: 'Use uploadDocument() helper in self-hosted mode' } }
        },
        async remove(paths: string[]) {
          void paths
          return { data: null, error: null }
        },
        async download(path: string) {
          try {
            const url = path.startsWith('/') ? path : `/${path}`
            const res = await fetch(url)
            if (!res.ok) return { data: null, error: { message: `Download failed (${res.status})` } }
            return { data: await res.blob(), error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        getPublicUrl(path: string) {
          const normalized = path.startsWith('/') ? path : `/${path}`
          return { data: { publicUrl: normalized } }
        },
        async list() {
          return { data: [], error: null }
        },
      }
    },
  },
  from(table: string) {
    return {
      select(columns?: string, options?: SelectOptions) {
        return new QueryBuilder('select', table).select(columns, options)
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        return new QueryBuilder('insert', table, payload)
      },
      update(payload: Record<string, unknown>) {
        return new QueryBuilder('update', table, payload)
      },
      delete() {
        return new QueryBuilder('delete', table)
      },
    }
  },
}

